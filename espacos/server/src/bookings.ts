// Serviço de reservas: criação, aprovação, avalista, cancelamentos, check-in/out,
// incidentes (penalidades) e rotina periódica (expirações, repasses, caução,
// liberação de avaliações). Cada operação roda numa transação PostgreSQL.

import { id, lockKey, nowIso, pool, token, withTx, type Db } from './db';
import * as repo from './repo';
import { ACTIVE_STATUSES } from './repo';
import { HttpError, addStrike, assertCanTransact } from './auth';
import { notify } from './notify';
import {
  type Gateway, type PaymentUpdate, capturePayment, chargeExtra, gatewayFor, gatewayOf, holdDeposit, markFailed, markPaid, newPayment,
  payHost, refundPayment, releaseDeposit, startCheckout, supportsHold, voidPayment,
} from './payments';
import type { Booking, Incident, IncidentType, Listing, Occurrence, Payment, User } from '../../shared/types';
import {
  BOOKING_LIMITS, FEES, addDays, GUARANTOR_RULES, INCIDENT_RESPONSE_HOURS, OVERSTAY, PENALTIES, REVIEW_RULES, RULES_VERSION,
  computeGuestRefund, computePrice, daysBetween, guarantorRequired, hostCancellationPenalty, occurrenceEndUtc,
  occurrenceHours, occurrenceStartUtc, roundMoney, suggestedPenalty, validateOccurrences,
} from '../../shared/rules';
import { getCountry } from '../../shared/countries';

export { ACTIVE_STATUSES };
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const API_URL = process.env.PUBLIC_API_URL ?? APP_URL;
export const PAYMENT_WINDOW_MINUTES = 30;

function checkoutUrls(b: Pick<Booking, 'id'>) {
  return {
    successUrl: `${APP_URL}/reservas/${b.id}?pagamento=ok`,
    cancelUrl: `${APP_URL}/reservas/${b.id}?pagamento=cancelado`,
    notificationUrl: `${API_URL}/api/webhooks/mercadopago`,
  };
}

const gw = (l: Pick<Listing, 'countryCode'>, p: Payment) => gatewayOf(p, l.countryCode);

export async function getListing(db: Db, listingId: string, forUpdate = false): Promise<Listing> {
  const l = await repo.getListing(db, listingId, forUpdate);
  if (!l) throw new HttpError(404, 'listing_not_found');
  return l;
}

export async function getBooking(db: Db, bookingId: string, forUpdate = false): Promise<Booking> {
  const b = await repo.getBooking(db, bookingId, forUpdate);
  if (!b) throw new HttpError(404, 'booking_not_found');
  return b;
}

export const paymentOf = (db: Db, b: Booking, forUpdate = false) => repo.getPayment(db, b.paymentId, forUpdate);

function firstStart(l: Pick<Listing, 'timezone'>, b: Pick<Booking, 'occurrences'>) {
  return Math.min(...b.occurrences.map((o) => occurrenceStartUtc(l, o).getTime()));
}
function lastEnd(l: Pick<Listing, 'timezone'>, b: Pick<Booking, 'occurrences'>) {
  return Math.max(...b.occurrences.map((o) => occurrenceEndUtc(l, o).getTime()));
}

export async function validationContext(db: Db, listing: Listing, guestId: string | undefined, occurrences: Occurrence[], excludeBookingId?: string) {
  const active = await repo.activeBookingsForListing(db, listing.id, excludeBookingId);
  let guestHours = 0;
  let series = 0;
  if (guestId && occurrences.length) {
    const dates = occurrences.map((o) => o.date).sort();
    for (const b of active.filter((x) => x.guestId === guestId)) {
      for (const o of b.occurrences) {
        // janela móvel de 30 dias em torno das novas ocorrências
        if (Math.abs(daysBetween(dates[0], o.date)) <= 30 || Math.abs(daysBetween(dates[dates.length - 1], o.date)) <= 30) guestHours += occurrenceHours(o);
      }
      if (b.occurrences.length > 1 && daysBetween(b.occurrences[0].date, b.occurrences[1].date) === 7) series++;
    }
  }
  // Intervalo obrigatório após uma série semanal completa (12 semanas) no mesmo espaço
  let seriesCooldownUntil: string | undefined;
  if (guestId) {
    const past = await repo.findBookings(db, 'listing_id = $1 AND guest_id = $2 AND status = ANY($3)', [listing.id, guestId, ['confirmed', 'checked_in', 'completed']]);
    for (const b of past) {
      const o = b.occurrences;
      if (o.length >= BOOKING_LIMITS.maxRecurringWeeks && daysBetween(o[0].date, o[1].date) === 7) {
        const until = addDays(o[o.length - 1].date, BOOKING_LIMITS.cooldownDaysAfterMaxSeries);
        if (!seriesCooldownUntil || until > seriesCooldownUntil) seriesCooldownUntil = until;
      }
    }
  }
  return { existing: active, guestHoursLast30Days: guestHours, guestActiveSeries: series, seriesCooldownUntil };
}

export async function quote(db: Db, listing: Listing, occurrences: Occurrence[], guest?: User) {
  const errors = validateOccurrences(listing, occurrences, await validationContext(db, listing, guest?.id, occurrences));
  const price = computePrice(listing, occurrences);
  return {
    price,
    errors,
    guarantorRequired: guarantorRequired(listing.guarantorPolicy, price.total, listing.guarantorThreshold),
    guarantorLiabilityCap: roundMoney(price.total * GUARANTOR_RULES.defaultLiabilityMultiple, price.currency),
  };
}

export interface CreateBookingInput {
  listingId: string;
  occurrences: Occurrence[];
  guests: number;
  purpose: string;
  paymentMethod: string;
  acceptRules: boolean;
  isConsumer?: boolean;
  clientReviewsEnabled?: boolean;
  guarantor?: { name: string; email: string; phone?: string; documentNumber: string; relationship?: string };
  message?: string;
}

export function createBooking(guest: User, input: CreateBookingInput): Promise<Booking> {
  return withTx(async (tx) => {
    assertCanTransact(guest);
    // Trava a agenda do espaço: duas reservas simultâneas para o mesmo horário
    // são serializadas e a segunda encontra o conflito.
    await lockKey(tx, `listing:${input.listingId}`);
    const listing = await getListing(tx, input.listingId);
    if (!listing.active) throw new HttpError(409, 'listing_inactive');
    if (listing.hostId === guest.id) throw new HttpError(409, 'cannot_book_own_listing');
    if (!input.acceptRules) throw new HttpError(422, 'rules_not_accepted');
    if (input.guests < 1 || input.guests > listing.capacity) throw new HttpError(422, 'over_capacity', { max: listing.capacity });
    if (listing.requiresLicense && guest.licenseStatus !== 'approved') throw new HttpError(422, 'license_required');
    const country = getCountry(listing.countryCode);
    if (!country.paymentMethods.includes(input.paymentMethod as never)) throw new HttpError(422, 'payment_method_unavailable');

    const q = await quote(tx, listing, input.occurrences, guest);
    if (q.errors.length) throw new HttpError(422, 'invalid_occurrences', q.errors);

    const gateway = gatewayFor(listing.countryCode);
    const needsGuarantorForDeposit = listing.securityDeposit > 0 && !supportsHold(input.paymentMethod, gateway);
    if ((q.guarantorRequired || needsGuarantorForDeposit) && !input.guarantor) {
      throw new HttpError(422, needsGuarantorForDeposit ? 'deposit_needs_guarantor' : 'guarantor_required');
    }
    if (input.guarantor && input.guarantor.email.toLowerCase() === guest.email.toLowerCase()) throw new HttpError(422, 'guarantor_cannot_be_self');

    const now = new Date();
    const sorted = [...input.occurrences].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const booking: Booking = {
      id: id('bk'), listingId: listing.id, guestId: guest.id, hostId: listing.hostId, occurrences: sorted,
      guests: input.guests, purpose: input.purpose.slice(0, 500), status: 'pending_host', price: q.price,
      paymentMethod: input.paymentMethod, cancellationPolicy: listing.cancellationPolicy, createdAt: now.toISOString(),
      clientReviewsEnabled: !!input.clientReviewsEnabled, rulesAcceptedAt: now.toISOString(), rulesVersion: RULES_VERSION,
      attendance: [], isConsumer: input.isConsumer ?? true,
    };
    if (input.guarantor) {
      booking.guarantor = { ...input.guarantor, token: token(), status: 'invited', liabilityCap: q.guarantorLiabilityCap };
    }
    const payment = newPayment(booking, gateway);
    booking.paymentId = payment.id;
    if (!gateway.instant) {
      // Segura o horário enquanto o locatário paga no checkout do provedor
      booking.status = 'pending_payment';
      booking.paymentDeadline = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60000).toISOString();
    }
    await repo.saveBooking(tx, booking);
    if (input.message?.trim()) {
      await repo.insertMessage(tx, { id: id('msg'), bookingId: booking.id, senderId: guest.id, text: input.message.trim().slice(0, 2000), createdAt: nowIso() });
    }
    if (gateway.instant) {
      markPaid(payment, false);
      await repo.savePayment(tx, payment);
      await afterPaid(tx, gateway, booking, listing, payment, now);
    } else {
      await startCheckout(gateway, payment, booking, listing, guest, checkoutUrls(booking));
      await repo.savePayment(tx, payment);
    }
    await repo.saveBooking(tx, booking);
    return booking;
  });
}

// Pagamento aprovado: pré-autoriza a caução e segue o fluxo (avalista → anfitrião/confirmação).
async function afterPaid(tx: Db, gateway: Gateway, b: Booking, l: Listing, p: Payment, now = new Date()) {
  if (l.securityDeposit > 0 && supportsHold(p.method, gateway)) {
    try {
      await holdDeposit(gateway, p, b.price.securityDeposit);
    } catch (e) {
      // Sem caução pré-autorizada a reserva segue; o anfitrião é avisado e a
      // cobrança de danos vai para o meio salvo/avalista.
      console.error('[caução]', (e as Error).message);
      await notify(tx, { userId: b.hostId }, 'deposit_failed', `Não foi possível pré-autorizar a caução da reserva ${b.id}.`, `/anfitriao/reservas/${b.id}`);
    }
    await repo.savePayment(tx, p);
  }
  b.paymentDeadline = undefined;
  await advanceAfterGuarantor(tx, b, l, now);
}

/** Resultado de pagamento confirmado pelo provedor (webhook). Idempotente. */
export function applyPaymentUpdate(update: PaymentUpdate): Promise<void> {
  return withTx(async (tx) => {
    const pre = await repo.getPayment(tx, update.paymentId);
    if (!pre) return;
    const b = await getBooking(tx, pre.bookingId, true);
    const p = (await repo.getPayment(tx, pre.id, true))!;
    const l = await getListing(tx, b.listingId);
    const gateway = gw(l, p);
    if (update.outcome === 'authorized' || update.outcome === 'captured') {
      if (b.status !== 'pending_payment') {
        // Pago depois de expirar/cancelar: devolve na hora
        if (markPaid(p, update.outcome === 'captured', update)) {
          await voidPayment(gateway, p);
          await repo.savePayment(tx, p);
          await notify(tx, { userId: b.guestId }, 'payment_refunded_late', `Seu pagamento chegou depois do prazo da reserva em "${l.title}" e foi devolvido.`, `/reservas/${b.id}`);
        }
        return;
      }
      if (!markPaid(p, update.outcome === 'captured', update)) return;
      await repo.savePayment(tx, p);
      await afterPaid(tx, gateway, b, l, p);
      await repo.saveBooking(tx, b);
    } else if (update.outcome === 'failed' || update.outcome === 'expired') {
      if (!markFailed(p, update.outcome)) return;
      await repo.savePayment(tx, p);
      if (b.status === 'pending_payment') {
        b.status = 'expired';
        b.paymentDeadline = undefined;
        await repo.saveBooking(tx, b);
        await notify(tx, { userId: b.guestId }, 'payment_failed', `O pagamento da reserva em "${l.title}" não foi concluído. O horário foi liberado.`, `/espacos/${l.id}`);
      }
    } else if (update.outcome === 'refunded' && p.refunded < p.amount) {
      // estorno feito direto no painel do provedor
      p.refunded = p.amount;
      p.status = 'refunded';
      p.history.push({ at: nowIso(), event: 'refund:provider_dashboard', amount: p.amount });
      await repo.savePayment(tx, p);
    }
  });
}

// Após avalista (ou sem avalista): reserva instantânea confirma, senão vai ao anfitrião.
async function advanceAfterGuarantor(tx: Db, b: Booking, l: Listing, now = new Date()) {
  if (b.guarantor && b.guarantor.status !== 'accepted') {
    b.status = 'pending_guarantor';
    b.hostDecisionDeadline = new Date(now.getTime() + BOOKING_LIMITS.guarantorDecisionHours * 3600000).toISOString();
    await notify(tx, { email: b.guarantor.email }, 'guarantor_invite',
      `Você foi indicado(a) como avalista de uma reserva em "${l.title}". Responsabilidade limitada a ${b.guarantor.liabilityCap} ${b.price.currency}.`,
      `${APP_URL}/avalista/${b.guarantor.token}`);
    return;
  }
  // Espaço com registro profissional só confirma sozinho se o anfitrião assumiu a conferência
  const autoConfirm = l.instantBook && (!l.requiresLicense || l.hostLicenseResponsibility);
  if (autoConfirm) {
    if (l.requiresLicense) b.hostLicenseCheckAt = nowIso();
    await confirm(tx, b, l);
  } else {
    b.status = 'pending_host';
    // prazo: 24 h, mas nunca depois do início da reserva
    const deadline = Math.min(now.getTime() + BOOKING_LIMITS.hostDecisionHours * 3600000, firstStart(l, b));
    b.hostDecisionDeadline = new Date(deadline).toISOString();
    await notify(tx, { userId: b.hostId }, 'booking_request', `Nova solicitação de reserva para "${l.title}". Responda em até 24 h.`, `/anfitriao/reservas/${b.id}`);
  }
}

async function confirm(tx: Db, b: Booking, l: Listing) {
  b.status = 'confirmed';
  b.confirmedAt = nowIso();
  b.hostDecisionDeadline = undefined;
  const p = await paymentOf(tx, b, true);
  if (p) {
    await capturePayment(gw(l, p), p);
    await repo.savePayment(tx, p);
  }
  await notify(tx, { userId: b.guestId }, 'booking_confirmed', `Reserva confirmada: "${l.title}". O endereço completo já está disponível.`, `/reservas/${b.id}`);
  await notify(tx, { userId: b.hostId }, 'booking_confirmed', `Reserva confirmada em "${l.title}".`, `/anfitriao/reservas/${b.id}`);
}

async function voidBookingPayment(tx: Db, b: Booking, l: Pick<Listing, 'countryCode'>) {
  const p = await paymentOf(tx, b, true);
  if (p) {
    await voidPayment(gw(l, p), p);
    await repo.savePayment(tx, p);
  }
}

export function respondGuarantor(tok: string, accept: boolean): Promise<Booking> {
  return withTx(async (tx) => {
    const found = await repo.getBookingByGuarantorToken(tx, tok);
    if (!found || !found.guarantor) throw new HttpError(404, 'guarantor_invite_not_found');
    await lockKey(tx, `listing:${found.listingId}`);
    const b = await getBooking(tx, found.id, true);
    if (b.status !== 'pending_guarantor' || b.guarantor!.status !== 'invited') throw new HttpError(409, 'guarantor_invite_closed');
    const g = b.guarantor!;
    const l = await getListing(tx, b.listingId);
    g.status = accept ? 'accepted' : 'declined';
    g.respondedAt = nowIso();
    if (accept) {
      await notify(tx, { userId: b.guestId }, 'guarantor_accepted', `${g.name} aceitou ser seu avalista.`, `/reservas/${b.id}`);
      await advanceAfterGuarantor(tx, b, l);
    } else {
      b.status = 'expired';
      await voidBookingPayment(tx, b, l);
      await notify(tx, { userId: b.guestId }, 'guarantor_declined', `${g.name} recusou ser avalista. A reserva não foi concluída e nada foi cobrado.`, `/reservas/${b.id}`);
    }
    await repo.saveBooking(tx, b);
    return b;
  });
}

export function hostDecision(host: User, bookingId: string, approve: boolean, reason?: string, licenseChecked = false): Promise<Booking> {
  return withTx(async (tx) => {
    const pre = await getBooking(tx, bookingId);
    await lockKey(tx, `listing:${pre.listingId}`);
    const b = await getBooking(tx, bookingId, true);
    if (b.hostId !== host.id) throw new HttpError(403, 'forbidden');
    if (b.status !== 'pending_host') throw new HttpError(409, 'invalid_status');
    const l = await getListing(tx, b.listingId);
    if (approve) {
      // Espaço regulado: o anfitrião declara ter conferido o registro do locatário
      if (l.requiresLicense && !licenseChecked) throw new HttpError(422, 'host_license_check_required');
      if (l.requiresLicense) b.hostLicenseCheckAt = nowIso();
      // revalida conflitos (outra reserva instantânea pode ter entrado)
      const ctx = await validationContext(tx, l, undefined, [], b.id);
      const errs = validateOccurrences(l, b.occurrences, { ...ctx, now: new Date(0) }).filter((e) => e.code === 'conflict');
      if (errs.length) throw new HttpError(409, 'invalid_occurrences', errs);
      await confirm(tx, b, l);
    } else {
      b.status = 'declined';
      b.cancellationReason = reason;
      await voidBookingPayment(tx, b, l);
      await notify(tx, { userId: b.guestId }, 'booking_declined', `O anfitrião não pôde aceitar sua solicitação para "${l.title}". Nada foi cobrado.`, `/reservas/${b.id}`);
    }
    await repo.saveBooking(tx, b);
    return b;
  });
}

export function refundPreview(l: Pick<Listing, 'timezone' | 'countryCode' | 'currency'>, b: Booking, now = new Date()) {
  return computeGuestRefund({
    listing: l, policy: b.cancellationPolicy, occurrences: b.occurrences, price: b.price,
    bookedAt: new Date(b.createdAt), now, isConsumer: b.isConsumer,
  });
}

export function guestCancel(guest: User, bookingId: string, reason: string, now = new Date()): Promise<Booking> {
  return withTx(async (tx) => {
    const b = await getBooking(tx, bookingId, true);
    if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
    if (!['pending_payment', 'pending_guarantor', 'pending_host', 'confirmed'].includes(b.status)) throw new HttpError(409, 'invalid_status');
    const l = await getListing(tx, b.listingId);
    const p = await paymentOf(tx, b, true);
    b.cancelledAt = now.toISOString();
    b.cancellationReason = reason;
    if (b.status !== 'confirmed') {
      // ainda não confirmada: devolve tudo (ou só cancela o checkout)
      if (p) await voidPayment(gw(l, p), p);
      b.refundAmount = b.status === 'pending_payment' ? 0 : b.price.total;
      b.paymentDeadline = undefined;
    } else {
      const r = refundPreview(l, b, now);
      b.refundAmount = p ? await refundPayment(gw(l, p), p, r.total, `guest_cancel:${r.rule}`) : r.total;
      if (p) {
        await releaseDeposit(gw(l, p), p);
        const kept = b.price.baseAmount - r.refundBase + (b.price.cleaningFee - r.refundCleaning);
        p.payoutAmount = roundMoney(kept * (1 - FEES.hostServiceFeeRate), p.currency);
        if (p.payoutAmount <= 0) p.payoutStatus = 'cancelled';
      }
      await notify(tx, { userId: b.hostId }, 'booking_cancelled', `O locatário cancelou a reserva em "${l.title}".`, `/anfitriao/reservas/${b.id}`);
    }
    b.status = 'cancelled_guest';
    if (p) await repo.savePayment(tx, p);
    await repo.saveBooking(tx, b);
    return b;
  });
}

export function hostCancel(host: User, bookingId: string, reason: string, extenuating = false, now = new Date(), licenseDoubt = false): Promise<Booking> {
  return withTx(async (tx) => {
    const b = await getBooking(tx, bookingId, true);
    if (b.hostId !== host.id) throw new HttpError(403, 'forbidden');
    if (!['pending_guarantor', 'confirmed'].includes(b.status)) throw new HttpError(409, 'invalid_status');
    const l = await getListing(tx, b.listingId, true);
    // Dúvida fundada sobre o registro profissional do locatário: cancelar é dever do anfitrião, sem multa nem advertência
    if (licenseDoubt && !l.requiresLicense) throw new HttpError(422, 'license_doubt_not_applicable');
    const p = await paymentOf(tx, b, true);
    if (p) {
      await refundPayment(gw(l, p), p, p.amount - p.refunded, 'host_cancel');
      await releaseDeposit(gw(l, p), p);
      p.payoutStatus = 'cancelled';
      await repo.savePayment(tx, p);
    }
    b.refundAmount = b.price.total;
    b.status = 'cancelled_host';
    b.cancelledAt = now.toISOString();
    b.cancellationReason = reason;
    const hoursBefore = (firstStart(l, b) - now.getTime()) / 3600000;
    if (licenseDoubt) b.cancellationReason = `license_doubt: ${reason}`;
    if (!extenuating && !licenseDoubt && b.confirmedAt) {
      const pen = hostCancellationPenalty(hoursBefore);
      const amount = roundMoney(b.price.baseAmount * pen.feeRate, b.price.currency);
      b.hostPenalty = { amount, reason: 'host_cancellation', at: now.toISOString() };
      const fresh = (await repo.getUser(tx, host.id))!;
      if (pen.strike) await addStrike(tx, fresh, 'host_cancellation');
      Object.assign(host, { strikes: fresh.strikes, suspendedUntil: fresh.suspendedUntil, banned: fresh.banned });
      // bloqueia a agenda nas datas canceladas (impede re-anunciar o mesmo horário)
      for (const o of b.occurrences) if (!l.blockedDates.includes(o.date)) l.blockedDates.push(o.date);
      await repo.updateListing(tx, l);
    }
    await notify(tx, { userId: b.guestId }, 'booking_cancelled_by_host',
      `O anfitrião cancelou sua reserva em "${l.title}". Você receberá reembolso integral. Podemos ajudar a encontrar outro espaço.`, `/reservas/${b.id}`);
    await repo.saveBooking(tx, b);
    return b;
  });
}

function currentOccurrence(l: Listing, b: Booking, now: Date) {
  // ocorrência cujo horário (com 15 min de antecedência) inclui agora, sem check-out
  return b.occurrences.find((o) => {
    const s = occurrenceStartUtc(l, o).getTime() - 15 * 60000;
    const e = occurrenceEndUtc(l, o).getTime() + 3 * 3600000;
    const done = b.attendance.find((a) => a.date === o.date)?.checkOutAt;
    return now.getTime() >= s && now.getTime() <= e && !done;
  });
}

export function checkIn(guest: User, bookingId: string, now = new Date()): Promise<Booking> {
  return withTx(async (tx) => {
    const b = await getBooking(tx, bookingId, true);
    if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
    if (b.status !== 'confirmed') throw new HttpError(409, 'invalid_status');
    const l = await getListing(tx, b.listingId);
    const o = currentOccurrence(l, b, now);
    if (!o) throw new HttpError(409, 'check_in_not_open');
    b.attendance = b.attendance.filter((a) => a.date !== o.date);
    b.attendance.push({ date: o.date, checkInAt: now.toISOString() });
    b.status = 'checked_in';
    await notify(tx, { userId: b.hostId }, 'check_in', `Check-in realizado em "${l.title}" (${o.date} ${o.start}).`, `/anfitriao/reservas/${b.id}`);
    await repo.saveBooking(tx, b);
    return b;
  });
}

export function checkOut(guest: User, bookingId: string, now = new Date()): Promise<Booking> {
  return withTx(async (tx) => {
    const b = await getBooking(tx, bookingId, true);
    if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
    if (b.status !== 'checked_in') throw new HttpError(409, 'invalid_status');
    const l = await getListing(tx, b.listingId);
    const att = b.attendance.find((a) => a.checkInAt && !a.checkOutAt);
    if (!att) throw new HttpError(409, 'invalid_status');
    const o = b.occurrences.find((x) => x.date === att.date)!;
    att.checkOutAt = now.toISOString();
    const over = Math.max(0, Math.round((now.getTime() - occurrenceEndUtc(l, o).getTime()) / 60000));
    att.overstayMinutes = over;
    if (over > OVERSTAY.toleranceMinutes) {
      const amount = suggestedPenalty('overstay', l, b.price, { minutes: over });
      // atraso registrado pelo próprio sistema: cobrança automática, contestável em 48 h
      await openIncident(tx, b, { reporterId: b.hostId, againstUserId: b.guestId, type: 'overstay', description: `Saída ${over} min após o horário contratado (${o.end}).`, evidence: [], requestedAmount: amount }, now);
    }
    const remaining = b.occurrences.some((x) => !b.attendance.find((a) => a.date === x.date)?.checkOutAt && occurrenceEndUtc(l, x).getTime() > now.getTime());
    b.status = remaining ? 'confirmed' : 'completed';
    if (!remaining) b.completedAt = now.toISOString();
    await repo.saveBooking(tx, b);
    return b;
  });
}

// ───────────── Incidentes / penalidades ─────────────
export function reportIncident(reporter: User, bookingId: string, input: { type: IncidentType; description: string; evidence?: string[]; requestedAmount?: number; minutes?: number }, now = new Date()): Promise<Incident> {
  return withTx(async (tx) => {
    const b = await getBooking(tx, bookingId);
    const isHost = b.hostId === reporter.id;
    const isGuest = b.guestId === reporter.id;
    if (!isHost && !isGuest) throw new HttpError(403, 'forbidden');
    const rule = PENALTIES.find((p) => p.type === input.type);
    if (!rule) throw new HttpError(422, 'invalid_incident_type');
    const hostSide: IncidentType[] = ['listing_inaccurate', 'host_no_access', 'safety'];
    if (isGuest && !hostSide.includes(input.type)) throw new HttpError(422, 'invalid_incident_type');
    if (isHost && hostSide.includes(input.type)) throw new HttpError(422, 'invalid_incident_type');
    const l = await getListing(tx, b.listingId);
    const end = lastEnd(l, b);
    if (now.getTime() > end + rule.reportWindowHours * 3600000) throw new HttpError(409, 'report_window_closed', { hours: rule.reportWindowHours });
    const suggested = suggestedPenalty(input.type, l, b.price, { minutes: input.minutes, cost: input.requestedAmount });
    const requested = isGuest ? roundMoney(input.requestedAmount ?? 0, b.price.currency) : (rule.base === 'cost' ? roundMoney(input.requestedAmount ?? 0, b.price.currency) : suggested);
    return openIncident(tx, b, {
      reporterId: reporter.id, againstUserId: isHost ? b.guestId : b.hostId, type: input.type,
      description: input.description.slice(0, 3000), evidence: (input.evidence ?? []).slice(0, 20), requestedAmount: requested,
    }, now);
  });
}

async function openIncident(tx: Db, b: Booking, data: Pick<Incident, 'reporterId' | 'againstUserId' | 'type' | 'description' | 'evidence' | 'requestedAmount'>, now = new Date()) {
  const inc: Incident = {
    id: id('inc'), bookingId: b.id, ...data, status: 'open', createdAt: now.toISOString(),
    responseDeadline: new Date(now.getTime() + INCIDENT_RESPONSE_HOURS * 3600000).toISOString(),
  };
  await repo.saveIncident(tx, inc);
  await notify(tx, { userId: data.againstUserId }, 'incident_opened',
    `Foi aberto um incidente (${data.type}) na sua reserva. Você tem ${INCIDENT_RESPONSE_HOURS} h para aceitar ou contestar.`, `/ocorrencias/${inc.id}`);
  return inc;
}

export function respondIncident(user: User, incidentId: string, accept: boolean, response: string): Promise<Incident> {
  return withTx(async (tx) => {
    const inc = await repo.getIncident(tx, incidentId, true);
    if (!inc) throw new HttpError(404, 'incident_not_found');
    if (inc.againstUserId !== user.id) throw new HttpError(403, 'forbidden');
    if (inc.status !== 'open') throw new HttpError(409, 'invalid_status');
    inc.guestResponse = response.slice(0, 3000);
    if (accept) {
      await applyResolution(tx, inc, { chargedAmount: inc.requestedAmount, note: 'accepted_by_party' });
    } else {
      inc.status = 'contested';
      await repo.saveIncident(tx, inc);
      await notify(tx, { userId: inc.reporterId }, 'incident_contested', 'A outra parte contestou o incidente. A equipe de mediação decidirá em até 5 dias úteis.', `/ocorrencias/${inc.id}`);
    }
    return inc;
  });
}

export function resolveIncident(incidentId: string, decision: { chargedAmount: number; note: string; strike?: boolean; reject?: boolean }): Promise<Incident> {
  return withTx(async (tx) => {
    const inc = await repo.getIncident(tx, incidentId, true);
    if (!inc) throw new HttpError(404, 'incident_not_found');
    if (!['open', 'contested'].includes(inc.status)) throw new HttpError(409, 'invalid_status');
    return applyResolution(tx, inc, decision);
  });
}

async function applyResolution(tx: Db, inc: Incident, decision: { chargedAmount: number; note: string; strike?: boolean; reject?: boolean }) {
  const b = await getBooking(tx, inc.bookingId, true);
  const rule = PENALTIES.find((p) => p.type === inc.type)!;
  if (decision.reject) {
    inc.status = 'rejected';
    inc.resolution = { at: nowIso(), chargedAmount: 0, strike: false, note: decision.note, chargedFrom: 'none' };
    await repo.saveIncident(tx, inc);
    return inc;
  }
  const p = await paymentOf(tx, b, true);
  let chargedFrom: 'payment' | 'deposit' | 'guarantor' | 'none' = 'none';
  const amount = roundMoney(Math.max(0, decision.chargedAmount), b.price.currency);
  const againstGuest = inc.againstUserId === b.guestId;
  let payLink: string | undefined;
  if (amount > 0 && p) {
    const l = await getListing(tx, b.listingId);
    if (againstGuest) {
      const guest = (await repo.getUser(tx, b.guestId))!;
      const r = await chargeExtra(gw(l, p), p, amount, inc.type, guest, checkoutUrls(b));
      chargedFrom = r.from;
      payLink = r.payLink;
      // valor cobrado do locatário é repassado ao anfitrião (reparo, limpeza, atraso)
      if (p.payoutStatus === 'scheduled') p.payoutAmount = roundMoney(p.payoutAmount + amount, p.currency);
    } else {
      // contra o anfitrião: reembolso ao locatário descontado do repasse
      await refundPayment(gw(l, p), p, amount, `incident:${inc.type}`);
      p.payoutAmount = roundMoney(Math.max(0, p.payoutAmount - amount), p.currency);
      chargedFrom = 'payment';
    }
    await repo.savePayment(tx, p);
  }
  const strike = decision.strike ?? rule.strike;
  const against = await repo.getUser(tx, inc.againstUserId);
  if (strike && against) await addStrike(tx, against, inc.type, inc.id, !!rule.severe);
  if (inc.type === 'illegal_practice' && against) {
    // registro profissional revogado; a comunicação às autoridades é feita pela equipe após revisão humana
    const fresh = (await repo.getUser(tx, against.id))!;
    fresh.licenseStatus = 'rejected';
    if (fresh.professionalLicense) fresh.professionalLicense.verified = false;
    await repo.updateUser(tx, fresh);
  }
  inc.status = 'resolved';
  inc.resolution = { at: nowIso(), chargedAmount: amount, strike, note: decision.note, chargedFrom };
  await repo.saveIncident(tx, inc);
  if (amount > 0 && againstGuest && b.guarantor?.status === 'accepted' && chargedFrom === 'payment') {
    await notify(tx, { email: b.guarantor.email }, 'guarantor_notice', `Aviso ao avalista: houve cobrança de ${amount} ${b.price.currency} na reserva ${b.id}. Se o locatário não pagar em 5 dias, a cobrança poderá ser direcionada a você, até o limite de ${b.guarantor.liabilityCap}.`);
  }
  if (payLink) {
    await notify(tx, { userId: b.guestId }, 'extra_charge_link', `Pague ${amount} ${b.price.currency} referentes ao incidente da reserva ${b.id}. Sem pagamento em 5 dias, o valor poderá ser cobrado do avalista.`, payLink);
  }
  await notify(tx, { userId: inc.againstUserId }, 'incident_resolved', `Incidente resolvido. Valor: ${amount} ${b.price.currency}.`, `/ocorrencias/${inc.id}`);
  await notify(tx, { userId: inc.reporterId }, 'incident_resolved', `Incidente resolvido. Valor: ${amount} ${b.price.currency}.`, `/ocorrencias/${inc.id}`);
  return inc;
}

// ───────────── Avaliações ─────────────
export function reviewWindowOpen(l: Pick<Listing, 'timezone'>, b: Booking, now = new Date()) {
  const end = lastEnd(l, b);
  const started = b.attendance.some((a) => a.checkInAt) || b.status === 'completed';
  return started && now.getTime() >= firstStart(l, b) && now.getTime() <= end + REVIEW_RULES.windowDays * 86400000;
}

export async function revealReviewsIfBoth(tx: Db, bookingId: string) {
  await tx.query(
    `UPDATE reviews SET visible = true WHERE booking_id = $1 AND kind <> 'client_to_listing'
       AND (SELECT count(DISTINCT kind) FROM reviews WHERE booking_id = $1 AND kind <> 'client_to_listing') = 2`,
    [bookingId]);
}

// ───────────── Rotina periódica ─────────────
// Cada reserva é tratada numa transação própria, com a linha travada e o
// estado relido — seguro com várias instâncias do servidor rodando o tick.
export async function tick(now = new Date()) {
  const candidates = await repo.findBookings(pool,
    `status IN ('pending_payment','pending_host','pending_guarantor','confirmed','checked_in')
     OR (status IN ('completed','cancelled_guest','cancelled_host') AND id IN (
       SELECT booking_id FROM payments WHERE payout_status = 'scheduled' OR deposit_status = 'held'))
     OR id IN (SELECT booking_id FROM reviews WHERE NOT visible AND kind <> 'client_to_listing')`);
  for (const c of candidates) {
    await withTx(async (tx) => {
      const b = await repo.getBooking(tx, c.id, true);
      const l = b && (await repo.getListing(tx, b.listingId));
      if (!b || !l) return;
      const p = await paymentOf(tx, b, true);
      let changed = false;
      if (b.status === 'pending_payment' && b.paymentDeadline && new Date(b.paymentDeadline) < now) {
        // checkout abandonado: libera o horário
        b.status = 'expired';
        b.paymentDeadline = undefined;
        if (p) await voidPayment(gw(l, p), p).catch((e) => console.error('[tick] cancelar checkout', (e as Error).message));
        changed = true;
      }
      if ((b.status === 'pending_host' || b.status === 'pending_guarantor') && b.hostDecisionDeadline && new Date(b.hostDecisionDeadline) < now) {
        b.status = 'expired';
        if (p) await voidPayment(gw(l, p), p);
        await notify(tx, { userId: b.guestId }, 'booking_expired', `Sua solicitação para "${l.title}" expirou sem resposta. Nada foi cobrado.`, `/reservas/${b.id}`);
        changed = true;
      }
      const start = firstStart(l, b);
      const end = lastEnd(l, b);
      if (['confirmed', 'checked_in', 'completed'].includes(b.status) && p && p.payoutStatus === 'scheduled' && now.getTime() >= start + FEES.payoutDelayHours * 3600000) {
        const hostDispute = await repo.findIncidents(tx, "booking_id = $1 AND status IN ('open','contested') AND against_user_id = $2", [b.id, b.hostId]);
        if (!hostDispute.length) { payHost(p); changed = true; }
      }
      if (b.status === 'confirmed' && now.getTime() > end) {
        b.status = 'completed';
        b.completedAt = new Date(end).toISOString();
        changed = true;
      }
      if (b.status === 'checked_in' && now.getTime() > end + 3 * 3600000) {
        // esqueceu o check-out: encerra no horário contratado
        const att = b.attendance.find((a) => !a.checkOutAt);
        if (att) att.checkOutAt = new Date(end).toISOString();
        b.status = 'completed';
        b.completedAt = new Date(end).toISOString();
        changed = true;
      }
      if (p && p.depositStatus === 'held' && ['completed', 'cancelled_guest', 'cancelled_host'].includes(b.status) && now.getTime() > end + FEES.depositReleaseHours * 3600000) {
        const open = await repo.findIncidents(tx, "booking_id = $1 AND status IN ('open','contested')", [b.id]);
        if (!open.length) { await releaseDeposit(gw(l, p), p); changed = true; }
      }
      if (now.getTime() > end + REVIEW_RULES.windowDays * 86400000) {
        await tx.query("UPDATE reviews SET visible = true WHERE booking_id = $1 AND NOT visible AND kind <> 'client_to_listing'", [b.id]);
      }
      if (changed) {
        await repo.saveBooking(tx, b);
        if (p) await repo.savePayment(tx, p);
      }
    });
  }
  const expired = await repo.findIncidents(pool, "status = 'open' AND response_deadline < $1", [now.toISOString()]);
  for (const inc of expired) {
    await resolveIncident(inc.id, { chargedAmount: inc.requestedAmount, note: 'no_response_within_deadline' }).catch(() => {});
  }
}
