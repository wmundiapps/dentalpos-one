// Reserva antecipada parcelada: reserva com até 18 meses, até 10 parcelas mensais (Pix ou cartão), 7% de desconto
// na locação. Cada parcela é um pagamento próprio pelo split: a parte do anfitrião cai direto na conta dele e o
// SpaceHour não guarda dinheiro do locatário. Corretor e zelador vão na última parcela, sem desconto.
// Regras: shared/rules.ts (ADVANCE_RULES) e docs/legal/pt-BR/advance-booking.md.
import { HttpError } from './auth.js';
import { id, nowIso, one, pool, rows, withTx, type Db } from './db.js';
import { notify } from './notify.js';
import { queueInstant } from './messaging.js';
import { onBookingCancelled, onBookingConfirmed } from './partners.js';
import * as repo from './repo.js';
import {
  gatewayForBooking, gatewayOf, markFailed, markPaid, newPayment, refundPayment, startCheckout, voidPayment,
} from './payments/index.js';
import { ADVANCE_RULES, advanceRefund, computeGuestRefund, occurrenceStartUtc, partnerFeesOf, roundMoney, todayInZone, addDays } from '../../shared/rules.js';
import type { Booking, Listing, Payment, User } from '../../shared/types.js';

const APP_URL = () => (process.env.APP_URL ?? 'https://space-hour.com').replace(/\/$/, '');
const API_URL = () => (process.env.API_URL ?? APP_URL()).replace(/\/$/, '');
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const when = (b: Pick<Booking, 'occurrences'>) => b.occurrences.map((o) => `${o.date.split('-').reverse().join('/')} ${o.start}–${o.end}`).join(', ');

export interface InstallmentRow {
  id: string; booking_id: string; seq: number; due_date: string; amount: number; partner_fees: number; host_share: number;
  status: 'pending' | 'paid' | 'void' | 'refunded'; payment_id: string | null; paid_at: Date | null; reminded_at: Date | null;
}

export const isAdvance = (b: Pick<Booking, 'price'>) => (b.price.advanceDiscount ?? 0) > 0;
export const installmentsOf = (db: Db, bookingId: string) =>
  rows<InstallmentRow>(db, 'SELECT * FROM booking_installments WHERE booking_id = $1 ORDER BY seq', [bookingId]);
export const installmentOfPayment = (db: Db, paymentId: string) =>
  one<InstallmentRow>(db, 'SELECT * FROM booking_installments WHERE payment_id = $1 FOR UPDATE', [paymentId]);

export async function insertInstallments(db: Db, b: Booking, schedule: Array<{ seq: number; dueDate: string; amount: number; partnerFees: number; hostShare: number }>, firstPaymentId: string) {
  for (const s of schedule) {
    await db.query(
      `INSERT INTO booking_installments (id, booking_id, seq, due_date, amount, partner_fees, host_share, status, payment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)`,
      [id('ins'), b.id, s.seq, s.dueDate, s.amount, s.partnerFees, s.hostShare, s.seq === 1 ? firstPaymentId : null]);
  }
}

/** Cópia da reserva com o valor da parcela, para o checkout e o split (marketplace_fee = parcela − parte do anfitrião). */
export function bookingForInstallment(b: Booking, inst: Pick<InstallmentRow, 'amount' | 'host_share' | 'seq'>, deadline: string): Booking {
  return { ...b, paymentDeadline: deadline, price: { ...b.price, total: inst.amount, hostPayout: inst.host_share } };
}

/** Parcela paga. Na última, a reserva fica quitada: parceiros recebem o aviso e os contatos são trocados. */
export async function installmentPaid(db: Db, b: Booking, l: Listing, inst: InstallmentRow) {
  await db.query("UPDATE booking_installments SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending'", [inst.id]);
  const all = await installmentsOf(db, b.id);
  const left = all.filter((x) => x.status === 'pending');
  if (inst.seq > 1) {
    await notify(db, { userId: b.guestId }, 'installment_paid', `Parcela ${inst.seq}/${all.length} paga: ${brl(inst.amount)} da reserva antecipada em "${l.title}" (${when(b)}).${left.length ? ` Faltam ${left.length}.` : ' Reserva quitada! ✅'}`, `/reservas/${b.id}`);
    await notify(db, { userId: b.hostId }, 'installment_paid', `Parcela ${inst.seq}/${all.length} recebida da reserva antecipada em "${l.title}" (${when(b)}).`, `/anfitriao/reservas/${b.id}`);
  }
  if (!left.length && ['confirmed', 'checked_in'].includes(b.status)) await onBookingConfirmed(db, b, l);
}

/** Todas pagas? (a troca de contatos com parceiros espera a quitação) */
export async function fullyPaid(db: Db, bookingId: string) {
  return !(await one(db, "SELECT 1 FROM booking_installments WHERE booking_id = $1 AND status = 'pending'", [bookingId]));
}

/** Locatário paga a próxima parcela (em ordem). No ambiente sem provedor, paga na hora. */
export async function payInstallment(guest: User, bookingId: string, method: 'pix' | 'card') {
  return withTx(async (tx) => {
    const b = await repo.getBooking(tx, bookingId, true);
    if (!b || b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
    if (!isAdvance(b) || !['confirmed'].includes(b.status)) throw new HttpError(409, 'invalid_status');
    const l = (await repo.getListing(tx, b.listingId))!;
    const next = (await installmentsOf(tx, b.id)).find((x) => x.status === 'pending');
    if (!next) throw new HttpError(409, 'installments_paid');
    const first = (await repo.getPayment(tx, b.paymentId))!;
    const { gateway, sellerRef } = await gatewayForBooking(l.countryCode, l.hostId, first.provider === 'asaas' ? 'asaas' : 'mercadopago');
    const deadline = new Date(Date.now() + (method === 'pix' ? 30 : 24 * 60) * 60000).toISOString();
    const copy = bookingForInstallment({ ...b, paymentMethod: method }, next, deadline);
    const p = newPayment(copy, gateway, sellerRef);
    p.method = method;
    p.payoutAmount = next.host_share;
    await tx.query('UPDATE booking_installments SET payment_id = $2 WHERE id = $1', [next.id, p.id]);
    if (gateway.instant) {
      markPaid(p, true);
      await repo.savePayment(tx, p);
      await installmentPaid(tx, b, l, { ...next, payment_id: p.id });
      return { paid: true, seq: next.seq };
    }
    const guestUser = (await repo.getUser(tx, guest.id))!;
    await startCheckout(gateway, p, copy, l, guestUser, {
      successUrl: `${APP_URL()}/reservas/${b.id}?parcela=${next.seq}`, cancelUrl: `${APP_URL()}/reservas/${b.id}`,
      notificationUrl: `${API_URL()}/api/webhooks/mercadopago`,
    });
    await repo.savePayment(tx, p);
    return { paid: false, seq: next.seq, checkoutUrl: p.checkoutUrl };
  });
}

/** Aviso do provedor sobre uma parcela que não é a primeira (a primeira segue o fluxo normal da reserva). */
export async function applyInstallmentUpdate(tx: Db, p: Payment, b: Booking, l: Listing, inst: InstallmentRow, outcome: string, refs: { providerRef?: string }) {
  if (outcome === 'authorized' || outcome === 'captured') {
    if (!markPaid(p, true, refs)) return;
    if (inst.status !== 'pending' || !['confirmed', 'checked_in'].includes(b.status)) {
      // Reserva cancelada antes de o pagamento cair: devolve na hora
      await voidPayment(await gatewayOf(p, l.countryCode), p);
      await repo.savePayment(tx, p);
      return;
    }
    await repo.savePayment(tx, p);
    await installmentPaid(tx, b, l, inst);
  } else if (outcome === 'failed' || outcome === 'expired') {
    if (markFailed(p, outcome)) await repo.savePayment(tx, p);
  }
}

/**
 * Cancelamento da reserva antecipada. Pelo anfitrião: devolve tudo. Pelo locatário (ou parcela vencida):
 * 7 dias = tudo; depois, pago − desconto de 7%; perto da data, a política do espaço se devolver menos.
 * O estorno sai de cada parcela paga (da última para a primeira); checkouts em aberto são cancelados.
 */
export async function cancelAdvance(tx: Db, b: Booking, l: Listing, by: 'host' | 'guest', now = new Date()) {
  const all = await installmentsOf(tx, b.id);
  const paid = all.filter((x) => x.status === 'paid');
  const paidTotal = roundMoney(paid.reduce((s, x) => s + x.amount, 0), b.price.currency);
  let refund = paidTotal;
  let rule = 'host_cancel';
  if (by === 'guest' && paid.length) {
    const r = computeGuestRefund({ listing: l, policy: b.cancellationPolicy, occurrences: b.occurrences, price: b.price, bookedAt: new Date(b.createdAt), now, isConsumer: b.isConsumer });
    const policyRate = b.price.baseAmount ? r.refundBase / b.price.baseAmount : 0;
    const firstPaidAt = paid[0].paid_at ? new Date(paid[0].paid_at) : new Date(b.createdAt);
    const res = advanceRefund({ paid: paidTotal, discount: b.price.advanceDiscount ?? 0, firstPaidAt, policyRate }, now);
    refund = res.amount;
    rule = res.rule;
  }
  let toRefund = refund;
  for (const x of [...paid].reverse()) {
    if (toRefund <= 0) break;
    const p = x.payment_id ? await repo.getPayment(tx, x.payment_id, true) : undefined;
    if (!p) continue;
    const done = await refundPayment(await gatewayOf(p, l.countryCode), p, Math.min(toRefund, p.amount - p.refunded), `advance_${rule}`);
    toRefund = roundMoney(toRefund - done, b.price.currency);
    await repo.savePayment(tx, p);
    await tx.query("UPDATE booking_installments SET status = 'refunded' WHERE id = $1", [x.id]);
  }
  for (const x of all.filter((y) => y.status === 'pending')) {
    const p = x.payment_id ? await repo.getPayment(tx, x.payment_id, true) : undefined;
    if (p && p.status === 'pending') { await voidPayment(await gatewayOf(p, l.countryCode), p); await repo.savePayment(tx, p); }
    await tx.query("UPDATE booking_installments SET status = 'void' WHERE id = $1", [x.id]);
  }
  // Corretor e zelador (se já pagos na última parcela): devolvidos na mesma proporção
  const fees = partnerFeesOf(b.price);
  await onBookingCancelled(tx, b, paidTotal ? roundMoney(fees * (refund / paidTotal), b.price.currency) : fees);
  return { refund: roundMoney(refund, b.price.currency), paid: paidTotal, rule };
}

/** Rotina: lembrete 5 dias antes do vencimento e cancelamento depois de 5 dias de atraso. */
export async function advanceJobs(now = new Date()) {
  const today = todayInZone('America/Sao_Paulo', now);
  const remind = await rows<InstallmentRow & { guest_id: string; title: string; total: number }>(pool,
    `SELECT i.*, b.guest_id, l.title, (SELECT count(*)::int FROM booking_installments x WHERE x.booking_id = i.booking_id) AS total
       FROM booking_installments i JOIN bookings b ON b.id = i.booking_id JOIN listings l ON l.id = b.listing_id
      WHERE i.status = 'pending' AND i.seq > 1 AND b.status = 'confirmed' AND i.reminded_at IS NULL AND i.due_date <= $1`, [addDays(today, 5)]);
  for (const r of remind) {
    const text = `Lembrete SpaceHour: a parcela ${r.seq}/${r.total} (${brl(r.amount)}) da sua reserva antecipada em "${r.title}" vence em ${r.due_date.split('-').reverse().join('/')}. Pague pelo Pix ou cartão em ${APP_URL()}/reservas/${r.booking_id}. Após ${ADVANCE_RULES.graceDays} dias de atraso a reserva é cancelada.`;
    await notify(pool, { userId: r.guest_id }, 'installment_due', text, `/reservas/${r.booking_id}`);
    await queueInstant(pool, r.guest_id, text);
    await pool.query('UPDATE booking_installments SET reminded_at = now() WHERE id = $1', [r.id]);
  }
  const overdue = await rows<{ booking_id: string }>(pool,
    `SELECT DISTINCT i.booking_id FROM booking_installments i JOIN bookings b ON b.id = i.booking_id
      WHERE i.status = 'pending' AND b.status = 'confirmed' AND i.due_date < $1`, [addDays(today, -ADVANCE_RULES.graceDays)]);
  for (const o of overdue) {
    await withTx(async (tx) => {
      const b = await repo.getBooking(tx, o.booking_id, true);
      if (!b || b.status !== 'confirmed') return;
      const l = (await repo.getListing(tx, b.listingId))!;
      const r = await cancelAdvance(tx, b, l, 'guest', now);
      b.status = 'cancelled_guest';
      b.cancelledAt = nowIso();
      b.cancellationReason = 'installment_overdue';
      b.refundAmount = r.refund;
      await repo.saveBooking(tx, b);
      await notify(tx, { userId: b.guestId }, 'advance_cancelled', `Sua reserva antecipada em "${l.title}" (${when(b)}) foi cancelada porque uma parcela ficou ${ADVANCE_RULES.graceDays} dias em atraso. Devolução: ${brl(r.refund)} de ${brl(r.paid)} pagos, na mesma forma de pagamento.`, `/reservas/${b.id}`);
      await notify(tx, { userId: b.hostId }, 'booking_cancelled', `A reserva antecipada em "${l.title}" (${when(b)}) foi cancelada por falta de pagamento de parcela. As datas foram liberadas.`, `/anfitriao/reservas/${b.id}`);
    }).catch((e) => console.error('[parcela]', (e as Error).message));
  }
}

/** Para a tela: primeira data da reserva e se ela pode ser antecipada. */
export function advanceEligible(l: Listing, firstDate: string, firstStart: string, now = new Date()) {
  const start = occurrenceStartUtc(l, { date: firstDate, start: firstStart, end: firstStart });
  return l.acceptsAdvance !== false && start.getTime() - now.getTime() >= ADVANCE_RULES.minLeadDays * 86400000;
}
