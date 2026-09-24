// Serviço de reservas: criação, aprovação, avalista, cancelamentos, check-in/out,
// ocorrências (penalidades) e rotina periódica (expirações, repasses, caução,
// liberação de avaliações).

import { db, id, nowIso, save, token } from './db';
import { HttpError, addStrike, assertCanTransact } from './auth';
import { notify } from './notify';
import { authorizePayment, capturePayment, chargeExtra, payHost, refundPayment, releaseDeposit, supportsHold, voidPayment } from './payments';
import type { Booking, Incident, IncidentType, Listing, Occurrence, User } from '../../shared/types';
import {
  BOOKING_LIMITS, FEES, addDays, GUARANTOR_RULES, INCIDENT_RESPONSE_HOURS, OVERSTAY, PENALTIES, REVIEW_RULES, RULES_VERSION,
  computeGuestRefund, computePrice, daysBetween, guarantorRequired, hostCancellationPenalty, occurrenceEndUtc,
  occurrenceHours, occurrenceStartUtc, roundMoney, suggestedPenalty, validateOccurrences,
} from '../../shared/rules';
import { getCountry } from '../../shared/countries';

export const ACTIVE_STATUSES: Booking['status'][] = ['pending_guarantor', 'pending_host', 'confirmed', 'checked_in'];
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

export function getListing(listingId: string): Listing {
  const l = db.listings.find((x) => x.id === listingId);
  if (!l) throw new HttpError(404, 'listing_not_found');
  return l;
}

export function getBooking(bookingId: string): Booking {
  const b = db.bookings.find((x) => x.id === bookingId);
  if (!b) throw new HttpError(404, 'booking_not_found');
  return b;
}

export function paymentOf(b: Booking) {
  return db.payments.find((p) => p.id === b.paymentId);
}

function firstStart(l: Listing, b: Pick<Booking, 'occurrences'>) {
  return Math.min(...b.occurrences.map((o) => occurrenceStartUtc(l, o).getTime()));
}
function lastEnd(l: Listing, b: Pick<Booking, 'occurrences'>) {
  return Math.max(...b.occurrences.map((o) => occurrenceEndUtc(l, o).getTime()));
}

export function validationContext(listing: Listing, guestId: string | undefined, occurrences: Occurrence[], excludeBookingId?: string) {
  const active = db.bookings.filter((b) => b.listingId === listing.id && ACTIVE_STATUSES.includes(b.status) && b.id !== excludeBookingId);
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
    for (const b of db.bookings.filter((x) => x.listingId === listing.id && x.guestId === guestId && ['confirmed', 'checked_in', 'completed'].includes(x.status))) {
      const o = b.occurrences;
      if (o.length >= BOOKING_LIMITS.maxRecurringWeeks && daysBetween(o[0].date, o[1].date) === 7) {
        const until = addDays(o[o.length - 1].date, BOOKING_LIMITS.cooldownDaysAfterMaxSeries);
        if (!seriesCooldownUntil || until > seriesCooldownUntil) seriesCooldownUntil = until;
      }
    }
  }
  return { existing: active, guestHoursLast30Days: guestHours, guestActiveSeries: series, seriesCooldownUntil };
}

export function quote(listing: Listing, occurrences: Occurrence[], guest?: User) {
  const errors = validateOccurrences(listing, occurrences, validationContext(listing, guest?.id, occurrences));
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

export function createBooking(guest: User, input: CreateBookingInput): Booking {
  assertCanTransact(guest);
  const listing = getListing(input.listingId);
  if (!listing.active) throw new HttpError(409, 'listing_inactive');
  if (listing.hostId === guest.id) throw new HttpError(409, 'cannot_book_own_listing');
  if (!input.acceptRules) throw new HttpError(422, 'rules_not_accepted');
  if (input.guests < 1 || input.guests > listing.capacity) throw new HttpError(422, 'over_capacity', { max: listing.capacity });
  if (listing.requiresLicense && !guest.professionalLicense?.verified) throw new HttpError(422, 'license_required');
  const country = getCountry(listing.countryCode);
  if (!country.paymentMethods.includes(input.paymentMethod as never)) throw new HttpError(422, 'payment_method_unavailable');

  const q = quote(listing, input.occurrences, guest);
  if (q.errors.length) throw new HttpError(422, 'invalid_occurrences', q.errors);

  const needsGuarantorForDeposit = listing.securityDeposit > 0 && !supportsHold(input.paymentMethod);
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
    booking.guarantor = {
      ...input.guarantor, token: token(), status: 'invited', liabilityCap: q.guarantorLiabilityCap,
    };
  }
  const payment = authorizePayment(booking);
  booking.paymentId = payment.id;
  db.bookings.push(booking);
  if (input.message?.trim()) {
    db.messages.push({ id: id('msg'), bookingId: booking.id, senderId: guest.id, text: input.message.trim().slice(0, 2000), createdAt: nowIso() });
  }
  advanceAfterGuarantor(booking, listing, now);
  save();
  return booking;
}

// Após avalista (ou sem avalista): reserva instantânea confirma, senão vai ao anfitrião.
function advanceAfterGuarantor(b: Booking, l: Listing, now = new Date()) {
  if (b.guarantor && b.guarantor.status !== 'accepted') {
    b.status = 'pending_guarantor';
    b.hostDecisionDeadline = new Date(now.getTime() + BOOKING_LIMITS.guarantorDecisionHours * 3600000).toISOString();
    notify({ email: b.guarantor.email }, 'guarantor_invite',
      `Você foi indicado(a) como avalista de uma reserva em "${l.title}". Responsabilidade limitada a ${b.guarantor.liabilityCap} ${b.price.currency}.`,
      `${APP_URL}/avalista/${b.guarantor.token}`);
    return;
  }
  if (l.instantBook) {
    confirm(b, l);
  } else {
    b.status = 'pending_host';
    // prazo: 24 h, mas nunca depois do início da reserva
    const deadline = Math.min(now.getTime() + BOOKING_LIMITS.hostDecisionHours * 3600000, firstStart(l, b));
    b.hostDecisionDeadline = new Date(deadline).toISOString();
    notify({ userId: b.hostId }, 'booking_request', `Nova solicitação de reserva para "${l.title}". Responda em até 24 h.`, `/anfitriao/reservas/${b.id}`);
  }
}

function confirm(b: Booking, l: Listing) {
  b.status = 'confirmed';
  b.confirmedAt = nowIso();
  b.hostDecisionDeadline = undefined;
  const p = paymentOf(b);
  if (p) capturePayment(p);
  notify({ userId: b.guestId }, 'booking_confirmed', `Reserva confirmada: "${l.title}". O endereço completo já está disponível.`, `/reservas/${b.id}`);
  notify({ userId: b.hostId }, 'booking_confirmed', `Reserva confirmada em "${l.title}".`, `/anfitriao/reservas/${b.id}`);
}

export function respondGuarantor(tok: string, accept: boolean) {
  const b = db.bookings.find((x) => x.guarantor?.token === tok);
  if (!b || !b.guarantor) throw new HttpError(404, 'guarantor_invite_not_found');
  if (b.status !== 'pending_guarantor' || b.guarantor.status !== 'invited') throw new HttpError(409, 'guarantor_invite_closed');
  const l = getListing(b.listingId);
  b.guarantor.status = accept ? 'accepted' : 'declined';
  b.guarantor.respondedAt = nowIso();
  if (accept) {
    notify({ userId: b.guestId }, 'guarantor_accepted', `${b.guarantor.name} aceitou ser seu avalista.`, `/reservas/${b.id}`);
    advanceAfterGuarantor(b, l);
  } else {
    b.status = 'expired';
    const p = paymentOf(b);
    if (p) voidPayment(p);
    notify({ userId: b.guestId }, 'guarantor_declined', `${b.guarantor.name} recusou ser avalista. A reserva não foi concluída e nada foi cobrado.`, `/reservas/${b.id}`);
  }
  save();
  return b;
}

export function hostDecision(host: User, bookingId: string, approve: boolean, reason?: string) {
  const b = getBooking(bookingId);
  if (b.hostId !== host.id) throw new HttpError(403, 'forbidden');
  if (b.status !== 'pending_host') throw new HttpError(409, 'invalid_status');
  const l = getListing(b.listingId);
  if (approve) {
    // revalida conflitos (outra reserva instantânea pode ter entrado)
    const errs = validateOccurrences(l, b.occurrences, { ...validationContext(l, undefined, [], b.id), now: new Date(0) })
      .filter((e) => e.code === 'conflict');
    if (errs.length) throw new HttpError(409, 'invalid_occurrences', errs);
    confirm(b, l);
  } else {
    b.status = 'declined';
    b.cancellationReason = reason;
    const p = paymentOf(b);
    if (p) voidPayment(p);
    notify({ userId: b.guestId }, 'booking_declined', `O anfitrião não pôde aceitar sua solicitação para "${l.title}". Nada foi cobrado.`, `/reservas/${b.id}`);
  }
  save();
  return b;
}

export function refundPreview(b: Booking, now = new Date()) {
  const l = getListing(b.listingId);
  return computeGuestRefund({
    listing: l, policy: b.cancellationPolicy, occurrences: b.occurrences, price: b.price,
    bookedAt: new Date(b.createdAt), now, isConsumer: b.isConsumer,
  });
}

export function guestCancel(guest: User, bookingId: string, reason: string, now = new Date()) {
  const b = getBooking(bookingId);
  if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
  if (!['pending_guarantor', 'pending_host', 'confirmed'].includes(b.status)) throw new HttpError(409, 'invalid_status');
  const l = getListing(b.listingId);
  const p = paymentOf(b);
  b.cancelledAt = now.toISOString();
  b.cancellationReason = reason;
  if (b.status !== 'confirmed') {
    // ainda não confirmada: nada foi capturado
    if (p) voidPayment(p);
    b.refundAmount = b.price.total;
  } else {
    const r = refundPreview(b, now);
    b.refundAmount = p ? refundPayment(p, r.total, `guest_cancel:${r.rule}`) : r.total;
    if (p) {
      releaseDeposit(p);
      const kept = b.price.baseAmount - r.refundBase + (b.price.cleaningFee - r.refundCleaning);
      p.payoutAmount = roundMoney(kept * (1 - FEES.hostServiceFeeRate), p.currency);
      if (p.payoutAmount <= 0) p.payoutStatus = 'cancelled';
    }
    notify({ userId: b.hostId }, 'booking_cancelled', `O locatário cancelou a reserva em "${l.title}".`, `/anfitriao/reservas/${b.id}`);
  }
  b.status = 'cancelled_guest';
  save();
  return b;
}

export function hostCancel(host: User, bookingId: string, reason: string, extenuating = false, now = new Date()) {
  const b = getBooking(bookingId);
  if (b.hostId !== host.id) throw new HttpError(403, 'forbidden');
  if (!['pending_guarantor', 'confirmed'].includes(b.status)) throw new HttpError(409, 'invalid_status');
  const l = getListing(b.listingId);
  const p = paymentOf(b);
  if (p) {
    refundPayment(p, p.amount - p.refunded, 'host_cancel');
    releaseDeposit(p);
    p.payoutStatus = 'cancelled';
  }
  b.refundAmount = b.price.total;
  b.status = 'cancelled_host';
  b.cancelledAt = now.toISOString();
  b.cancellationReason = reason;
  const hoursBefore = (firstStart(l, b) - now.getTime()) / 3600000;
  if (!extenuating && b.confirmedAt) {
    const pen = hostCancellationPenalty(hoursBefore);
    const amount = roundMoney(b.price.baseAmount * pen.feeRate, b.price.currency);
    b.hostPenalty = { amount, reason: 'host_cancellation', at: now.toISOString() };
    if (pen.strike) addStrike(host, 'host_cancellation');
    // bloqueia a agenda nas datas canceladas (impede re-anunciar o mesmo horário)
    for (const o of b.occurrences) if (!l.blockedDates.includes(o.date)) l.blockedDates.push(o.date);
  }
  notify({ userId: b.guestId }, 'booking_cancelled_by_host',
    `O anfitrião cancelou sua reserva em "${l.title}". Você receberá reembolso integral. Podemos ajudar a encontrar outro espaço.`, `/reservas/${b.id}`);
  save();
  return b;
}

function currentOccurrence(l: Listing, b: Booking, now: Date) {
  // ocorrência cujo horário (com 15 min de antecedência) inclui agora, ou a mais próxima já iniciada sem check-out
  return b.occurrences.find((o) => {
    const s = occurrenceStartUtc(l, o).getTime() - 15 * 60000;
    const e = occurrenceEndUtc(l, o).getTime() + 3 * 3600000;
    const done = b.attendance.find((a) => a.date === o.date)?.checkOutAt;
    return now.getTime() >= s && now.getTime() <= e && !done;
  });
}

export function checkIn(guest: User, bookingId: string, now = new Date()) {
  const b = getBooking(bookingId);
  if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
  if (b.status !== 'confirmed') throw new HttpError(409, 'invalid_status');
  const l = getListing(b.listingId);
  const o = currentOccurrence(l, b, now);
  if (!o) throw new HttpError(409, 'check_in_not_open');
  b.attendance = b.attendance.filter((a) => a.date !== o.date);
  b.attendance.push({ date: o.date, checkInAt: now.toISOString() });
  b.status = 'checked_in';
  notify({ userId: b.hostId }, 'check_in', `Check-in realizado em "${l.title}" (${o.date} ${o.start}).`, `/anfitriao/reservas/${b.id}`);
  save();
  return b;
}

export function checkOut(guest: User, bookingId: string, now = new Date()) {
  const b = getBooking(bookingId);
  if (b.guestId !== guest.id) throw new HttpError(403, 'forbidden');
  if (b.status !== 'checked_in') throw new HttpError(409, 'invalid_status');
  const l = getListing(b.listingId);
  const att = b.attendance.find((a) => a.checkInAt && !a.checkOutAt);
  if (!att) throw new HttpError(409, 'invalid_status');
  const o = b.occurrences.find((x) => x.date === att.date)!;
  att.checkOutAt = now.toISOString();
  const over = Math.max(0, Math.round((now.getTime() - occurrenceEndUtc(l, o).getTime()) / 60000));
  att.overstayMinutes = over;
  if (over > OVERSTAY.toleranceMinutes) {
    const amount = suggestedPenalty('overstay', l, b.price, { minutes: over });
    // atraso registrado pelo próprio sistema: cobrança automática, contestável em 48 h
    openIncident(b, { reporterId: b.hostId, againstUserId: b.guestId, type: 'overstay', description: `Saída ${over} min após o horário contratado (${o.end}).`, evidence: [], requestedAmount: amount });
  }
  const remaining = b.occurrences.some((x) => !b.attendance.find((a) => a.date === x.date)?.checkOutAt && occurrenceEndUtc(l, x).getTime() > now.getTime());
  b.status = remaining ? 'confirmed' : 'completed';
  if (!remaining) b.completedAt = now.toISOString();
  save();
  return b;
}

// ───────────── Ocorrências / penalidades ─────────────
export function reportIncident(reporter: User, bookingId: string, input: { type: IncidentType; description: string; evidence?: string[]; requestedAmount?: number; minutes?: number }, now = new Date()) {
  const b = getBooking(bookingId);
  const isHost = b.hostId === reporter.id;
  const isGuest = b.guestId === reporter.id;
  if (!isHost && !isGuest) throw new HttpError(403, 'forbidden');
  const rule = PENALTIES.find((p) => p.type === input.type);
  if (!rule) throw new HttpError(422, 'invalid_incident_type');
  const hostSide: IncidentType[] = ['listing_inaccurate', 'host_no_access', 'safety'];
  if (isGuest && !hostSide.includes(input.type)) throw new HttpError(422, 'invalid_incident_type');
  if (isHost && hostSide.includes(input.type)) throw new HttpError(422, 'invalid_incident_type');
  const l = getListing(b.listingId);
  const end = lastEnd(l, b);
  if (now.getTime() > end + rule.reportWindowHours * 3600000) throw new HttpError(409, 'report_window_closed', { hours: rule.reportWindowHours });
  const suggested = suggestedPenalty(input.type, l, b.price, { minutes: input.minutes, cost: input.requestedAmount });
  const requested = isGuest ? roundMoney(input.requestedAmount ?? 0, b.price.currency) : (rule.base === 'cost' ? roundMoney(input.requestedAmount ?? 0, b.price.currency) : suggested);
  return openIncident(b, {
    reporterId: reporter.id, againstUserId: isHost ? b.guestId : b.hostId, type: input.type,
    description: input.description.slice(0, 3000), evidence: (input.evidence ?? []).slice(0, 20), requestedAmount: requested,
  }, now);
}

function openIncident(b: Booking, data: Pick<Incident, 'reporterId' | 'againstUserId' | 'type' | 'description' | 'evidence' | 'requestedAmount'>, now = new Date()) {
  const inc: Incident = {
    id: id('inc'), bookingId: b.id, ...data, status: 'open', createdAt: now.toISOString(),
    responseDeadline: new Date(now.getTime() + INCIDENT_RESPONSE_HOURS * 3600000).toISOString(),
  };
  db.incidents.push(inc);
  notify({ userId: data.againstUserId }, 'incident_opened',
    `Foi aberta uma ocorrência (${data.type}) na sua reserva. Você tem ${INCIDENT_RESPONSE_HOURS} h para aceitar ou contestar.`, `/ocorrencias/${inc.id}`);
  save();
  return inc;
}

export function respondIncident(user: User, incidentId: string, accept: boolean, response: string) {
  const inc = db.incidents.find((i) => i.id === incidentId);
  if (!inc) throw new HttpError(404, 'incident_not_found');
  if (inc.againstUserId !== user.id) throw new HttpError(403, 'forbidden');
  if (inc.status !== 'open') throw new HttpError(409, 'invalid_status');
  inc.guestResponse = response.slice(0, 3000);
  if (accept) resolveIncident(inc, { chargedAmount: inc.requestedAmount, note: 'accepted_by_party' });
  else {
    inc.status = 'contested';
    notify({ userId: inc.reporterId }, 'incident_contested', 'A outra parte contestou a ocorrência. A equipe de mediação decidirá em até 5 dias úteis.', `/ocorrencias/${inc.id}`);
  }
  save();
  return inc;
}

export function resolveIncident(inc: Incident, decision: { chargedAmount: number; note: string; strike?: boolean; reject?: boolean }) {
  const b = getBooking(inc.bookingId);
  const rule = PENALTIES.find((p) => p.type === inc.type)!;
  const against = db.users.find((u) => u.id === inc.againstUserId);
  const p = paymentOf(b);
  if (decision.reject) {
    inc.status = 'rejected';
    inc.resolution = { at: nowIso(), chargedAmount: 0, strike: false, note: decision.note, chargedFrom: 'none' };
    save();
    return inc;
  }
  let chargedFrom: 'payment' | 'deposit' | 'guarantor' | 'none' = 'none';
  const amount = roundMoney(Math.max(0, decision.chargedAmount), b.price.currency);
  const againstGuest = inc.againstUserId === b.guestId;
  if (amount > 0 && p) {
    if (againstGuest) {
      chargedFrom = chargeExtra(p, amount, inc.type);
      // valor cobrado do locatário é repassado ao anfitrião (reparo, limpeza, atraso)
      if (p.payoutStatus === 'scheduled') p.payoutAmount = roundMoney(p.payoutAmount + amount, p.currency);
    } else {
      // contra o anfitrião: reembolso ao locatário descontado do repasse
      refundPayment(p, amount, `incident:${inc.type}`);
      p.payoutAmount = roundMoney(Math.max(0, p.payoutAmount - amount), p.currency);
      chargedFrom = 'payment';
    }
  }
  const strike = decision.strike ?? rule.strike;
  if (strike && against) addStrike(against, inc.type, inc.id, !!rule.severe);
  inc.status = 'resolved';
  inc.resolution = { at: nowIso(), chargedAmount: amount, strike, note: decision.note, chargedFrom };
  if (amount > 0 && againstGuest && b.guarantor?.status === 'accepted' && chargedFrom === 'payment') {
    notify({ email: b.guarantor.email }, 'guarantor_notice', `Aviso ao avalista: houve cobrança de ${amount} ${b.price.currency} na reserva ${b.id}. Se o locatário não pagar em 5 dias, a cobrança poderá ser direcionada a você, até o limite de ${b.guarantor.liabilityCap}.`);
  }
  notify({ userId: inc.againstUserId }, 'incident_resolved', `Ocorrência resolvida. Valor: ${amount} ${b.price.currency}.`, `/ocorrencias/${inc.id}`);
  notify({ userId: inc.reporterId }, 'incident_resolved', `Ocorrência resolvida. Valor: ${amount} ${b.price.currency}.`, `/ocorrencias/${inc.id}`);
  save();
  return inc;
}

// ───────────── Avaliações ─────────────
export function reviewWindowOpen(b: Booking, now = new Date()) {
  const l = getListing(b.listingId);
  const end = lastEnd(l, b);
  const started = b.attendance.some((a) => a.checkInAt) || b.status === 'completed';
  return started && now.getTime() >= firstStart(l, b) && now.getTime() <= end + REVIEW_RULES.windowDays * 86400000;
}

export function revealReviewsIfBoth(bookingId: string) {
  const rs = db.reviews.filter((r) => r.bookingId === bookingId && r.kind !== 'client_to_listing');
  if (rs.some((r) => r.kind === 'guest_to_listing') && rs.some((r) => r.kind === 'host_to_guest')) rs.forEach((r) => (r.visible = true));
}

// ───────────── Rotina periódica ─────────────
export function tick(now = new Date()) {
  let changed = false;
  for (const b of db.bookings) {
    const l = db.listings.find((x) => x.id === b.listingId);
    if (!l) continue;
    const p = paymentOf(b);
    if ((b.status === 'pending_host' || b.status === 'pending_guarantor') && b.hostDecisionDeadline && new Date(b.hostDecisionDeadline) < now) {
      b.status = 'expired';
      if (p) voidPayment(p);
      notify({ userId: b.guestId }, 'booking_expired', `Sua solicitação para "${l.title}" expirou sem resposta. Nada foi cobrado.`, `/reservas/${b.id}`);
      changed = true;
    }
    const start = firstStart(l, b);
    const end = lastEnd(l, b);
    if (['confirmed', 'checked_in', 'completed'].includes(b.status) && p && p.payoutStatus === 'scheduled' && now.getTime() >= start + FEES.payoutDelayHours * 3600000) {
      const hasOpenIncident = db.incidents.some((i) => i.bookingId === b.id && ['open', 'contested'].includes(i.status) && i.againstUserId === b.hostId);
      if (!hasOpenIncident) { payHost(p); changed = true; }
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
      const open = db.incidents.some((i) => i.bookingId === b.id && ['open', 'contested'].includes(i.status));
      if (!open) { releaseDeposit(p); changed = true; }
    }
    if (now.getTime() > end + REVIEW_RULES.windowDays * 86400000) {
      for (const r of db.reviews) if (r.bookingId === b.id && !r.visible && r.kind !== 'client_to_listing') { r.visible = true; changed = true; }
    }
  }
  for (const inc of db.incidents) {
    if (inc.status === 'open' && new Date(inc.responseDeadline) < now) {
      resolveIncident(inc, { chargedAmount: inc.requestedAmount, note: 'no_response_within_deadline' });
      changed = true;
    }
  }
  if (changed) save();
}
