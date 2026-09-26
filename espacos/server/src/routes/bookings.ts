import { Router } from 'express';
import { z } from 'zod';
import { id, nowIso, pool, token, withTx, type Db } from '../db.js';
import * as repo from '../repo.js';
import { HttpError, requireAuth, toPublicUser, type AuthedRequest } from '../auth.js';
import { assertEmailVerified } from '../emailVerification.js';
import {
  checkIn, checkOut, createBooking, getBooking, getListing, guestCancel, hostCancel, hostDecision, paymentOf,
  refundPreview, reportIncident, resolveIncident, respondGuarantor, respondIncident, revealReviewsIfBoth, reviewWindowOpen,
} from '../bookings.js';
import { publicListing } from './listings.js';
import { latestLicenseCheck } from '../verification.js';
import { notify } from '../notify.js';
import { REVIEW_RULES } from '../../../shared/rules.js';
import type { Booking, Review, User } from '../../../shared/types.js';

export const bookingsRouter = Router();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const occurrence = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: hhmm, end: hhmm });

function ensureParty(b: Booking, user: User) {
  if (b.guestId !== user.id && b.hostId !== user.id && !user.roles.includes('admin')) throw new HttpError(403, 'forbidden');
}

async function bookingView(db: Db, b: Booking, viewer: User) {
  const listing = await getListing(db, b.listingId);
  const users = await repo.getUsers(db, [b.guestId, b.hostId]);
  const guest = users.get(b.guestId)!;
  const host = users.get(b.hostId)!;
  const isHost = viewer.id === b.hostId;
  const payment = await paymentOf(db, b);
  const allReviews = await repo.findReviews(db, 'booking_id = $1', [b.id]);
  const myReview = allReviews.find((r) => r.authorId === viewer.id);
  const reviews = allReviews
    .filter((r) => r.visible || r.authorId === viewer.id)
    .map((r) => (r.authorId === viewer.id ? r : { ...r, privateNote: r.targetUserId === viewer.id ? r.privateNote : undefined }));
  return {
    ...b,
    // dados do avalista só para o próprio locatário
    guarantor: b.guarantor && (!isHost ? { ...b.guarantor, token: undefined } : { name: b.guarantor.name, status: b.guarantor.status, liabilityCap: b.guarantor.liabilityCap }),
    listing: await publicListing(db, listing, viewer),
    guest: {
      ...(await toPublicUser(db, guest)),
      // o anfitrião confere o registro do locatário em espaços regulados
      professionalLicense: isHost ? guest.professionalLicense : undefined,
      licenseStatus: isHost ? guest.licenseStatus : undefined,
      licenseCheck: isHost && listing.requiresLicense ? await latestLicenseCheck(db, guest.id) : undefined,
    },
    host: await toPublicUser(db, host),
    payment: payment && {
      status: payment.status, method: payment.method, provider: payment.provider, amount: payment.amount, refunded: payment.refunded,
      checkoutUrl: !isHost && b.status === 'pending_payment' ? payment.checkoutUrl : undefined,
      depositHold: payment.depositHold, depositStatus: payment.depositStatus, extraCharges: payment.extraCharges,
      payoutStatus: isHost ? payment.payoutStatus : undefined, payoutAmount: isHost ? payment.payoutAmount : undefined,
    },
    refundPreview: !isHost && b.status === 'confirmed' ? refundPreview(listing, b) : undefined,
    reviewWindowOpen: reviewWindowOpen(listing, b),
    myReview,
    reviews,
    incidents: await repo.findIncidents(db, 'booking_id = $1', [b.id]),
    clientInvites: !isHost ? await repo.invitesForBooking(db, b.id) : undefined,
  };
}

bookingsRouter.post('/bookings', requireAuth, async (req: AuthedRequest, res) => {
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
  assertEmailVerified(req.user!);
  const b = await createBooking(req.user!, data);
  res.status(201).json(await bookingView(pool, b, req.user!));
});

bookingsRouter.get('/bookings', requireAuth, async (req: AuthedRequest, res) => {
  const role = req.query.role === 'host' ? 'host' : 'guest';
  const list = await repo.findBookings(pool, `${role === 'host' ? 'host_id' : 'guest_id'} = $1`, [req.user!.id],
    '(SELECT min(date + start_time) FROM booking_occurrences o WHERE o.booking_id = bookings.id) DESC');
  const listings = await repo.getListings(pool, [...new Set(list.map((b) => b.listingId))]);
  const others = await repo.getUsers(pool, [...new Set(list.map((b) => (role === 'host' ? b.guestId : b.hostId)))]);
  res.json(list.map((b) => {
    const l = listings.get(b.listingId)!;
    const other = others.get(role === 'host' ? b.guestId : b.hostId);
    return { ...b, guarantor: b.guarantor && { name: b.guarantor.name, status: b.guarantor.status }, listing: { id: l.id, title: l.title, city: l.city, countryCode: l.countryCode, category: l.category, photos: l.photos, timezone: l.timezone }, otherName: other?.name };
  }));
});

bookingsRouter.get('/bookings/:id', requireAuth, async (req: AuthedRequest, res) => {
  const b = await getBooking(pool, req.params.id);
  ensureParty(b, req.user!);
  res.json(await bookingView(pool, b, req.user!));
});

bookingsRouter.post('/bookings/:id/approve', requireAuth, async (req: AuthedRequest, res) => {
  const { licenseChecked } = z.object({ licenseChecked: z.boolean().optional() }).parse(req.body ?? {});
  res.json(await bookingView(pool, await hostDecision(req.user!, req.params.id, true, undefined, !!licenseChecked), req.user!));
});
bookingsRouter.post('/bookings/:id/decline', requireAuth, async (req: AuthedRequest, res) => {
  const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
  res.json(await bookingView(pool, await hostDecision(req.user!, req.params.id, false, reason), req.user!));
});
bookingsRouter.post('/bookings/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
  res.json(await bookingView(pool, await guestCancel(req.user!, req.params.id, reason), req.user!));
});
bookingsRouter.post('/bookings/:id/host-cancel', requireAuth, async (req: AuthedRequest, res) => {
  const { reason, extenuating, licenseDoubt } = z.object({ reason: z.string().min(3).max(500), extenuating: z.boolean().optional(), licenseDoubt: z.boolean().optional() }).parse(req.body);
  res.json(await bookingView(pool, await hostCancel(req.user!, req.params.id, reason, !!extenuating, new Date(), !!licenseDoubt), req.user!));
});
bookingsRouter.post('/bookings/:id/check-in', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await bookingView(pool, await checkIn(req.user!, req.params.id), req.user!));
});
bookingsRouter.post('/bookings/:id/check-out', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await bookingView(pool, await checkOut(req.user!, req.params.id), req.user!));
});

// ───────────── Mensagens ─────────────
const CONTACT_PATTERN = /([\w.+-]+@[\w-]+\.[\w.]+)|(\+?\d[\d\s().-]{7,}\d)/g;

bookingsRouter.get('/bookings/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const b = await getBooking(pool, req.params.id);
  ensureParty(b, req.user!);
  res.json(await repo.messagesForBooking(pool, b.id));
});
bookingsRouter.post('/bookings/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const b = await getBooking(pool, req.params.id);
  ensureParty(b, req.user!);
  let { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
  // Antes da confirmação, contatos são ocultados para evitar pagamento fora da plataforma
  let flagged = false;
  if (!['confirmed', 'checked_in', 'completed'].includes(b.status) && new RegExp(CONTACT_PATTERN.source).test(text)) {
    text = text.replace(CONTACT_PATTERN, '[contato oculto até a confirmação]');
    flagged = true;
  }
  const msg = { id: id('msg'), bookingId: b.id, senderId: req.user!.id, text, createdAt: nowIso(), flagged };
  await withTx(async (tx) => {
    await repo.insertMessage(tx, msg);
    const to = req.user!.id === b.guestId ? b.hostId : b.guestId;
    await notify(tx, { userId: to }, 'message', `Nova mensagem de ${req.user!.name}.`, req.user!.id === b.guestId ? `/anfitriao/reservas/${b.id}` : `/reservas/${b.id}`);
  });
  res.status(201).json(msg);
});

// ───────────── Avaliações ─────────────
const rating = z.number().int().min(1).max(5);

bookingsRouter.post('/bookings/:id/review', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const pre = await getBooking(pool, req.params.id);
  const isGuest = pre.guestId === user.id;
  const cats = isGuest ? REVIEW_RULES.guestCategories : REVIEW_RULES.hostCategories;
  const data = z.object({
    rating,
    categories: z.object(Object.fromEntries(cats.map((c) => [c, rating])) as Record<string, typeof rating>),
    comment: z.string().min(REVIEW_RULES.minCommentLength).max(REVIEW_RULES.maxCommentLength),
    privateNote: z.string().max(1000).optional(),
    wouldRecommend: z.boolean().optional(),
  }).parse(req.body);
  const review = await withTx(async (tx) => {
    const b = await getBooking(tx, req.params.id, true);
    if (b.guestId !== user.id && b.hostId !== user.id) throw new HttpError(403, 'forbidden');
    const l = await getListing(tx, b.listingId);
    if (!reviewWindowOpen(l, b)) throw new HttpError(409, 'review_window_closed');
    const kind = isGuest ? 'guest_to_listing' : 'host_to_guest';
    if ((await repo.findReviews(tx, 'booking_id = $1 AND kind = $2', [b.id, kind])).length) throw new HttpError(409, 'already_reviewed');
    const r: Review = {
      id: id('rev'), kind, bookingId: b.id, listingId: b.listingId, authorId: user.id, authorName: user.name.split(' ')[0],
      targetUserId: isGuest ? b.hostId : b.guestId, ...data, createdAt: nowIso(), visible: false,
    };
    await repo.insertReview(tx, r);
    await revealReviewsIfBoth(tx, b.id);
    await notify(tx, { userId: r.targetUserId }, 'review_received', 'Você recebeu uma avaliação. Ela ficará visível quando você avaliar também ou ao fim do prazo de 14 dias.', isGuest ? `/anfitriao/reservas/${b.id}` : `/reservas/${b.id}`);
    return r;
  });
  res.status(201).json(review);
});

bookingsRouter.post('/reviews/:id/response', requireAuth, async (req: AuthedRequest, res) => {
  const { text } = z.object({ text: z.string().min(2).max(1000) }).parse(req.body);
  const r = await repo.getReview(pool, req.params.id);
  if (!r) throw new HttpError(404, 'review_not_found');
  const listing = await getListing(pool, r.listingId);
  const allowed = r.kind === 'host_to_guest' ? r.targetUserId === req.user!.id : listing.hostId === req.user!.id;
  if (!allowed) throw new HttpError(403, 'forbidden');
  // só grava se ainda não houver resposta (evita corrida entre duas respostas)
  const upd = await pool.query('UPDATE reviews SET response_text = $2, response_at = now() WHERE id = $1 AND response_text IS NULL', [r.id, text]);
  if (!upd.rowCount) throw new HttpError(409, 'already_responded');
  res.json(await repo.getReview(pool, r.id));
});

// ───────────── Avaliação por clientes finais (opcional, a pedido do locatário) ─────────────
bookingsRouter.post('/bookings/:id/client-invites', requireAuth, async (req: AuthedRequest, res) => {
  const { count, label } = z.object({ count: z.number().int().min(1).max(20), label: z.string().max(80).optional() }).parse(req.body);
  const created = await withTx(async (tx) => {
    const b = await getBooking(tx, req.params.id, true);
    if (b.guestId !== req.user!.id) throw new HttpError(403, 'forbidden');
    if (!['checked_in', 'completed', 'confirmed'].includes(b.status) || !b.attendance.some((a) => a.checkInAt)) throw new HttpError(409, 'client_invites_after_check_in');
    const existing = (await repo.invitesForBooking(tx, b.id)).length;
    if (existing + count > REVIEW_RULES.maxClientInvitesPerBooking) throw new HttpError(409, 'client_invites_limit', { max: REVIEW_RULES.maxClientInvitesPerBooking });
    b.clientReviewsEnabled = true;
    await repo.saveBooking(tx, b);
    const now = Date.now();
    const list = Array.from({ length: count }, () => ({
      token: token(), bookingId: b.id, listingId: b.listingId, createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + REVIEW_RULES.clientInviteDays * 86400000).toISOString(), label,
    }));
    for (const inv of list) await repo.insertInvite(tx, inv);
    return list;
  });
  res.status(201).json(created);
});

bookingsRouter.get('/client-review/:token', async (req, res) => {
  const inv = await repo.getInvite(pool, req.params.token);
  if (!inv) throw new HttpError(404, 'invite_not_found');
  const l = await getListing(pool, inv.listingId);
  res.json({ listing: { title: l.title, city: l.city, countryCode: l.countryCode, category: l.category }, used: !!inv.usedAt, expired: new Date(inv.expiresAt) < new Date() });
});

bookingsRouter.post('/client-review/:token', async (req, res) => {
  const data = z.object({
    rating,
    categories: z.object(Object.fromEntries(REVIEW_RULES.clientCategories.map((c) => [c, rating])) as Record<string, typeof rating>),
    comment: z.string().min(REVIEW_RULES.minCommentLength).max(1000),
    displayName: z.string().max(40).optional(),
    consent: z.literal(true),
  }).parse(req.body);
  await withTx(async (tx) => {
    const inv = await repo.getInvite(tx, req.params.token, true);
    if (!inv) throw new HttpError(404, 'invite_not_found');
    if (inv.usedAt) throw new HttpError(409, 'invite_used');
    if (new Date(inv.expiresAt) < new Date()) throw new HttpError(409, 'invite_expired');
    await tx.query('UPDATE client_invites SET used_at = now() WHERE token = $1', [inv.token]);
    await repo.insertReview(tx, {
      id: id('rev'), kind: 'client_to_listing', bookingId: inv.bookingId, listingId: inv.listingId,
      authorName: data.displayName?.trim() || 'Cliente', rating: data.rating, categories: data.categories, comment: data.comment,
      createdAt: nowIso(), visible: true,
    });
  });
  res.status(201).json({ ok: true });
});

// ───────────── Avalista ─────────────
bookingsRouter.get('/guarantor/:token', async (req, res) => {
  const b = await repo.getBookingByGuarantorToken(pool, req.params.token);
  if (!b || !b.guarantor) throw new HttpError(404, 'guarantor_invite_not_found');
  const l = await getListing(pool, b.listingId);
  const guest = (await repo.getUser(pool, b.guestId))!;
  res.json({
    guarantorName: b.guarantor.name, guestName: guest.name, status: b.guarantor.status, bookingStatus: b.status,
    liabilityCap: b.guarantor.liabilityCap, currency: b.price.currency, total: b.price.total,
    listing: { title: l.title, city: l.city, countryCode: l.countryCode }, occurrences: b.occurrences, deadline: b.hostDecisionDeadline,
  });
});
bookingsRouter.post('/guarantor/:token', async (req, res) => {
  const { accept, consent } = z.object({ accept: z.boolean(), consent: z.boolean().optional() }).parse(req.body);
  if (accept && !consent) throw new HttpError(422, 'guarantor_consent_required');
  const b = await respondGuarantor(req.params.token, accept);
  res.json({ status: b.guarantor!.status, bookingStatus: b.status });
});

// ───────────── Incidentes / Central de resolução ─────────────
bookingsRouter.post('/bookings/:id/incidents', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    type: z.string(),
    description: z.string().min(10).max(3000),
    evidence: z.array(z.string().max(500)).max(20).optional(),
    requestedAmount: z.number().min(0).optional(),
    minutes: z.number().int().min(0).max(720).optional(),
  }).parse(req.body);
  res.status(201).json(await reportIncident(req.user!, req.params.id, data as never));
});

bookingsRouter.get('/incidents/:id', requireAuth, async (req: AuthedRequest, res) => {
  const inc = await repo.getIncident(pool, req.params.id);
  if (!inc) throw new HttpError(404, 'incident_not_found');
  ensureParty(await getBooking(pool, inc.bookingId), req.user!);
  res.json(inc);
});

bookingsRouter.post('/incidents/:id/respond', requireAuth, async (req: AuthedRequest, res) => {
  const { accept, response } = z.object({ accept: z.boolean(), response: z.string().max(3000).default('') }).parse(req.body);
  res.json(await respondIncident(req.user!, req.params.id, accept, response));
});

bookingsRouter.get('/admin/incidents', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  res.json(await repo.findIncidents(pool, "status IN ('open','contested')"));
});
bookingsRouter.post('/admin/incidents/:id/resolve', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const d = z.object({ chargedAmount: z.number().min(0), note: z.string().min(3), strike: z.boolean().optional(), reject: z.boolean().optional() }).parse(req.body);
  res.json(await resolveIncident(req.params.id, d));
});

// ───────────── Notificações ─────────────
bookingsRouter.get('/notifications', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await repo.notificationsForUser(pool, req.user!.id));
});
bookingsRouter.post('/notifications/read', requireAuth, async (req: AuthedRequest, res) => {
  await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND NOT read', [req.user!.id]);
  res.status(204).end();
});

