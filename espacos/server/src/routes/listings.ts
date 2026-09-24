import { Router } from 'express';
import { z } from 'zod';
import { db, id, nowIso, save } from '../db';
import { HttpError, optionalAuth, requireAuth, toPublicUser, type AuthedRequest } from '../auth';
import { ACTIVE_STATUSES, getListing, quote } from '../bookings';
import { COUNTRY_BY_CODE, getCity } from '../../../shared/countries';
import { AMENITIES, BOOKING_LIMITS, CATEGORIES, FEES, toMinutes, validateOccurrences, weekdayOf } from '../../../shared/rules';
import type { Listing, Review, TimeRange, User } from '../../../shared/types';

export const listingsRouter = Router();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const range = z.object({ start: hhmm, end: hhmm }).refine((r) => toMinutes(r.start) < toMinutes(r.end), 'range');

const listingSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(5000),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  countryCode: z.string(),
  city: z.string(),
  neighborhood: z.string().max(120).optional(),
  address: z.string().min(5).max(300),
  capacity: z.number().int().min(1).max(2000),
  areaM2: z.number().positive().max(100000).optional(),
  amenities: z.array(z.enum(AMENITIES as unknown as [string, ...string[]])).max(60),
  equipment: z.string().max(3000).default(''),
  photos: z.array(z.string().url()).max(20).default([]),
  pricePerHour: z.number().positive(),
  pricePerDay: z.number().positive().optional(),
  minHours: z.number().int().min(1).max(BOOKING_LIMITS.maxHoursPerOccurrence),
  cleaningFee: z.number().min(0),
  securityDeposit: z.number().min(0),
  instantBook: z.boolean(),
  cancellationPolicy: z.enum(['flexible', 'moderate', 'strict']),
  guarantorPolicy: z.enum(['none', 'optional', 'required', 'required_over_amount']),
  guarantorThreshold: z.number().positive().optional(),
  requiresLicense: z.boolean(),
  houseRules: z.string().min(10).max(5000),
  buildingRules: z.string().max(5000).optional(),
  allowedActivities: z.string().max(2000).optional(),
  forbiddenActivities: z.string().max(2000).optional(),
  bufferMinutes: z.number().int().min(0).max(120),
  weeklyAvailability: z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.array(range).max(6)),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).default([]),
  active: z.boolean().default(true),
});

function checkListingRules(data: z.infer<typeof listingSchema>) {
  const country = COUNTRY_BY_CODE[data.countryCode];
  if (!country) throw new HttpError(422, 'country_not_supported');
  const city = getCity(data.countryCode, data.city);
  if (!city) throw new HttpError(422, 'city_not_supported');
  const refBase = data.pricePerHour * data.minHours;
  if (data.cleaningFee > refBase * FEES.maxCleaningFeeRate) throw new HttpError(422, 'cleaning_fee_too_high', { maxRate: FEES.maxCleaningFeeRate });
  const dayRef = data.pricePerDay ?? data.pricePerHour * BOOKING_LIMITS.maxHoursPerOccurrence;
  if (data.securityDeposit > dayRef * FEES.maxDepositMultiple) throw new HttpError(422, 'deposit_too_high', { maxMultiple: FEES.maxDepositMultiple });
  if (data.guarantorPolicy === 'required_over_amount' && !data.guarantorThreshold) throw new HttpError(422, 'guarantor_threshold_required');
  for (const ranges of Object.values(data.weeklyAvailability)) {
    for (const r of ranges as TimeRange[]) {
      if (toMinutes(r.start) < toMinutes(BOOKING_LIMITS.earliestStart) || toMinutes(r.end) > toMinutes(BOOKING_LIMITS.latestEnd)) {
        throw new HttpError(422, 'availability_outside_platform_hours');
      }
    }
  }
  return { currency: country.currency, timezone: city.tz };
}

function ratingSummary(listingId: string) {
  const rs = db.reviews.filter((r) => r.listingId === listingId && r.visible && r.kind === 'guest_to_listing');
  const cs = db.reviews.filter((r) => r.listingId === listingId && r.visible && r.kind === 'client_to_listing');
  const avg = (xs: Review[]) => (xs.length ? Math.round((xs.reduce((a, r) => a + r.rating, 0) / xs.length) * 100) / 100 : null);
  return { rating: avg(rs), reviewCount: rs.length, clientRating: avg(cs), clientReviewCount: cs.length };
}

export function publicListing(l: Listing, viewer?: User) {
  const canSeeAddress = viewer && (viewer.id === l.hostId || db.bookings.some((b) => b.listingId === l.id && b.guestId === viewer.id && ['confirmed', 'checked_in', 'completed'].includes(b.status)));
  const { address, ...rest } = l;
  return { ...rest, address: canSeeAddress ? address : undefined, ...ratingSummary(l.id) };
}

listingsRouter.get('/listings', optionalAuth, (req: AuthedRequest, res) => {
  const q = req.query as Record<string, string | undefined>;
  let list = db.listings.filter((l) => l.active);
  if (q.country) list = list.filter((l) => l.countryCode === q.country);
  if (q.city) list = list.filter((l) => l.city === q.city);
  if (q.category) list = list.filter((l) => l.category === q.category);
  if (q.guests) list = list.filter((l) => l.capacity >= Number(q.guests));
  if (q.minPrice) list = list.filter((l) => l.pricePerHour >= Number(q.minPrice));
  if (q.maxPrice) list = list.filter((l) => l.pricePerHour <= Number(q.maxPrice));
  if (q.instant === '1') list = list.filter((l) => l.instantBook);
  if (q.noGuarantor === '1') list = list.filter((l) => l.guarantorPolicy === 'none' || l.guarantorPolicy === 'optional');
  if (q.amenities) {
    const req_ = q.amenities.split(',');
    list = list.filter((l) => req_.every((a) => l.amenities.includes(a)));
  }
  if (q.q) {
    const term = q.q.toLowerCase();
    list = list.filter((l) => `${l.title} ${l.description} ${l.city} ${l.neighborhood ?? ''} ${l.equipment}`.toLowerCase().includes(term));
  }
  if (q.date) {
    const date = q.date;
    list = list.filter((l) => {
      if (q.start && q.end) {
        const errs = validateOccurrences(l, [{ date, start: q.start, end: q.end }], {
          existing: db.bookings.filter((b) => b.listingId === l.id && ACTIVE_STATUSES.includes(b.status)), guestHoursLast30Days: 0, guestActiveSeries: 0,
        }).filter((e) => ['outside_availability', 'date_blocked', 'conflict'].includes(e.code));
        return errs.length === 0;
      }
      return !l.blockedDates.includes(date) && (l.weeklyAvailability[weekdayOf(date) as 0]?.length ?? 0) > 0;
    });
  }
  const results = list.map((l) => publicListing(l, req.user));
  if (q.sort === 'price_asc') results.sort((a, b) => a.pricePerHour - b.pricePerHour);
  else if (q.sort === 'price_desc') results.sort((a, b) => b.pricePerHour - a.pricePerHour);
  else results.sort((a, b) => (b.rating ?? 0) * Math.log(2 + b.reviewCount) - (a.rating ?? 0) * Math.log(2 + a.reviewCount));
  res.json(results);
});

listingsRouter.get('/listings/:id', optionalAuth, (req: AuthedRequest, res) => {
  const l = getListing(req.params.id);
  if (!l.active && l.hostId !== req.user?.id) throw new HttpError(404, 'listing_not_found');
  const host = db.users.find((u) => u.id === l.hostId)!;
  const reviews = db.reviews
    .filter((r) => r.listingId === l.id && r.visible && r.kind !== 'host_to_guest')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ privateNote: _pn, authorId: _a, ...r }) => r);
  res.json({ listing: publicListing(l, req.user), host: toPublicUser(host), reviews });
});

// Horários já ocupados de um dia (sem dados dos locatários)
listingsRouter.get('/listings/:id/busy', (req, res) => {
  const l = getListing(req.params.id);
  const date = String(req.query.date ?? '');
  const busy = db.bookings
    .filter((b) => b.listingId === l.id && ACTIVE_STATUSES.includes(b.status))
    .flatMap((b) => b.occurrences.filter((o) => o.date === date).map((o) => ({ start: o.start, end: o.end })));
  res.json({
    date, busy, bufferMinutes: l.bufferMinutes, blocked: l.blockedDates.includes(date),
    windows: date ? l.weeklyAvailability[weekdayOf(date) as 0] ?? [] : [],
  });
});

listingsRouter.post('/listings/:id/quote', optionalAuth, (req: AuthedRequest, res) => {
  const l = getListing(req.params.id);
  const { occurrences } = z.object({ occurrences: z.array(z.object({ date: z.string(), start: hhmm, end: hhmm })).min(1).max(52) }).parse(req.body);
  res.json(quote(l, occurrences, req.user));
});

listingsRouter.post('/listings', requireAuth, (req: AuthedRequest, res) => {
  const data = listingSchema.parse(req.body);
  const derived = checkListingRules(data);
  const user = req.user!;
  if (!user.roles.includes('host')) user.roles.push('host');
  const listing: Listing = {
    ...(data as unknown as Listing), ...derived, id: id('lst'), hostId: user.id, createdAt: nowIso(),
  };
  db.listings.push(listing);
  save();
  res.status(201).json(listing);
});

listingsRouter.put('/listings/:id', requireAuth, (req: AuthedRequest, res) => {
  const l = getListing(req.params.id);
  if (l.hostId !== req.user!.id) throw new HttpError(403, 'forbidden');
  const data = listingSchema.parse(req.body);
  const derived = checkListingRules(data);
  // Política de cancelamento das reservas existentes não muda (fica gravada na reserva)
  Object.assign(l, data, derived);
  save();
  res.json(l);
});

listingsRouter.get('/host/listings', requireAuth, (req: AuthedRequest, res) => {
  res.json(db.listings.filter((l) => l.hostId === req.user!.id).map((l) => ({ ...l, ...ratingSummary(l.id) })));
});

// Favoritos (lista de desejos)
listingsRouter.get('/favorites', requireAuth, (req: AuthedRequest, res) => {
  const ids = db.favorites.filter((f) => f.userId === req.user!.id).map((f) => f.listingId);
  res.json(db.listings.filter((l) => ids.includes(l.id)).map((l) => publicListing(l, req.user)));
});
listingsRouter.post('/favorites/:listingId', requireAuth, (req: AuthedRequest, res) => {
  getListing(req.params.listingId);
  if (!db.favorites.some((f) => f.userId === req.user!.id && f.listingId === req.params.listingId)) {
    db.favorites.push({ userId: req.user!.id, listingId: req.params.listingId });
    save();
  }
  res.status(204).end();
});
listingsRouter.delete('/favorites/:listingId', requireAuth, (req: AuthedRequest, res) => {
  db.favorites = db.favorites.filter((f) => !(f.userId === req.user!.id && f.listingId === req.params.listingId));
  save();
  res.status(204).end();
});
