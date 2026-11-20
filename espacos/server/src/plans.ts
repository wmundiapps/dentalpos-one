// Plano SpaceHour: o locatário paga 6 ou 12 meses adiantados com 10% de desconto e recebe crédito (valor cheio)
// para pagar a locação. Regras em shared/rules.ts (PLAN_RULES) e docs/legal/pt-BR/prepaid-plan.md.
// - O crédito paga só a locação (valor base + limpeza). Corretor e zelador são cobrados à parte, sempre (nunca do caixa do plano).
// - Nas reservas do plano o dinheiro já está com o SpaceHour: o anfitrião recebe 80% do valor efetivamente pago, por Pix,
//   24 h depois do início (host_payouts). Com ASAAS_API_KEY o Pix sai sozinho; sem ela, a equipe paga e marca no Admin.
// - Reembolso: 7 dias sem uso = 100%; depois, valor pago menos o crédito usado a preço cheio; no fim da validade, automático.
import { HttpError, adminEmails } from './auth.js';
import { id, one, pool, rows, withTx, type Db } from './db.js';
import { notify } from './notify.js';
import { SUPPORT_EMAIL } from './mailer.js';
import { gatewayFor } from './payments/index.js';
import { mercadoPagoToken } from './payments/mercadopago.js';
import { autoPixEnabled, pixKeyType, sendPix } from './pix.js';
import * as repo from './repo.js';
import { FEES, PLAN_RULES, occurrenceEndUtc, occurrenceStartUtc, planQuote, planRefund, roundMoney } from '../../shared/rules.js';
import type { Booking, Listing, User } from '../../shared/types.js';

export const PLAN_TERMS_VERSION = '2026-11-20';
const APP_URL = () => (process.env.APP_URL ?? 'https://space-hour.com').replace(/\/$/, '');
const API_URL = () => (process.env.API_URL ?? APP_URL()).replace(/\/$/, '');
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const MP = 'https://api.mercadopago.com';

export interface PlanRow {
  id: string; user_id: string; months: number; monthly_amount: number; credit_total: number; price_paid: number; method: string;
  status: 'pending_payment' | 'active' | 'refunded' | 'cancelled' | 'expired'; provider: string | null; provider_ref: string | null;
  checkout_url: string | null; paid_at: Date | null; ends_at: Date | null; valid_until: Date | null; refund_amount: number | null;
  refund_rule: string | null; refunded_at: Date | null; created_at: Date;
}

let mpFetch: typeof fetch = (...a) => fetch(...a);
export function setPlanFetch(f?: typeof fetch) { mpFetch = f ?? ((...a) => fetch(...a)); }

/** Sem Mercado Pago (testes/desenvolvimento) o plano é pago na hora. */
const simulatedPayments = () => gatewayFor('BR').id === 'simulated' || !mercadoPagoToken('BR');

async function mp<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
  const r = await mpFetch(`${MP}${path}`, {
    method, headers: { Authorization: `Bearer ${mercadoPagoToken('BR')}`, 'Content-Type': 'application/json', ...(key ? { 'X-Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({})) as T & { message?: string };
  if (!r.ok) throw new HttpError(502, 'payment_provider_error', { message: data.message ?? String(r.status) });
  return data;
}

// ───────────── Saldo ─────────────
export const planCreditLeft = async (db: Db, planId: string) =>
  Number((await one<{ s: number }>(db, 'SELECT coalesce(sum(amount),0)::float AS s FROM plan_entries WHERE plan_id = $1', [planId]))?.s ?? 0);

/** Crédito usado (líquido): reservas menos o que voltou de cancelamentos. */
export const planCreditUsed = async (db: Db, planId: string) =>
  -Number((await one<{ s: number }>(db, "SELECT coalesce(sum(amount),0)::float AS s FROM plan_entries WHERE plan_id = $1 AND kind IN ('booking','booking_refund')", [planId]))?.s ?? 0);

export async function myPlans(user: User) {
  const plans = await rows<PlanRow>(pool, 'SELECT * FROM plans WHERE user_id = $1 ORDER BY created_at DESC', [user.id]);
  const out = [];
  for (const p of plans) {
    const left = await planCreditLeft(pool, p.id);
    const used = await planCreditUsed(pool, p.id);
    const entries = await rows(pool,
      `SELECT e.id, e.kind, e.amount::float AS amount, e.note, e.created_at, e.booking_id, l.title
         FROM plan_entries e LEFT JOIN bookings b ON b.id = e.booking_id LEFT JOIN listings l ON l.id = b.listing_id
        WHERE e.plan_id = $1 ORDER BY e.created_at DESC LIMIT 200`, [p.id]);
    const refundNow = p.status === 'active' && p.paid_at ? planRefund({ pricePaid: p.price_paid, creditUsed: used, paidAt: p.paid_at }) : null;
    out.push({ ...p, creditLeft: roundMoney(left, 'BRL'), creditUsed: roundMoney(used, 'BRL'), entries, refundNow });
  }
  const balance = out.filter((p) => p.status === 'active').reduce((s, p) => s + p.creditLeft, 0);
  return { plans: out, balance: roundMoney(balance, 'BRL') };
}

// ───────────── Compra ─────────────
export async function buyPlan(user: User, input: { months: number; monthly: number; method: 'pix' | 'card'; acceptTerms: boolean }, ip?: string) {
  if (!input.acceptTerms) throw new HttpError(422, 'plan_terms_required');
  if (!(PLAN_RULES.months as readonly number[]).includes(input.months)) throw new HttpError(422, 'plan_invalid_months');
  if (!(input.monthly >= PLAN_RULES.minMonthly && input.monthly <= PLAN_RULES.maxMonthly)) throw new HttpError(422, 'plan_invalid_amount', { min: PLAN_RULES.minMonthly, max: PLAN_RULES.maxMonthly });
  const q = planQuote(Math.round(input.monthly * 100) / 100, input.months);
  const planId = id('pln');
  await pool.query(
    `INSERT INTO plans (id, user_id, months, monthly_amount, credit_total, price_paid, method, status, terms_version, terms_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_payment',$8,$9)`,
    [planId, user.id, input.months, input.monthly, q.credit, q.price, input.method, PLAN_TERMS_VERSION, ip ?? null]);
  if (simulatedPayments()) {
    await activatePlan(planId, 'simulated', `sim_${planId}`);
  } else {
    const pref = await mp<{ id: string; init_point: string; sandbox_init_point: string }>('POST', '/checkout/preferences', {
      items: [{ id: planId, title: `Plano SpaceHour ${input.months} meses (crédito de ${brl(q.credit)})`, quantity: 1, currency_id: 'BRL', unit_price: q.price }],
      payer: { email: user.email, name: user.name },
      external_reference: planId,
      metadata: { plan_id: planId },
      back_urls: { success: `${APP_URL()}/planos?pago=1`, failure: `${APP_URL()}/planos`, pending: `${APP_URL()}/planos?pago=1` },
      auto_return: 'approved',
      notification_url: `${API_URL()}/api/webhooks/mercadopago`,
      statement_descriptor: 'SPACEHOUR',
      expires: true, expiration_date_to: new Date(Date.now() + (input.method === 'pix' ? 30 : 24 * 60) * 60000).toISOString(),
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], ...(input.method === 'pix' ? { default_payment_method_id: 'pix' } : {}) },
    }, `plan-${planId}`);
    const url = process.env.MP_SANDBOX === 'true' ? pref.sandbox_init_point : pref.init_point;
    await pool.query("UPDATE plans SET provider = 'mercadopago', checkout_url = $2 WHERE id = $1", [planId, url]);
  }
  return (await one<PlanRow>(pool, 'SELECT * FROM plans WHERE id = $1', [planId]))!;
}

/** Pagamento aprovado: o plano começa agora e o crédito entra no extrato. Idempotente. */
export async function activatePlan(planId: string, provider: string, providerRef: string) {
  return withTx(async (tx) => {
    const p = await one<PlanRow>(tx, 'SELECT * FROM plans WHERE id = $1 FOR UPDATE', [planId]);
    if (!p || p.status !== 'pending_payment') return;
    await tx.query(
      `UPDATE plans SET status = 'active', provider = $2, provider_ref = $3, checkout_url = NULL, paid_at = now(),
         ends_at = now() + make_interval(months => months), valid_until = now() + make_interval(months => months) + make_interval(days => $4) WHERE id = $1`,
      [planId, provider, providerRef, PLAN_RULES.graceDays]);
    await tx.query("INSERT INTO plan_entries (id, plan_id, kind, amount, note) VALUES ($1,$2,'purchase',$3,$4)",
      [id('ple'), planId, p.credit_total, `Plano de ${p.months} meses: pago ${brl(p.price_paid)} (10% de desconto)`]);
    await notify(tx, { userId: p.user_id }, 'plan_active',
      `Seu Plano SpaceHour está ativo! 🎉 Crédito de ${brl(p.credit_total)} para usar em locações por ${p.months} meses (pagou ${brl(p.price_paid)}). Na hora de reservar, escolha "Pagar com meu Plano".`, '/planos');
    const team = adminEmails().length ? adminEmails() : [SUPPORT_EMAIL()];
    for (const email of team) await notify(tx, { email }, 'admin_plan_paid', `Plano SpaceHour pago: ${brl(p.price_paid)} (${p.months} meses, crédito ${brl(p.credit_total)}).`, '/admin/financeiro');
  });
}

/** Aviso do Mercado Pago sobre um pagamento de plano (external_reference = id do plano). */
export async function applyPlanPayment(u: { paymentId: string; outcome: string; providerRef?: string }) {
  if (u.outcome === 'captured' || u.outcome === 'authorized') return activatePlan(u.paymentId, 'mercadopago', u.providerRef ?? '');
  if (u.outcome === 'failed' || u.outcome === 'expired') await pool.query("UPDATE plans SET status = 'cancelled', checkout_url = NULL WHERE id = $1 AND status = 'pending_payment'", [u.paymentId]);
}

// ───────────── Uso nas reservas ─────────────
/** Plano ativo com crédito suficiente e válido até o fim da reserva. */
export async function pickPlan(db: Db, userId: string, amount: number, lastEnd: Date) {
  const list = await rows<PlanRow>(db, "SELECT * FROM plans WHERE user_id = $1 AND status = 'active' AND valid_until >= $2 ORDER BY valid_until FOR UPDATE", [userId, lastEnd]);
  for (const p of list) if ((await planCreditLeft(db, p.id)) + 1e-6 >= amount) return p;
  return undefined;
}

/** Debita o crédito da locação. A reserva guarda o plano usado e o valor em dinheiro (para o repasse do anfitrião). */
export async function debitBooking(db: Db, guest: User, b: Booking, l: Listing) {
  if (!l.acceptsPlan) throw new HttpError(422, 'plan_not_accepted');
  if (!(await one(db, 'SELECT 1 FROM pix_accounts WHERE user_id = $1', [l.hostId]))) throw new HttpError(422, 'plan_not_accepted');
  const credit = b.price.planCredit!;
  const lastEnd = new Date(Math.max(...b.occurrences.map((o) => occurrenceEndUtc(l, o).getTime())));
  const plan = await pickPlan(db, guest.id, credit, lastEnd);
  if (!plan) throw new HttpError(422, 'plan_insufficient_credit');
  b.price.planId = plan.id;
  // O preço é gravado só na criação da reserva: registra o plano usado
  await db.query("UPDATE bookings SET price = jsonb_set(price, '{planId}', to_jsonb($2::text)) WHERE id = $1", [b.id, plan.id]);
  await db.query("INSERT INTO plan_entries (id, plan_id, booking_id, kind, amount, note) VALUES ($1,$2,$3,'booking',$4,$5)",
    [id('ple'), plan.id, b.id, -credit, `Reserva em "${l.title}"`]);
}

/** Devolve ao plano a parte da locação que voltou (cancelamento/expiração). Nunca devolve mais do que foi debitado. */
export async function creditBack(db: Db, b: Booking, amount: number, note: string) {
  if (!b.price.planId || amount <= 0) return 0;
  const r = await one<{ s: number }>(db, "SELECT coalesce(sum(amount),0)::float AS s FROM plan_entries WHERE booking_id = $1 AND kind IN ('booking','booking_refund')", [b.id]);
  const owed = roundMoney(-(r?.s ?? 0), 'BRL');
  const value = roundMoney(Math.min(amount, owed), 'BRL');
  if (value <= 0) return 0;
  await db.query("INSERT INTO plan_entries (id, plan_id, booking_id, kind, amount, note) VALUES ($1,$2,$3,'booking_refund',$4,$5)",
    [id('ple'), b.price.planId, b.id, value, note]);
  return value;
}

/** Reserva do plano não concluída (expirou, recusada, fiador recusou): todo o crédito volta e o repasse é cancelado. */
export async function releaseBooking(db: Db, b: Booking) {
  if (!b.price.planId) return;
  await creditBack(db, b, b.price.planCredit ?? 0, 'Reserva não concluída: crédito devolvido');
  await db.query("UPDATE host_payouts SET status = 'void' WHERE booking_id = $1 AND status IN ('scheduled','due')", [b.id]);
}

/** Reserva do plano confirmada: agenda o Pix do anfitrião para 24 h depois do início. */
export async function scheduleHostPayout(db: Db, b: Booking, l: Listing) {
  if (!b.price.planId) return;
  const start = Math.min(...b.occurrences.map((o) => occurrenceStartUtc(l, o).getTime()));
  await db.query(
    `INSERT INTO host_payouts (id, booking_id, user_id, amount, status, due_at) VALUES ($1,$2,$3,$4,'scheduled',$5) ON CONFLICT (booking_id) DO NOTHING`,
    [id('hpo'), b.id, b.hostId, b.price.hostPayout, new Date(start + FEES.payoutDelayHours * 3600000)]);
}

/** Cancelamento com reembolso parcial: o crédito devolvido volta ao plano e o repasse do anfitrião é recalculado. */
export async function onPlanBookingCancelled(db: Db, b: Booking, refundedLocacao: number, hostRate: number) {
  if (!b.price.planId) return 0;
  const back = await creditBack(db, b, refundedLocacao, 'Cancelamento: crédito devolvido');
  const keptCredit = Math.max(0, (b.price.planCredit ?? 0) - back);
  const keptCash = keptCredit * (1 - PLAN_RULES.discountRate);
  const host = roundMoney(keptCash * (1 - hostRate), 'BRL');
  await db.query(`UPDATE host_payouts SET amount = $2, status = CASE WHEN $2 <= 0 THEN 'void' ELSE status END WHERE booking_id = $1 AND status IN ('scheduled','due')`, [b.id, host]);
  return back;
}

// ───────────── Reembolso do plano ─────────────
export async function refundPreview(user: User, planId: string) {
  const p = await one<PlanRow>(pool, 'SELECT * FROM plans WHERE id = $1 AND user_id = $2', [planId, user.id]);
  if (!p || p.status !== 'active' || !p.paid_at) throw new HttpError(409, 'invalid_status');
  return planRefund({ pricePaid: p.price_paid, creditUsed: await planCreditUsed(pool, p.id), paidAt: p.paid_at });
}

/** Cancela o plano e devolve pela regra (mesma forma de pagamento). Reservas já feitas continuam valendo. */
export async function cancelPlan(planId: string, by: { userId?: string; reason: 'customer' | 'expiry' }) {
  return withTx(async (tx) => {
    const p = await one<PlanRow>(tx, `SELECT * FROM plans WHERE id = $1 ${by.userId ? 'AND user_id = $2' : ''} FOR UPDATE`, by.userId ? [planId, by.userId] : [planId]);
    if (!p || p.status !== 'active' || !p.paid_at) throw new HttpError(409, 'invalid_status');
    const r = planRefund({ pricePaid: p.price_paid, creditUsed: await planCreditUsed(tx, p.id), paidAt: p.paid_at });
    if (r.amount > 0 && p.provider === 'mercadopago' && p.provider_ref) {
      await mp('POST', `/v1/payments/${p.provider_ref}/refunds`, { amount: r.amount }, `plan-refund-${p.id}`);
    }
    const left = await planCreditLeft(tx, p.id);
    if (left > 0) {
      await tx.query("INSERT INTO plan_entries (id, plan_id, kind, amount, note) VALUES ($1,$2,$3,$4,$5)",
        [id('ple'), p.id, by.reason === 'expiry' ? 'expiry' : 'plan_refund', -left, by.reason === 'expiry' ? 'Fim da validade: saldo devolvido' : 'Plano cancelado: saldo devolvido']);
    }
    await tx.query(`UPDATE plans SET status = $2, refund_amount = $3, refund_rule = $4, refunded_at = now() WHERE id = $1`,
      [p.id, by.reason === 'expiry' ? 'expired' : 'refunded', r.amount, by.reason === 'expiry' ? 'expiry' : r.rule]);
    await notify(tx, { userId: p.user_id }, 'plan_refunded', r.amount > 0
      ? `${by.reason === 'expiry' ? 'Seu Plano SpaceHour chegou ao fim da validade.' : 'Seu Plano SpaceHour foi cancelado.'} Devolução de ${brl(r.amount)} na mesma forma de pagamento, em até ${PLAN_RULES.refundBusinessDays} dias úteis. As reservas já feitas continuam valendo.`
      : 'Seu Plano SpaceHour foi encerrado. Não há valor a devolver: o crédito usado cobriu o valor pago. As reservas já feitas continuam valendo.', '/planos');
    return { refund: r.amount, rule: r.rule };
  });
}

// ───────────── Pix ao anfitrião ─────────────
export async function setPixAccount(user: User, input: { pixKey: string; holderName: string; holderTaxId: string }) {
  if (!pixKeyType(input.pixKey)) throw new HttpError(422, 'pix_invalid_key');
  const tax = input.holderTaxId.replace(/\D/g, '');
  if (tax.length !== 11 && tax.length !== 14) throw new HttpError(422, 'pix_invalid_holder');
  await pool.query(
    `INSERT INTO pix_accounts (user_id, pix_key, holder_name, holder_tax_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET pix_key = $2, holder_name = $3, holder_tax_id = $4, updated_at = now()`,
    [user.id, input.pixKey.trim().slice(0, 140), input.holderName.trim().slice(0, 140), tax]);
  return getPixAccount(user.id);
}
export const getPixAccount = (userId: string) => one(pool, 'SELECT pix_key, holder_name, holder_tax_id, updated_at FROM pix_accounts WHERE user_id = $1', [userId]);

export const hostPayoutsOf = (userId: string) => rows(pool,
  `SELECT h.*, l.title FROM host_payouts h JOIN bookings b ON b.id = h.booking_id JOIN listings l ON l.id = b.listing_id
    WHERE h.user_id = $1 ORDER BY h.due_at DESC LIMIT 200`, [userId]);

/** Paga um repasse por Pix (Asaas) ou marca como pago (Pix feito pelo banco). */
export async function payHostPayout(payoutId: string, manualRef?: string) {
  const h = await one<{ id: string; user_id: string; amount: number; status: string; booking_id: string }>(pool, 'SELECT * FROM host_payouts WHERE id = $1', [payoutId]);
  if (!h || !['due', 'failed'].includes(h.status)) throw new HttpError(409, 'invalid_status');
  let ref = manualRef;
  if (!ref) {
    if (!autoPixEnabled()) throw new HttpError(422, 'pix_manual_ref_required');
    const acc = await one<{ pix_key: string }>(pool, 'SELECT pix_key FROM pix_accounts WHERE user_id = $1', [h.user_id]);
    if (!acc) throw new HttpError(422, 'pix_account_missing');
    try {
      ref = await sendPix({ key: acc.pix_key, amount: h.amount, description: `SpaceHour reserva ${h.booking_id}`, ref: h.id });
    } catch (e) {
      await pool.query("UPDATE host_payouts SET status = 'failed', error = $2 WHERE id = $1", [h.id, (e as Error).message.slice(0, 300)]);
      throw new HttpError(502, 'pix_failed', { message: (e as Error).message });
    }
  }
  await pool.query("UPDATE host_payouts SET status = 'paid', paid_at = now(), paid_ref = $2, error = NULL WHERE id = $1", [h.id, ref]);
  await notify(pool, { userId: h.user_id }, 'host_paid', `Pix enviado: ${brl(h.amount)} da reserva ${h.booking_id} (Plano SpaceHour).`, '/anfitriao');
  return { paid: true, ref };
}

// ───────────── Rotina ─────────────
export async function planJobs(now = new Date()) {
  // Repasse liberado: 24 h após o início, sem disputa aberta contra o anfitrião
  await pool.query(
    `UPDATE host_payouts h SET status = 'due' WHERE status = 'scheduled' AND due_at <= $1
       AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.booking_id = h.booking_id AND i.status IN ('open','contested') AND i.against_user_id = h.user_id)`, [now]);
  // Pix automático (com Asaas configurado e PIX_AUTO=true)
  if (autoPixEnabled() && process.env.PIX_AUTO === 'true') {
    for (const h of await rows<{ id: string }>(pool, "SELECT id FROM host_payouts WHERE status = 'due' ORDER BY due_at LIMIT 20")) {
      await payHostPayout(h.id).catch((e) => console.error('[pix]', (e as Error).message));
    }
  }
  // Fim da validade: devolve o saldo pela regra
  for (const p of await rows<{ id: string }>(pool, "SELECT id FROM plans WHERE status = 'active' AND valid_until < $1", [now])) {
    await cancelPlan(p.id, { reason: 'expiry' }).catch((e) => console.error('[plano]', (e as Error).message));
  }
  // Checkout de plano abandonado
  await pool.query("UPDATE plans SET status = 'cancelled', checkout_url = NULL WHERE status = 'pending_payment' AND created_at < $1", [new Date(now.getTime() - 2 * 86400000)]);
}

// ───────────── Equipe ─────────────
export async function financeOverview() {
  const plans = await rows(pool,
    `SELECT p.*, u.name, u.email FROM plans p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 300`);
  const payouts = await rows(pool,
    `SELECT h.*, u.name, u.email, a.pix_key, a.holder_name, a.holder_tax_id, l.title
       FROM host_payouts h JOIN users u ON u.id = h.user_id LEFT JOIN pix_accounts a ON a.user_id = h.user_id
       JOIN bookings b ON b.id = h.booking_id JOIN listings l ON l.id = b.listing_id
      WHERE h.status IN ('due','failed','scheduled') ORDER BY h.due_at LIMIT 300`);
  const totals = await one(pool,
    `SELECT coalesce(sum(price_paid) FILTER (WHERE status IN ('active','refunded','expired')),0)::float AS sold,
            coalesce(sum(refund_amount),0)::float AS refunded,
            (SELECT coalesce(sum(amount),0)::float FROM plan_entries e JOIN plans q ON q.id = e.plan_id WHERE q.status = 'active') AS credit_outstanding,
            (SELECT coalesce(sum(amount),0)::float FROM host_payouts WHERE status IN ('scheduled','due','failed')) AS host_payouts_open
       FROM plans`);
  return { plans, payouts, totals, autoPix: autoPixEnabled() };
}
