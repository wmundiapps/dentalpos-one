import { Router } from 'express';
import { z } from 'zod';
import { id, nowIso, pool, rows, withTx, type Db } from '../db.js';
import * as repo from '../repo.js';
import { HttpError, optionalAuth, requireAuth, toPublicUser, type AuthedRequest } from '../auth.js';
import { isLaunched } from '../launch.js';
import { notify } from '../notify.js';
import { brCity, brStateName } from '../../../shared/br-locations.js';
import { connectedHostIds, marketplaceEnabled } from '../payments/mpAccounts.js';
import { MERCADOPAGO_COUNTRIES } from '../payments/mercadopago.js';

const MP_COUNTRIES: readonly string[] = MERCADOPAGO_COUNTRIES;
import { getListing, quote } from '../bookings.js';
import { COUNTRY_BY_CODE, getCity } from '../../../shared/countries.js';
import { AMENITIES, BOOKING_LIMITS, CATEGORIES, FEES, toMinutes, validateOccurrences, weekdayOf } from '../../../shared/rules.js';
import type { Listing, TimeRange, User } from '../../../shared/types.js';

export const listingsRouter = Router();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const range = z.object({ start: hhmm, end: hhmm }).refine((r) => toMinutes(r.start) < toMinutes(r.end), 'range');

const listingSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(5000),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  countryCode: z.string(),
  state: z.string().max(3).optional(),
  city: z.string().min(2).max(120),
  neighborhood: z.string().max(120).optional(),
  address: z.string().min(5).max(300),
  capacity: z.number().int().min(1).max(2000),
  areaM2: z.number().positive().max(100000).optional(),
  amenities: z.array(z.enum(AMENITIES as unknown as [string, ...string[]])).max(60),
  equipment: z.string().max(3000).default(''),
  photos: z.array(z.string().max(1000).refine((u) => /^https:\/\//.test(u) || /^\/api\/uploads\/[\w-]+$/.test(u), 'photo_url')).max(20).default([]),
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
  hostLicenseResponsibility: z.boolean().default(false),
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
  if (!country || !isLaunched(data.countryCode)) throw new HttpError(422, 'country_not_supported');
  // Brasil: Estado → Município da lista oficial do IBGE; demais países: cidades atendidas
  let city: { name: string; tz: string } | undefined;
  if (data.countryCode === 'BR') {
    if (!data.state || !brStateName(data.state)) throw new HttpError(422, 'state_required');
    city = brCity(data.state, data.city);
  } else {
    city = getCity(data.countryCode, data.city);
  }
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
  return { currency: country.currency, timezone: city.tz, city: city.name, state: data.countryCode === 'BR' ? data.state : undefined };
}

/** Endereço completo só para o anfitrião e para quem tem reserva confirmada. */
async function addressVisibleTo(db: Db, listings: Listing[], viewer?: User) {
  if (!viewer) return new Set<string>();
  const booked = await rows<{ listing_id: string }>(db,
    "SELECT DISTINCT listing_id FROM bookings WHERE guest_id = $1 AND listing_id = ANY($2) AND status IN ('confirmed','checked_in','completed')",
    [viewer.id, listings.map((l) => l.id)]);
  return new Set([...listings.filter((l) => l.hostId === viewer.id).map((l) => l.id), ...booked.map((r) => r.listing_id)]);
}

export async function publicListings(db: Db, listings: Listing[], viewer?: User) {
  const ratings = await repo.ratingSummaries(db, listings.map((l) => l.id));
  const visible = await addressVisibleTo(db, listings, viewer);
  return listings.map((l) => {
    const { address, ...rest } = l;
    return { ...rest, address: visible.has(l.id) ? address : undefined, ...ratings(l.id) };
  });
}

export async function publicListing(db: Db, l: Listing, viewer?: User) {
  return (await publicListings(db, [l], viewer))[0];
}

listingsRouter.get('/listings', optionalAuth, async (req: AuthedRequest, res) => {
  const q = req.query as Record<string, string | undefined>;
  let list = await repo.searchListings(pool, {
    country: q.country, state: q.state, city: q.city, category: q.category, guests: q.guests ? Number(q.guests) : undefined,
    minPrice: q.minPrice ? Number(q.minPrice) : undefined, maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
    instant: q.instant === '1', noGuarantor: q.noGuarantor === '1', amenities: q.amenities?.split(',').filter(Boolean), q: q.q,
  });
  list = list.filter((l) => isLaunched(l.countryCode));
  // Com o split ligado, só aparecem anúncios de anfitriões com conta de recebimento conectada
  if (marketplaceEnabled() && process.env.PAYMENTS_PROVIDER !== 'simulated') {
    const connected = await connectedHostIds([...new Set(list.filter((l) => MP_COUNTRIES.includes(l.countryCode)).map((l) => l.hostId))]);
    list = list.filter((l) => !MP_COUNTRIES.includes(l.countryCode) || connected.has(l.hostId));
  }
  if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
    const date = q.date;
    if (q.start && q.end) {
      // ocupação do dia para os candidatos, numa única consulta
      const busy = await rows<{ listing_id: string; start_time: string; end_time: string }>(pool,
        `SELECT o.listing_id, o.start_time, o.end_time FROM booking_occurrences o JOIN bookings b ON b.id = o.booking_id
         WHERE o.date = $1 AND o.listing_id = ANY($2) AND b.status = ANY($3)`, [date, list.map((l) => l.id), repo.ACTIVE_STATUSES]);
      list = list.filter((l) => {
        const existing = busy.filter((x) => x.listing_id === l.id).map((x) => ({ occurrences: [{ date, start: x.start_time.slice(0, 5), end: x.end_time.slice(0, 5) }] }));
        const errs = validateOccurrences(l, [{ date, start: q.start!, end: q.end! }], { existing, guestHoursLast30Days: 0, guestActiveSeries: 0 })
          .filter((e) => ['outside_availability', 'date_blocked', 'conflict'].includes(e.code));
        return errs.length === 0;
      });
    } else {
      list = list.filter((l) => !l.blockedDates.includes(date) && (l.weeklyAvailability[weekdayOf(date) as 0]?.length ?? 0) > 0);
    }
  }
  const results = await publicListings(pool, list, req.user);
  if (q.sort === 'price_asc') results.sort((a, b) => a.pricePerHour - b.pricePerHour);
  else if (q.sort === 'price_desc') results.sort((a, b) => b.pricePerHour - a.pricePerHour);
  else results.sort((a, b) => (b.rating ?? 0) * Math.log(2 + b.reviewCount) - (a.rating ?? 0) * Math.log(2 + a.reviewCount));
  res.json(results);
});

listingsRouter.get('/listings/:id', optionalAuth, async (req: AuthedRequest, res) => {
  const l = await getListing(pool, req.params.id);
  if (!l.active && l.hostId !== req.user?.id) throw new HttpError(404, 'listing_not_found');
  const host = (await repo.getUser(pool, l.hostId))!;
  const reviews = (await repo.findReviews(pool, "listing_id = $1 AND visible AND kind <> 'host_to_guest'", [l.id]))
    .map(({ privateNote: _pn, authorId: _a, ...r }) => r);
  res.json({ listing: await publicListing(pool, l, req.user), host: await toPublicUser(pool, host), reviews });
});

// Horários já ocupados de um dia (sem dados dos locatários)
listingsRouter.get('/listings/:id/busy', async (req, res) => {
  const l = await getListing(pool, req.params.id);
  const date = String(req.query.date ?? '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const busy = valid ? await rows<{ start: string; end: string }>(pool,
    `SELECT to_char(o.start_time, 'HH24:MI') AS start, to_char(o.end_time, 'HH24:MI') AS "end"
     FROM booking_occurrences o JOIN bookings b ON b.id = o.booking_id
     WHERE o.listing_id = $1 AND o.date = $2 AND b.status = ANY($3) ORDER BY o.start_time`, [l.id, date, repo.ACTIVE_STATUSES]) : [];
  res.json({
    date, busy, bufferMinutes: l.bufferMinutes, blocked: l.blockedDates.includes(date),
    windows: valid ? l.weeklyAvailability[weekdayOf(date) as 0] ?? [] : [],
  });
});

listingsRouter.post('/listings/:id/quote', optionalAuth, async (req: AuthedRequest, res) => {
  const l = await getListing(pool, req.params.id);
  const { occurrences } = z.object({ occurrences: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: hhmm, end: hhmm })).min(1).max(52) }).parse(req.body);
  res.json(await quote(pool, l, occurrences, req.user));
});

listingsRouter.post('/listings', requireAuth, async (req: AuthedRequest, res) => {
  const data = listingSchema.parse(req.body);
  const derived = checkListingRules(data);
  const user = req.user!;
  const listing: Listing = {
    ...(data as unknown as Listing), ...derived, id: id('lst'), hostId: user.id, createdAt: nowIso(),
  };
  await withTx(async (tx) => {
    if (!user.roles.includes('host')) {
      user.roles.push('host');
      await repo.updateUser(tx, user);
    }
    await repo.insertListing(tx, listing);
    // Boas-vindas ao anúncio + convite para o SpaceHour ADS (destaque pago, em breve)
    const needsPayout = marketplaceEnabled() && MP_COUNTRIES.includes(listing.countryCode) && !(await connectedHostIds([user.id])).has(user.id);
    await notify(tx, { userId: user.id }, 'listing_published', [
      `Seu anúncio "${listing.title}" foi publicado no SpaceHour! 🎉`,
      needsPayout ? 'Falta um passo para começar a receber reservas: conecte sua conta Mercado Pago no Painel do anfitrião. O valor de cada reserva cai direto na sua conta.' : '',
      `Você pode editar o anúncio quando quiser em Painel do anfitrião → Meus anúncios.`,
      'Quer mais reservas? Com o SpaceHour ADS seu espaço aparece em destaque nas buscas da sua cidade e da sua especialidade. Toque no botão abaixo para conhecer e ser avisado no lançamento.',
    ].filter(Boolean).join('\n\n'), `/anfitriao/ads?anuncio=${listing.id}`);
  });
  res.status(201).json(listing);
});

listingsRouter.put('/listings/:id', requireAuth, async (req: AuthedRequest, res) => {
  const data = listingSchema.parse(req.body);
  const derived = checkListingRules(data);
  const l = await withTx(async (tx) => {
    const cur = await getListing(tx, req.params.id, true);
    if (cur.hostId !== req.user!.id) throw new HttpError(403, 'forbidden');
    // Política de cancelamento das reservas existentes não muda (fica gravada na reserva)
    Object.assign(cur, data, derived);
    await repo.updateListing(tx, cur);
    return cur;
  });
  res.json(l);
});

listingsRouter.get('/host/listings', requireAuth, async (req: AuthedRequest, res) => {
  const list = await repo.searchListings(pool, { hostId: req.user!.id, activeOnly: false });
  const ratings = await repo.ratingSummaries(pool, list.map((l) => l.id));
  res.json(list.map((l) => ({ ...l, ...ratings(l.id) })));
});

// Favoritos (lista de desejos)
listingsRouter.get('/favorites', requireAuth, async (req: AuthedRequest, res) => {
  const ids = (await rows<{ listing_id: string }>(pool, 'SELECT listing_id FROM favorites WHERE user_id = $1 ORDER BY created_at', [req.user!.id])).map((r) => r.listing_id);
  const map = await repo.getListings(pool, ids);
  res.json(await publicListings(pool, ids.map((i) => map.get(i)!).filter(Boolean), req.user));
});
listingsRouter.post('/favorites/:listingId', requireAuth, async (req: AuthedRequest, res) => {
  await getListing(pool, req.params.listingId);
  await pool.query('INSERT INTO favorites (user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user!.id, req.params.listingId]);
  res.status(204).end();
});
listingsRouter.delete('/favorites/:listingId', requireAuth, async (req: AuthedRequest, res) => {
  await pool.query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [req.user!.id, req.params.listingId]);
  res.status(204).end();
});
