// Carteira de crédito do cliente no salão: recarga (Pix pelo Asaas do próprio salão ou no balcão), pagamento de atendimentos
// com desconto de benefício e extrato. O saldo mora em wallet_accounts (atualização atômica, nunca negativa) e cada
// movimento fica em wallet_ledger; (kind, ref_id) é único, então webhooks e cliques repetidos nunca creditam duas vezes.
import { db } from './db.js';
import { HttpError, uid, nowIso, localDate, addDays } from './util.js';
import { getIntegration } from './integrations/store.js';
import * as asaas from './integrations/asaas.js';
import { ensureConversation, sendOut } from './messaging.js';
import { fmtBRL } from './payments.js';

export const MIN_TOPUP_CENTS = 1000;
export const MAX_TOPUP_CENTS = 500000;
export const COUNTER_LIMIT_CENTS = 100000; // recepção lança até R$ 1.000 por vez; acima disso, só gerente/dono
export const TOPUP_VALID_DAYS = 3;
export const COUNTER_METHODS = ['cash', 'card', 'pix_manual'];

export const discountPct = (salon) => (salon.wallet_enabled ? Math.max(0, Math.min(50, Number(salon.wallet_discount_pct) || 0)) : 0);

// Desconto de benefício: só sobre serviços (procedimentos), nunca sobre produtos.
export const walletDiscountCents = (serviceCents, pct) => Math.round((serviceCents * pct) / 100);

export async function getBalance(salonId, clientId, t = db) {
  const r = await t.get('SELECT balance_cents FROM wallet_accounts WHERE salon_id = ? AND client_id = ?', [salonId, clientId]);
  return r ? Number(r.balance_cents) : 0;
}

// Movimenta o saldo dentro de uma transação. amountCents > 0 credita, < 0 debita (falha se faltar saldo).
// Retorna false se o mesmo (kind, refId) já foi lançado (idempotência).
export async function move(t, { salonId, clientId, kind, amountCents, refId = uid(), note = null, userId = null }) {
  if (!Number.isInteger(amountCents) || amountCents === 0) throw new HttpError(422, 'Valor inválido.');
  const id = uid();
  const ins = await t.run(
    `INSERT INTO wallet_ledger (id, salon_id, client_id, kind, amount_cents, balance_after, ref_id, note, user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (kind, ref_id) DO NOTHING`,
    [id, salonId, clientId, kind, amountCents, 0, refId, note ? String(note).slice(0, 300) : null, userId, nowIso()]);
  if (!ins.changes) return false;
  await t.run('INSERT INTO wallet_accounts (salon_id, client_id, balance_cents, updated_at) VALUES (?,?,0,?) ON CONFLICT (salon_id, client_id) DO NOTHING', [salonId, clientId, nowIso()]);
  const upd = await t.run(
    'UPDATE wallet_accounts SET balance_cents = balance_cents + ?, updated_at = ? WHERE salon_id = ? AND client_id = ? AND balance_cents + ? >= 0',
    [amountCents, nowIso(), salonId, clientId, amountCents]);
  if (!upd.changes) throw new HttpError(409, 'Saldo insuficiente na carteira do cliente.');
  await t.run('UPDATE wallet_ledger SET balance_after = ? WHERE id = ?', [await getBalance(salonId, clientId, t), id]);
  return true;
}

async function tellClient(salon, clientId, body, subject) {
  try {
    const c = await db.get('SELECT * FROM clients WHERE id = ? AND salon_id = ?', [clientId, salon.id]);
    const channel = c?.phone ? 'whatsapp' : c?.email ? 'email' : null;
    if (!channel) return { status: 'skipped' };
    const to = channel === 'whatsapp' ? c.phone : c.email;
    const conv = channel === 'whatsapp' ? await ensureConversation(salon.id, 'whatsapp', to, { name: c.name, clientId: c.id }) : null;
    return await sendOut(salon, { channel, to, body, subject, kind: 'transactional', conversation: conv, sender: 'system', templateVars: [c.name.split(' ')[0]] });
  } catch (e) { return { status: 'failed', error: e.message }; }
}

// ---------- Recarga ----------
export async function createTopup(salon, user, { clientId, amountCents, method = 'pix', cpfCnpj = null, send = false }) {
  if (!salon.wallet_enabled) throw new HttpError(409, 'A carteira de crédito está desligada para este salão (Configurações).');
  if (!Number.isInteger(amountCents) || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    throw new HttpError(422, `Recarga de ${fmtBRL(MIN_TOPUP_CENTS)} até ${fmtBRL(MAX_TOPUP_CENTS)}.`);
  }
  const client = await db.get('SELECT * FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [clientId, salon.id]);
  if (!client) throw new HttpError(404, 'Cliente não encontrado.');
  const id = uid();

  if (COUNTER_METHODS.includes(method)) {
    if (amountCents > COUNTER_LIMIT_CENTS && !['owner', 'manager'].includes(user.role)) {
      throw new HttpError(403, `Recargas no balcão acima de ${fmtBRL(COUNTER_LIMIT_CENTS)} precisam de um gerente.`);
    }
    await db.run('INSERT INTO wallet_topups (id, salon_id, client_id, amount_cents, method, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, salon.id, client.id, amountCents, method, 'pending', user.id, nowIso()]);
    await creditTopup(salon, id, { userId: user.id });
    return { id, status: 'paid', balance_cents: await getBalance(salon.id, client.id) };
  }
  if (method !== 'pix') throw new HttpError(422, 'Forma de recarga inválida.');

  let pix, payId = null, invoice = null;
  const conf = await getIntegration(salon.id, 'asaas');
  if (!conf?.apiKey) {
    pix = { payload: `SIMULADO-${id.slice(0, 8)}`, image: null, simulated: true, note: 'Conecte o Asaas em Integrações para gerar o Pix real. Este código é só de teste.' };
  } else {
    const doc = String(cpfCnpj || '').replace(/\D/g, '');
    if (doc && doc.length !== 11 && doc.length !== 14) throw new HttpError(422, 'CPF/CNPJ inválido.');
    const cust = await asaas.createCustomer(conf, { name: client.name, email: client.email || undefined, cpfCnpj: doc || undefined, phone: client.phone });
    const pay = await asaas.createPayment(conf, {
      customer: cust.id, billingType: 'PIX', valueCents: amountCents, dueDate: addDays(localDate(new Date(), salon.timezone), TOPUP_VALID_DAYS - 1),
      description: `Crédito na carteira — ${salon.name}`, externalReference: `wallet:${id}`,
    });
    const qr = await asaas.getPixQr(conf, pay.id);
    payId = pay.id; invoice = pay.invoiceUrl ?? null;
    pix = { payload: qr.payload, image: qr.encodedImage, expires: qr.expirationDate };
  }
  await db.run('INSERT INTO wallet_topups (id, salon_id, client_id, amount_cents, method, status, asaas_payment_id, pix_payload, invoice_url, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [id, salon.id, client.id, amountCents, 'pix', 'pending', payId, pix.payload, invoice, user.id, nowIso()]);
  let sent = null;
  if (send) {
    const r = await tellClient(salon, client.id,
      `Olá, ${client.name.split(' ')[0]}! Para carregar ${fmtBRL(amountCents)} de crédito em ${salon.name}, pague este Pix (copia e cola) no app do seu banco:\n${pix.payload}\nO crédito cai na hora e dá ${discountPct(salon)}% de desconto nos serviços quando você usa o saldo.`,
      'Seu Pix de crédito');
    sent = r.status;
  }
  return { id, status: 'pending', pix, sent };
}

// Confirma uma recarga (webhook, balcão ou confirmação do gerente). Idempotente.
export async function creditTopup(salon, topupId, { userId = null, paidCents = null } = {}) {
  const topup = await db.get('SELECT * FROM wallet_topups WHERE id = ? AND salon_id = ?', [topupId, salon.id]);
  if (!topup) return false;
  if (paidCents !== null && paidCents !== topup.amount_cents) return false;
  const done = await db.tx(async (t) => {
    const claim = await t.run("UPDATE wallet_topups SET status = 'paid', paid_at = ? WHERE id = ? AND status IN ('pending','expired')", [nowIso(), topup.id]);
    if (!claim.changes) return false;
    await move(t, { salonId: salon.id, clientId: topup.client_id, kind: 'topup', amountCents: topup.amount_cents, refId: topup.id, note: `Recarga (${topup.method})`, userId: userId || topup.created_by });
    return true;
  });
  if (!done) return false;
  const bal = await getBalance(salon.id, topup.client_id);
  await tellClient(salon, topup.client_id, `Crédito de ${fmtBRL(topup.amount_cents)} recebido em ${salon.name}. Seu saldo agora é ${fmtBRL(bal)}. Ao usar o saldo você ganha ${discountPct(salon)}% de desconto nos serviços. ✨`, 'Crédito recebido');
  return true;
}

// Pix de recarga estornado ou contestado depois de creditado: tira o valor do saldo (até o que ainda existe) e registra a diferença.
export async function clawbackTopup(salon, topupId) {
  const out = await db.tx(async (t) => {
    const tp = await t.get('SELECT * FROM wallet_topups WHERE id = ? AND salon_id = ?', [topupId, salon.id]);
    if (!tp) return null;
    const claim = await t.run("UPDATE wallet_topups SET status = 'reversed' WHERE id = ? AND status = 'paid'", [tp.id]);
    if (!claim.changes) return null;
    const debit = Math.min(await getBalance(salon.id, tp.client_id, t), tp.amount_cents);
    if (debit > 0) await move(t, { salonId: salon.id, clientId: tp.client_id, kind: 'reversal', amountCents: -debit, refId: tp.id, note: 'Pix estornado ou contestado no Asaas' });
    return { debited: debit, shortfall: tp.amount_cents - debit };
  });
  if (out?.shortfall) console.warn('[carteira] recarga estornada com saldo já usado:', topupId, 'diferença', out.shortfall);
  return out;
}

// Pix de recarga sem pagamento em 3 dias vence e é cancelado no Asaas.
export async function expireTopups(now = new Date()) {
  const cutoff = new Date(now.getTime() - TOPUP_VALID_DAYS * 86400_000).toISOString();
  const rows = await db.all("SELECT * FROM wallet_topups WHERE status = 'pending' AND method = 'pix' AND created_at < ?", [cutoff]);
  for (const tp of rows) {
    const claim = await db.run("UPDATE wallet_topups SET status = 'expired' WHERE id = ? AND status = 'pending'", [tp.id]);
    if (claim.changes && tp.asaas_payment_id) {
      try { const conf = await getIntegration(tp.salon_id, 'asaas'); if (conf?.apiKey) await asaas.deletePayment(conf, tp.asaas_payment_id); } catch { /* já vencido ou removido */ }
    }
  }
  return rows.length;
}

// ---------- Uso do crédito em comanda ----------
// Débito atômico dentro da transação que cria a venda.
export async function spend(t, { salonId, clientId, saleId, cents, userId }) {
  return move(t, { salonId, clientId, kind: 'spend', amountCents: -cents, refId: saleId, note: 'Pagamento de comanda', userId });
}

export async function notifySpend(salon, sale) {
  const bal = await getBalance(salon.id, sale.client_id);
  const saved = sale.wallet_discount_cents ? ` Você economizou ${fmtBRL(sale.wallet_discount_cents)} com o desconto do crédito.` : '';
  return tellClient(salon, sale.client_id, `Pagamento de ${fmtBRL(sale.wallet_cents)} feito com o seu crédito em ${salon.name}.${saved} Saldo atual: ${fmtBRL(bal)}.`, 'Pagamento com crédito');
}

// Estorna uma comanda paga com crédito: devolve o saldo, devolve o estoque e desfaz a visita do cliente.
export async function reverseSale(salon, saleId, { userId, note }) {
  const out = await db.tx(async (t) => {
    const sale = await t.get('SELECT * FROM sales WHERE id = ? AND salon_id = ?', [saleId, salon.id]);
    if (!sale) throw new HttpError(404, 'Venda não encontrada.');
    if (sale.payment_method !== 'wallet' || sale.status !== 'paid' || !sale.wallet_cents) throw new HttpError(409, 'Só dá para estornar comandas pagas com crédito da carteira.');
    const claim = await t.run("UPDATE sales SET status = 'refunded' WHERE id = ? AND status = 'paid'", [sale.id]);
    if (!claim.changes) throw new HttpError(409, 'Esta comanda já foi estornada.');
    await move(t, { salonId: salon.id, clientId: sale.client_id, kind: 'refund', amountCents: sale.wallet_cents, refId: sale.id, note: note || 'Estorno de comanda', userId });
    const items = await t.all("SELECT * FROM sale_items WHERE sale_id = ? AND kind = 'product'", [sale.id]);
    for (const it of items) await t.run('UPDATE products SET stock = stock + ? WHERE id = ? AND salon_id = ?', [it.qty, it.ref_id, salon.id]);
    await t.run('UPDATE clients SET visits = CASE WHEN visits > 0 THEN visits - 1 ELSE 0 END, total_spent_cents = CASE WHEN total_spent_cents >= ? THEN total_spent_cents - ? ELSE 0 END WHERE id = ? AND salon_id = ?',
      [sale.total_cents, sale.total_cents, sale.client_id, salon.id]);
    if (sale.appointment_id) await t.run("UPDATE appointments SET status = 'scheduled' WHERE id = ? AND salon_id = ? AND status = 'done'", [sale.appointment_id, salon.id]);
    return sale;
  });
  await tellClient(salon, out.client_id, `Estornamos ${fmtBRL(out.wallet_cents)} para o seu crédito em ${salon.name}. Saldo atual: ${fmtBRL(await getBalance(salon.id, out.client_id))}.`, 'Crédito estornado');
  return { returned_cents: out.wallet_cents };
}

// Ajuste manual do gerente (correção, cortesia, devolução em dinheiro). Sempre com motivo; nunca deixa o saldo negativo.
export async function adjust(salon, user, { clientId, amountCents, note }) {
  const client = await db.get('SELECT id FROM clients WHERE id = ? AND salon_id = ? AND deleted_at IS NULL', [clientId, salon.id]);
  if (!client) throw new HttpError(404, 'Cliente não encontrado.');
  await db.tx((t) => move(t, { salonId: salon.id, clientId, kind: 'adjust', amountCents, note, userId: user.id }));
  return { balance_cents: await getBalance(salon.id, clientId) };
}

export async function summary(salon, fromIso) {
  const sid = salon.id;
  const held = await db.get('SELECT COALESCE(SUM(balance_cents),0) AS v, COUNT(*) AS n FROM wallet_accounts WHERE salon_id = ? AND balance_cents > 0', [sid]);
  const sum = async (kind) => Number((await db.get('SELECT COALESCE(SUM(amount_cents),0) AS v FROM wallet_ledger WHERE salon_id = ? AND kind = ? AND created_at >= ?', [sid, kind, fromIso])).v);
  const disc = await db.get("SELECT COALESCE(SUM(wallet_discount_cents),0) AS v FROM sales WHERE salon_id = ? AND status = 'paid' AND payment_method = 'wallet' AND paid_at >= ?", [sid, fromIso]);
  const pending = await db.get("SELECT COALESCE(SUM(amount_cents),0) AS v, COUNT(*) AS n FROM wallet_topups WHERE salon_id = ? AND status = 'pending'", [sid]);
  return {
    held_cents: Number(held.v), clients_with_balance: Number(held.n),
    topups_cents: await sum('topup'), spent_cents: -(await sum('spend')), refunded_cents: await sum('refund'),
    discount_given_cents: Number(disc.v), pending_cents: Number(pending.v), pending_count: Number(pending.n),
  };
}
