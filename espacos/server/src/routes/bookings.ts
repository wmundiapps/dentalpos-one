import { Router } from 'express';
import { z } from 'zod';
import { db, id, nowIso, save, token } from '../db';
import { HttpError, requireAuth, toPublicUser, type AuthedRequest } from '../auth';
import {
  checkIn, checkOut, createBooking, getBooking, getListing, guestCancel, hostCancel, hostDecision, paymentOf,
  refundPreview, reportIncident, resolveIncident, respondGuarantor, respondIncident, revealReviewsIfBoth, reviewWindowOpen,
} from '../bookings';
import { publicListing } from './listings';
import { notify } from '../notify';
import { REVIEW_RULES } from '../../../shared/rules';
import type { Booking, Review, User } from '../../../shared/types';

export const bookingsRouter = Router();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const occurrence = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: hhmm, end: hhmm });

function ensureParty(b: Booking, user: User) {
  if (b.guestId !== user.id && b.hostId !== user.id && !user.roles.includes('admin')) throw new HttpError(403, 'forbidden');
}

function bookingView(b: Booking, viewer: User) {
  const listing = getListing(b.listingId);
  const guest = db.users.find((u) => u.id === b.guestId)!;
  const host = db.users.find((u) => u.id === b.hostId)!;
  const isHost = viewer.id === b.hostId;
  const payment = paymentOf(b);
  const myReview = db.reviews.find((r) => r.bookingId === b.id && r.authorId === viewer.id);
  const reviews = db.reviews.filter((r) => r.bookingId === b.id && (r.visible || r.authorId === viewer.id)).map((r) => (r.authorId === viewer.id ? r : { ...r, privateNote: r.targetUserId === viewer.id ? r.privateNote : undefined }));
  return {
    ...b,
    // dados do avalista só para o próprio locatário
    guarantor: b.guarantor && (!isHost ? { ...b.guarantor, token: undefined } : { name: b.guarantor.name, status: b.guarantor.status, liabilityCap: b.guarantor.liabilityCap }),
    listing: publicListing(listing, viewer),
    guest: { ...toPublicUser(guest), professionalLicense: isHost ? guest.professionalLicense : undefined },
    host: toPublicUser(host),
    payment: payment && {
      status: payment.status, method: payment.method, amount: payment.amount, refunded: payment.refunded,
      depositHold: payment.depositHold, depositStatus: payment.depositStatus, extraCharges: payment.extraCharges,
      payoutStatus: isHost ? payment.payoutStatus : undefined, payoutAmount: isHost ? payment.payoutAmount : undefined,
    },
    refundPreview: !isHost && b.status === 'confirmed' ? refundPreview(b) : undefined,
    reviewWindowOpen: reviewWindowOpen(b),
    myReview,
    reviews,
    incidents: db.incidents.filter((i) => i.bookingId === b.id),
    clientInvites: !isHost ? db.clientInvites.filter((c) => c.bookingId === b.id) : undefined,
  };
}

bookingsRouter.post('/bookings', requireAuth, (req: AuthedRequest, res) => {
  const data = z.object({
    listingId: z.string(),
    occurrences: z.array(occurrence).min(1).max(52),
    guests: z.number().int().min(1),
    purpose: z.string().min(3).max(500),
    paymentMethod: z.string(),
    acceptRules: z.boolean(),
    isConsumer: z.boolean().optional(),
    clientReviewsEnabled: z.boolean().optional(),
    message: z.string().max(2000).optional(),
    guarantor: z.object({
      name: z.string().min(3).max(120), email: z.string().email(), phone: z.string().max(40).optional(),
      documentNumber: z.string().min(4).max(40), relationship: z.string().max(80).optional(),
    }).optional(),
  }).parse(req.body);
  const b = createBooking(req.user!, data);
  res.status(201).json(bookingView(b, req.user!));
});

bookingsRouter.get('/bookings', requireAuth, (req: AuthedRequest, res) => {
  const role = req.query.role === 'host' ? 'host' : 'guest';
  const list = db.bookings
    .filter((b) => (role === 'host' ? b.hostId : b.guestId) === req.user!.id)
    .sort((a, b) => (b.occurrences[0].date + b.occurrences[0].start).localeCompare(a.occurrences[0].date + a.occurrences[0].start));
  res.json(list.map((b) => {
    const l = getListing(b.listingId);
    const other = db.users.find((u) => u.id === (role === 'host' ? b.guestId : b.hostId));
    return { ...b, guarantor: b.guarantor && { name: b.guarantor.name, status: b.guarantor.status }, listing: { id: l.id, title: l.title, city: l.city, countryCode: l.countryCode, category: l.category, photos: l.photos, timezone: l.timezone }, otherName: other?.name };
  }));
});

bookingsRouter.get('/bookings/:id', requireAuth, (req: AuthedRequest, res) => {
  const b = getBooking(req.params.id);
  ensureParty(b, req.user!);
  res.json(bookingView(b, req.user!));
});

bookingsRouter.post('/bookings/:id/approve', requireAuth, (req: AuthedRequest, res) => {
  res.json(bookingView(hostDecision(req.user!, req.params.id, true), req.user!));
});
bookingsRouter.post('/bookings/:id/decline', requireAuth, (req: AuthedRequest, res) => {
  const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  res.json(bookingView(hostDecision(req.user!, req.params.id, false, reason), req.user!));
});
bookingsRouter.post('/bookings/:id/cancel', requireAuth, (req: AuthedRequest, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
  res.json(bookingView(guestCancel(req.user!, req.params.id, reason), req.user!));
});
bookingsRouter.post('/bookings/:id/host-cancel', requireAuth, (req: AuthedRequest, res) => {
  const { reason, extenuating } = z.object({ reason: z.string().min(3).max(500), extenuating: z.boolean().optional() }).parse(req.body);
  res.json(bookingView(hostCancel(req.user!, req.params.id, reason, !!extenuating), req.user!));
});
bookingsRouter.post('/bookings/:id/check-in', requireAuth, (req: AuthedRequest, res) => {
  res.json(bookingView(checkIn(req.user!, req.params.id), req.user!));
});
bookingsRouter.post('/bookings/:id/check-out', requireAuth, (req: AuthedRequest, res) => {
  res.json(bookingView(checkOut(req.user!, req.params.id), req.user!));
});

// ───────────── Mensagens ─────────────
const CONTACT_PATTERN = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{7,}\d)/g;

bookingsRouter.get('/bookings/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const b = getBooking(req.params.id);
  ensureParty(b, req.user!);
  res.json(db.messages.filter((m) => m.bookingId === b.id));
});
bookingsRouter.post('/bookings/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const b = getBooking(req.params.id);
  ensureParty(b, req.user!);
  let { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
  // Antes da confirmação, contatos são ocultados para evitar pagamento fora da plataforma
  let flagged = false;
  if (!['confirmed', 'checked_in', 'completed'].includes(b.status) && new RegExp(CONTACT_PATTERN.source).test(text)) {
    text = text.replace(CONTACT_PATTERN, '[contato oculto até a confirmação]');
    flagged = true;
  }
  const msg = { id: id('msg'), bookingId: b.id, senderId: req.user!.id, text, createdAt: nowIso(), flagged };
  db.messages.push(msg);
  const to = req.user!.id === b.guestId ? b.hostId : b.guestId;
  notify({ userId: to }, 'message', `Nova mensagem de ${req.user!.name}.`, req.user!.id === b.guestId ? `/anfitriao/reservas/${b.id}` : `/reservas/${b.id}`);
  save();
  res.status(201).json(msg);
});

// ───────────── Avaliações ─────────────
const rating = z.number().int().min(1).max(5);

bookingsRouter.post('/bookings/:id/review', requireAuth, (req: AuthedRequest, res) => {
  const b = getBooking(req.params.id);
  const user = req.user!;
  const isGuest = b.guestId === user.id;
  const isHost = b.hostId === user.id;
  if (!isGuest && !isHost) throw new HttpError(403, 'forbidden');
  if (!reviewWindowOpen(b)) throw new HttpError(409, 'review_window_closed');
  const kind = isGuest ? 'guest_to_listing' : 'host_to_guest';
  if (db.reviews.some((r) => r.bookingId === b.id && r.kind === kind)) throw new HttpError(409, 'already_reviewed');
  const cats = isGuest ? REVIEW_RULES.guestCategories : REVIEW_RULES.hostCategories;
  const data = z.object({
    rating,
    categories: z.object(Object.fromEntries(cats.map((c) => [c, rating])) as Record<string, typeof rating>),
    comment: z.string().min(REVIEW_RULES.minCommentLength).max(REVIEW_RULES.maxCommentLength),
    privateNote: z.string().max(1000).optional(),
    wouldRecommend: z.boolean().optional(),
  }).parse(req.body);
  const review: Review = {
    id: id('rev'), kind, bookingId: b.id, listingId: b.listingId, authorId: user.id, authorName: user.name.split(' ')[0],
    targetUserId: isGuest ? b.hostId : b.guestId, ...data, createdAt: nowIso(), visible: false,
  };
  db.reviews.push(review);
  revealReviewsIfBoth(b.id);
  notify({ userId: review.targetUserId }, 'review_received', 'Você recebeu uma avaliação. Ela ficará visível quando você avaliar também ou ao fim do prazo de 14 dias.', isGuest ? `/anfitriao/reservas/${b.id}` : `/reservas/${b.id}`);
  save();
  res.status(201).json(review);
});

bookingsRouter.post('/reviews/:id/response', requireAuth, (req: AuthedRequest, res) => {
  const r = db.reviews.find((x) => x.id === req.params.id);
  if (!r) throw new HttpError(404, 'review_not_found');
  const listing = getListing(r.listingId);
  const allowed = r.kind === 'host_to_guest' ? r.targetUserId === req.user!.id : listing.hostId === req.user!.id;
  if (!allowed) throw new HttpError(403, 'forbidden');
  if (r.response) throw new HttpError(409, 'already_responded');
  const { text } = z.object({ text: z.string().min(2).max(1000) }).parse(req.body);
  r.response = { text, at: nowIso() };
  save();
  res.json(r);
});

// ───────────── Avaliação por clientes finais (opcional, a pedido do locatário) ─────────────
bookingsRouter.post('/bookings/:id/client-invites', requireAuth, (req: AuthedRequest, res) => {
  const b = getBooking(req.params.id);
  if (b.guestId !== req.user!.id) throw new HttpError(403, 'forbidden');
  if (!['checked_in', 'completed', 'confirmed'].includes(b.status) || !b.attendance.some((a) => a.checkInAt)) throw new HttpError(409, 'client_invites_after_check_in');
  const { count, label } = z.object({ count: z.number().int().min(1).max(20), label: z.string().max(80).optional() }).parse(req.body);
  const existing = db.clientInvites.filter((c) => c.bookingId === b.id).length;
  if (existing + count > REVIEW_RULES.maxClientInvitesPerBooking) throw new HttpError(409, 'client_invites_limit', { max: REVIEW_RULES.maxClientInvitesPerBooking });
  b.clientReviewsEnabled = true;
  const now = Date.now();
  const created = Array.from({ length: count }, () => ({
    token: token(), bookingId: b.id, listingId: b.listingId, createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REVIEW_RULES.clientInviteDays * 86400000).toISOString(), label,
  }));
  db.clientInvites.push(...created);
  save();
  res.status(201).json(created);
});

bookingsRouter.get('/client-review/:token', (req, res) => {
  const inv = db.clientInvites.find((c) => c.token === req.params.token);
  if (!inv) throw new HttpError(404, 'invite_not_found');
  const l = getListing(inv.listingId);
  res.json({ listing: { title: l.title, city: l.city, countryCode: l.countryCode, category: l.category }, used: !!inv.usedAt, expired: new Date(inv.expiresAt) < new Date() });
});

bookingsRouter.post('/client-review/:token', (req, res) => {
  const inv = db.clientInvites.find((c) => c.token === req.params.token);
  if (!inv) throw new HttpError(404, 'invite_not_found');
  if (inv.usedAt) throw new HttpError(409, 'invite_used');
  if (new Date(inv.expiresAt) < new Date()) throw new HttpError(409, 'invite_expired');
  const data = z.object({
    rating,
    categories: z.object(Object.fromEntries(REVIEW_RULES.clientCategories.map((c) => [c, rating])) as Record<string, typeof rating>),
    comment: z.string().min(REVIEW_RULES.minCommentLength).max(1000),
    displayName: z.string().max(40).optional(),
    consent: z.literal(true),
  }).parse(req.body);
  inv.usedAt = nowIso();
  db.reviews.push({
    id: id('rev'), kind: 'client_to_listing', bookingId: inv.bookingId, listingId: inv.listingId,
    authorName: data.displayName?.trim() || 'Cliente', rating: data.rating, categories: data.categories, comment: data.comment,
    createdAt: nowIso(), visible: true,
  });
  save();
  res.status(201).json({ ok: true });
});

// ───────────── Avalista ─────────────
bookingsRouter.get('/guarantor/:token', (req, res) => {
  const b = db.bookings.find((x) => x.guarantor?.token === req.params.token);
  if (!b || !b.guarantor) throw new HttpError(404, 'guarantor_invite_not_found');
  const l = getListing(b.listingId);
  const guest = db.users.find((u) => u.id === b.guestId)!;
  res.json({
    guarantorName: b.guarantor.name, guestName: guest.name, status: b.guarantor.status, bookingStatus: b.status,
    liabilityCap: b.guarantor.liabilityCap, currency: b.price.currency, total: b.price.total,
    listing: { title: l.title, city: l.city, countryCode: l.countryCode }, occurrences: b.occurrences, deadline: b.hostDecisionDeadline,
  });
});
bookingsRouter.post('/guarantor/:token', (req, res) => {
  const { accept, consent } = z.object({ accept: z.boolean(), consent: z.boolean().optional() }).parse(req.body);
  if (accept && !consent) throw new HttpError(422, 'guarantor_consent_required');
  const b = respondGuarantor(req.params.token, accept);
  res.json({ status: b.guarantor!.status, bookingStatus: b.status });
});

// ───────────── Ocorrências / Central de resolução ─────────────
bookingsRouter.post('/bookings/:id/incidents', requireAuth, (req: AuthedRequest, res) => {
  const data = z.object({
    type: z.string(),
    description: z.string().min(10).max(3000),
    evidence: z.array(z.string().max(500)).max(20).optional(),
    requestedAmount: z.number().min(0).optional(),
    minutes: z.number().int().min(0).max(720).optional(),
  }).parse(req.body);
  res.status(201).json(reportIncident(req.user!, req.params.id, data as never));
});

bookingsRouter.get('/incidents/:id', requireAuth, (req: AuthedRequest, res) => {
  const inc = db.incidents.find((i) => i.id === req.params.id);
  if (!inc) throw new HttpError(404, 'incident_not_found');
  ensureParty(getBooking(inc.bookingId), req.user!);
  res.json(inc);
});

bookingsRouter.post('/incidents/:id/respond', requireAuth, (req: AuthedRequest, res) => {
  const { accept, response } = z.object({ accept: z.boolean(), response: z.string().max(3000).default('') }).parse(req.body);
  res.json(respondIncident(req.user!, req.params.id, accept, response));
});

bookingsRouter.get('/admin/incidents', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  res.json(db.incidents.filter((i) => i.status === 'contested' || i.status === 'open'));
});
bookingsRouter.post('/admin/incidents/:id/resolve', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const inc = db.incidents.find((i) => i.id === req.params.id);
  if (!inc) throw new HttpError(404, 'incident_not_found');
  if (!['open', 'contested'].includes(inc.status)) throw new HttpError(409, 'invalid_status');
  const d = z.object({ chargedAmount: z.number().min(0), note: z.string().min(3), strike: z.boolean().optional(), reject: z.boolean().optional() }).parse(req.body);
  res.json(resolveIncident(inc, d));
});

// ───────────── Notificações ─────────────
bookingsRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  res.json(db.notifications.filter((n) => n.userId === req.user!.id).slice(-50).reverse());
});
bookingsRouter.post('/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  db.notifications.filter((n) => n.userId === req.user!.id).forEach((n) => (n.read = true));
  save();
  res.status(204).end();
});
