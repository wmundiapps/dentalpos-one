// Repositório: conversão entre linhas do PostgreSQL e os tipos do domínio
// (shared/types.ts). Toda função recebe o executor (pool ou transação).

import { one, rows, type Db } from './db.js';
import type {
  Booking, ClientReviewInvite, Incident, Listing, Message, Notification, Occurrence, Payment, Review, User,
} from '../../shared/types.js';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | undefined) ?? undefined);
const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);
const hhmm = (v: string) => v.slice(0, 5);

// ───────────── Usuários ─────────────
function toUser(r: any, strikes: any[]): User {
  return {
    id: r.id, email: r.email, passwordHash: r.password_hash, name: r.name, phone: opt(r.phone), countryCode: r.country_code,
    locale: r.locale, roles: r.roles, createdAt: iso(r.created_at)!, identityVerified: r.identity_verified,
    documentType: opt(r.document_type), documentNumber: opt(r.document_number),
    professionalLicense: r.license_body ? { body: r.license_body, number: r.license_number, region: opt(r.license_region), verified: r.license_verified } : undefined,
    licenseStatus: r.license_status,
    companyTaxId: opt(r.company_tax_id), bio: opt(r.bio),
    strikes: strikes.map((s) => ({ at: iso(s.at)!, reason: s.reason, incidentId: opt(s.incident_id) })),
    suspendedUntil: iso(opt(r.suspended_until)), banned: r.banned, termsAcceptedAt: iso(opt(r.terms_accepted_at)), termsVersion: opt(r.terms_version),
  };
}

async function hydrateUser(db: Db, r: any) {
  if (!r) return undefined;
  const strikes = await rows(db, 'SELECT * FROM user_strikes WHERE user_id = $1 ORDER BY at', [r.id]);
  return toUser(r, strikes);
}

export const getUser = async (db: Db, userId: string) => hydrateUser(db, await one(db, 'SELECT * FROM users WHERE id = $1', [userId]));
export const getUserByEmail = async (db: Db, email: string) => hydrateUser(db, await one(db, 'SELECT * FROM users WHERE lower(email) = lower($1)', [email]));

export async function getUsers(db: Db, ids: string[]): Promise<Map<string, User>> {
  const list = await rows(db, 'SELECT * FROM users WHERE id = ANY($1)', [ids]);
  const strikes = await rows(db, 'SELECT * FROM user_strikes WHERE user_id = ANY($1) ORDER BY at', [ids]);
  return new Map(list.map((r) => [r.id, toUser(r, strikes.filter((s) => s.user_id === r.id))]));
}

export async function insertUser(db: Db, u: User) {
  await db.query(
    `INSERT INTO users (id, email, password_hash, name, phone, country_code, locale, roles, created_at, identity_verified,
       document_type, document_number, license_body, license_number, license_region, license_verified, company_tax_id, bio,
       suspended_until, banned, terms_accepted_at, terms_version, license_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    userParams(u),
  );
}

export async function updateUser(db: Db, u: User) {
  await db.query(
    `UPDATE users SET email=$2, password_hash=$3, name=$4, phone=$5, country_code=$6, locale=$7, roles=$8, created_at=$9,
       identity_verified=$10, document_type=$11, document_number=$12, license_body=$13, license_number=$14, license_region=$15,
       license_verified=$16, company_tax_id=$17, bio=$18, suspended_until=$19, banned=$20, terms_accepted_at=$21, terms_version=$22, license_status=$23
     WHERE id=$1`,
    userParams(u),
  );
}

function userParams(u: User) {
  const l = u.professionalLicense;
  return [u.id, u.email, u.passwordHash, u.name, u.phone ?? null, u.countryCode, u.locale, u.roles, u.createdAt, u.identityVerified,
    u.documentType ?? null, u.documentNumber ?? null, l?.body ?? null, l?.number ?? null, l?.region ?? null, l?.verified ?? false,
    u.companyTaxId ?? null, u.bio ?? null, u.suspendedUntil ?? null, !!u.banned, u.termsAcceptedAt ?? null, u.termsVersion ?? null,
    u.licenseStatus ?? 'none'];
}

export async function insertStrike(db: Db, userId: string, s: { at: string; reason: string; incidentId?: string }) {
  await db.query('INSERT INTO user_strikes (user_id, at, reason, incident_id) VALUES ($1,$2,$3,$4)', [userId, s.at, s.reason, s.incidentId ?? null]);
}

/** Médias de avaliação para o perfil público. */
export async function userRatings(db: Db, userId: string) {
  const r = await one(db,
    `SELECT
       (SELECT avg(rv.rating) FROM reviews rv JOIN listings l ON l.id = rv.listing_id WHERE rv.visible AND rv.kind = 'guest_to_listing' AND l.host_id = $1) AS host_avg,
       (SELECT count(*) FROM reviews rv JOIN listings l ON l.id = rv.listing_id WHERE rv.visible AND rv.kind = 'guest_to_listing' AND l.host_id = $1) AS host_n,
       (SELECT avg(rating) FROM reviews WHERE visible AND kind = 'host_to_guest' AND target_user_id = $1) AS guest_avg,
       (SELECT count(*) FROM reviews WHERE visible AND kind = 'host_to_guest' AND target_user_id = $1) AS guest_n`,
    [userId]);
  const round = (v: unknown) => (v == null ? undefined : Math.round(Number(v) * 100) / 100);
  return { ratingAsHost: round(r?.host_avg), reviewCountAsHost: Number(r?.host_n ?? 0), ratingAsGuest: round(r?.guest_avg), reviewCountAsGuest: Number(r?.guest_n ?? 0) };
}

// ───────────── Anúncios ─────────────
function toListing(r: any): Listing {
  return {
    id: r.id, hostId: r.host_id, title: r.title, description: r.description, category: r.category, countryCode: r.country_code,
    state: opt(r.state), city: r.city, timezone: r.timezone, neighborhood: opt(r.neighborhood), address: r.address, capacity: r.capacity,
    areaM2: opt(r.area_m2), amenities: r.amenities, equipment: r.equipment, photos: r.photos, currency: r.currency.trim(),
    pricePerHour: r.price_per_hour, pricePerDay: opt(r.price_per_day), minHours: r.min_hours, cleaningFee: r.cleaning_fee,
    securityDeposit: r.security_deposit, instantBook: r.instant_book, cancellationPolicy: r.cancellation_policy,
    guarantorPolicy: r.guarantor_policy, guarantorThreshold: opt(r.guarantor_threshold), requiresLicense: r.requires_license, hostLicenseResponsibility: r.host_license_responsibility,
    houseRules: r.house_rules, buildingRules: opt(r.building_rules), allowedActivities: opt(r.allowed_activities),
    forbiddenActivities: opt(r.forbidden_activities), bufferMinutes: r.buffer_minutes, weeklyAvailability: r.weekly_availability,
    blockedDates: r.blocked_dates ?? [], active: r.active, createdAt: iso(r.created_at)!,
  };
}

export async function getListing(db: Db, listingId: string, forUpdate = false) {
  const r = await one(db, `SELECT * FROM listings WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [listingId]);
  return r ? toListing(r) : undefined;
}

export async function getListings(db: Db, ids: string[]) {
  return new Map((await rows(db, 'SELECT * FROM listings WHERE id = ANY($1)', [ids])).map((r) => [r.id, toListing(r)]));
}

export interface ListingFilters {
  country?: string; state?: string; city?: string; category?: string; guests?: number; minPrice?: number; maxPrice?: number;
  instant?: boolean; noGuarantor?: boolean; amenities?: string[]; q?: string; hostId?: string; activeOnly?: boolean;
}

export async function searchListings(db: Db, f: ListingFilters): Promise<Listing[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.activeOnly !== false) where.push('active');
  if (f.hostId) add('host_id = ?', f.hostId);
  if (f.country) add('country_code = ?', f.country);
  if (f.state) add('state = ?', f.state);
  if (f.city) add('city = ?', f.city);
  if (f.category) add('category = ?', f.category);
  if (f.guests) add('capacity >= ?', f.guests);
  if (f.minPrice) add('price_per_hour >= ?', f.minPrice);
  if (f.maxPrice) add('price_per_hour <= ?', f.maxPrice);
  if (f.instant) where.push('instant_book');
  if (f.noGuarantor) where.push("guarantor_policy IN ('none','optional')");
  if (f.amenities?.length) add('amenities @> ?', f.amenities);
  if (f.q) add("(title || ' ' || description || ' ' || city || ' ' || coalesce(neighborhood,'') || ' ' || equipment) ILIKE ?", `%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
  const sql = `SELECT * FROM listings${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at`;
  return (await rows(db, sql, params)).map(toListing);
}

export async function insertListing(db: Db, l: Listing) {
  await db.query(
    `INSERT INTO listings (id, host_id, title, description, category, country_code, city, timezone, neighborhood, address, capacity,
       area_m2, amenities, equipment, photos, currency, price_per_hour, price_per_day, min_hours, cleaning_fee, security_deposit,
       instant_book, cancellation_policy, guarantor_policy, guarantor_threshold, requires_license, house_rules, building_rules,
       allowed_activities, forbidden_activities, buffer_minutes, weekly_availability, blocked_dates, active, created_at, host_license_responsibility, state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)`,
    listingParams(l),
  );
}

export async function updateListing(db: Db, l: Listing) {
  await db.query(
    `UPDATE listings SET host_id=$2, title=$3, description=$4, category=$5, country_code=$6, city=$7, timezone=$8, neighborhood=$9,
       address=$10, capacity=$11, area_m2=$12, amenities=$13, equipment=$14, photos=$15, currency=$16, price_per_hour=$17,
       price_per_day=$18, min_hours=$19, cleaning_fee=$20, security_deposit=$21, instant_book=$22, cancellation_policy=$23,
       guarantor_policy=$24, guarantor_threshold=$25, requires_license=$26, house_rules=$27, building_rules=$28,
       allowed_activities=$29, forbidden_activities=$30, buffer_minutes=$31, weekly_availability=$32, blocked_dates=$33,
       active=$34, created_at=$35, host_license_responsibility=$36, state=$37
     WHERE id=$1`,
    listingParams(l),
  );
}

function listingParams(l: Listing) {
  return [l.id, l.hostId, l.title, l.description, l.category, l.countryCode, l.city, l.timezone, l.neighborhood ?? null, l.address,
    l.capacity, l.areaM2 ?? null, l.amenities, l.equipment, l.photos, l.currency, l.pricePerHour, l.pricePerDay ?? null, l.minHours,
    l.cleaningFee, l.securityDeposit, l.instantBook, l.cancellationPolicy, l.guarantorPolicy, l.guarantorThreshold ?? null,
    l.requiresLicense, l.houseRules, l.buildingRules ?? null, l.allowedActivities ?? null, l.forbiddenActivities ?? null,
    l.bufferMinutes, JSON.stringify(l.weeklyAvailability), l.blockedDates, l.active, l.createdAt, !!l.hostLicenseResponsibility, l.state ?? null];
}

export async function ratingSummaries(db: Db, listingIds: string[]) {
  const list = await rows(db,
    `SELECT listing_id,
       avg(rating) FILTER (WHERE kind = 'guest_to_listing') AS rating, count(*) FILTER (WHERE kind = 'guest_to_listing') AS n,
       avg(rating) FILTER (WHERE kind = 'client_to_listing') AS c_rating, count(*) FILTER (WHERE kind = 'client_to_listing') AS c_n
     FROM reviews WHERE visible AND listing_id = ANY($1) GROUP BY listing_id`, [listingIds]);
  const round = (v: unknown) => (v == null ? null : Math.round(Number(v) * 100) / 100);
  const map = new Map(list.map((r) => [r.listing_id, { rating: round(r.rating), reviewCount: Number(r.n), clientRating: round(r.c_rating), clientReviewCount: Number(r.c_n) }]));
  return (listingId: string) => map.get(listingId) ?? { rating: null, reviewCount: 0, clientRating: null, clientReviewCount: 0 };
}

// ───────────── Reservas ─────────────
export const ACTIVE_STATUSES: Booking['status'][] = ['pending_payment', 'pending_guarantor', 'pending_host', 'confirmed', 'checked_in'];

async function hydrateBookings(db: Db, list: any[]): Promise<Booking[]> {
  if (!list.length) return [];
  const ids = list.map((r) => r.id);
  const occ = await rows(db, 'SELECT * FROM booking_occurrences WHERE booking_id = ANY($1) ORDER BY date', [ids]);
  const gua = await rows(db, 'SELECT * FROM guarantors WHERE booking_id = ANY($1)', [ids]);
  const pay = await rows(db, 'SELECT id, booking_id FROM payments WHERE booking_id = ANY($1)', [ids]);
  return list.map((r) => {
    const os = occ.filter((o) => o.booking_id === r.id);
    const g = gua.find((x) => x.booking_id === r.id);
    const b: Booking = {
      id: r.id, listingId: r.listing_id, guestId: r.guest_id, hostId: r.host_id,
      occurrences: os.map((o): Occurrence => ({ date: o.date, start: hhmm(o.start_time), end: hhmm(o.end_time) })),
      guests: r.guests, purpose: r.purpose, status: r.status, price: r.price, paymentMethod: r.payment_method,
      paymentId: pay.find((p) => p.booking_id === r.id)?.id, cancellationPolicy: r.cancellation_policy,
      createdAt: iso(r.created_at)!, confirmedAt: iso(opt(r.confirmed_at)), cancelledAt: iso(opt(r.cancelled_at)),
      cancellationReason: opt(r.cancellation_reason), refundAmount: opt(r.refund_amount), completedAt: iso(opt(r.completed_at)),
      hostPenalty: opt(r.host_penalty), isConsumer: r.is_consumer, clientReviewsEnabled: r.client_reviews_enabled,
      rulesAcceptedAt: iso(r.rules_accepted_at)!, rulesVersion: r.rules_version, hostDecisionDeadline: iso(opt(r.host_decision_deadline)),
      paymentDeadline: iso(opt(r.payment_deadline)), hostLicenseCheckAt: iso(opt(r.host_license_check_at)),
      attendance: os.filter((o) => o.check_in_at || o.check_out_at).map((o) => ({
        date: o.date, checkInAt: iso(opt(o.check_in_at)), checkOutAt: iso(opt(o.check_out_at)), overstayMinutes: opt(o.overstay_minutes),
      })),
    };
    if (g) {
      b.guarantor = {
        name: g.name, email: g.email, phone: opt(g.phone), documentNumber: g.document_number, relationship: opt(g.relationship),
        token: g.token, status: g.status, liabilityCap: g.liability_cap, respondedAt: iso(opt(g.responded_at)),
      };
    }
    return b;
  });
}

export async function getBooking(db: Db, bookingId: string, forUpdate = false) {
  const r = await one(db, `SELECT * FROM bookings WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [bookingId]);
  return r ? (await hydrateBookings(db, [r]))[0] : undefined;
}

export async function getBookingByGuarantorToken(db: Db, tok: string, forUpdate = false) {
  const r = await one(db, `SELECT b.* FROM bookings b JOIN guarantors g ON g.booking_id = b.id WHERE g.token = $1${forUpdate ? ' FOR UPDATE OF b' : ''}`, [tok]);
  return r ? (await hydrateBookings(db, [r]))[0] : undefined;
}

export async function findBookings(db: Db, where: string, params: unknown[] = [], order = 'created_at') {
  return hydrateBookings(db, await rows(db, `SELECT * FROM bookings WHERE ${where} ORDER BY ${order}`, params));
}

/** Reservas ativas do espaço (para checar conflitos de horário). */
export const activeBookingsForListing = (db: Db, listingId: string, excludeBookingId?: string) =>
  findBookings(db, 'listing_id = $1 AND status = ANY($2) AND id <> $3', [listingId, ACTIVE_STATUSES, excludeBookingId ?? '']);

export async function saveBooking(db: Db, b: Booking) {
  await db.query(
    `INSERT INTO bookings (id, listing_id, guest_id, host_id, guests, purpose, status, currency, total, price, payment_method,
       cancellation_policy, created_at, confirmed_at, cancelled_at, cancellation_reason, refund_amount, completed_at, host_penalty,
       is_consumer, client_reviews_enabled, rules_accepted_at, rules_version, host_decision_deadline, payment_deadline, host_license_check_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     ON CONFLICT (id) DO UPDATE SET guests=EXCLUDED.guests, purpose=EXCLUDED.purpose, status=EXCLUDED.status,
       confirmed_at=EXCLUDED.confirmed_at, cancelled_at=EXCLUDED.cancelled_at, cancellation_reason=EXCLUDED.cancellation_reason,
       refund_amount=EXCLUDED.refund_amount, completed_at=EXCLUDED.completed_at, host_penalty=EXCLUDED.host_penalty,
       client_reviews_enabled=EXCLUDED.client_reviews_enabled, host_decision_deadline=EXCLUDED.host_decision_deadline,
       payment_deadline=EXCLUDED.payment_deadline, host_license_check_at=EXCLUDED.host_license_check_at`,
    [b.id, b.listingId, b.guestId, b.hostId, b.guests, b.purpose, b.status, b.price.currency, b.price.total, JSON.stringify(b.price),
      b.paymentMethod, b.cancellationPolicy, b.createdAt, b.confirmedAt ?? null, b.cancelledAt ?? null, b.cancellationReason ?? null,
      b.refundAmount ?? null, b.completedAt ?? null, b.hostPenalty ? JSON.stringify(b.hostPenalty) : null, b.isConsumer,
      b.clientReviewsEnabled, b.rulesAcceptedAt, b.rulesVersion, b.hostDecisionDeadline ?? null, b.paymentDeadline ?? null,
      b.hostLicenseCheckAt ?? null],
  );
  for (const o of b.occurrences) {
    const a = b.attendance.find((x) => x.date === o.date);
    await db.query(
      `INSERT INTO booking_occurrences (booking_id, listing_id, date, start_time, end_time, check_in_at, check_out_at, overstay_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (booking_id, date) DO UPDATE SET check_in_at=EXCLUDED.check_in_at, check_out_at=EXCLUDED.check_out_at,
         overstay_minutes=EXCLUDED.overstay_minutes`,
      [b.id, b.listingId, o.date, o.start, o.end, a?.checkInAt ?? null, a?.checkOutAt ?? null, a?.overstayMinutes ?? null],
    );
  }
  if (b.guarantor) {
    const g = b.guarantor;
    await db.query(
      `INSERT INTO guarantors (booking_id, name, email, phone, document_number, relationship, token, status, liability_cap, responded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (booking_id) DO UPDATE SET status=EXCLUDED.status, responded_at=EXCLUDED.responded_at`,
      [b.id, g.name, g.email, g.phone ?? null, g.documentNumber, g.relationship ?? null, g.token, g.status, g.liabilityCap, g.respondedAt ?? null],
    );
  }
}

// ───────────── Pagamentos ─────────────
export async function getPayment(db: Db, paymentId: string | undefined, forUpdate = false): Promise<Payment | undefined> {
  if (!paymentId) return undefined;
  const r = await one(db, `SELECT * FROM payments WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [paymentId]);
  if (!r) return undefined;
  const events = await rows(db, 'SELECT * FROM payment_events WHERE payment_id = $1 ORDER BY id', [paymentId]);
  const charges = await rows(db, 'SELECT * FROM payment_charges WHERE payment_id = $1 ORDER BY id', [paymentId]);
  const p: Payment = {
    id: r.id, bookingId: r.booking_id, provider: r.provider, method: r.method, currency: r.currency.trim(), amount: r.amount,
    refunded: r.refunded, depositHold: r.deposit_hold, depositStatus: r.deposit_status, status: r.status,
    payoutStatus: r.payout_status, payoutAmount: r.payout_amount, createdAt: iso(r.created_at)!,
    providerRef: opt(r.provider_ref), checkoutRef: opt(r.checkout_ref), checkoutUrl: opt(r.checkout_url),
    customerRef: opt(r.customer_ref), paymentMethodRef: opt(r.payment_method_ref), depositRef: opt(r.deposit_ref), sellerRef: opt(r.seller_ref),
    history: events.map((e) => ({ at: iso(e.at)!, event: e.event, amount: opt(e.amount) })),
    extraCharges: charges.map((c) => ({ at: iso(c.at)!, amount: c.amount, reason: c.reason })),
  };
  // quantos eventos/cobranças já estão gravados (os novos são acrescentados no save)
  persisted.set(p, { events: events.length, charges: charges.length });
  return p;
}

const persisted = new WeakMap<Payment, { events: number; charges: number }>();

export async function savePayment(db: Db, p: Payment) {
  await db.query(
    `INSERT INTO payments (id, booking_id, provider, method, currency, amount, refunded, deposit_hold, deposit_status, status,
       payout_status, payout_amount, created_at, provider_ref, checkout_ref, checkout_url, customer_ref, payment_method_ref, deposit_ref, seller_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (id) DO UPDATE SET provider=EXCLUDED.provider, refunded=EXCLUDED.refunded, deposit_hold=EXCLUDED.deposit_hold,
       deposit_status=EXCLUDED.deposit_status, status=EXCLUDED.status, payout_status=EXCLUDED.payout_status,
       payout_amount=EXCLUDED.payout_amount, provider_ref=EXCLUDED.provider_ref, checkout_ref=EXCLUDED.checkout_ref,
       checkout_url=EXCLUDED.checkout_url, customer_ref=EXCLUDED.customer_ref, payment_method_ref=EXCLUDED.payment_method_ref,
       deposit_ref=EXCLUDED.deposit_ref, seller_ref=EXCLUDED.seller_ref`,
    [p.id, p.bookingId, p.provider, p.method, p.currency, p.amount, p.refunded, p.depositHold, p.depositStatus, p.status,
      p.payoutStatus, p.payoutAmount, p.createdAt, p.providerRef ?? null, p.checkoutRef ?? null, p.checkoutUrl ?? null,
      p.customerRef ?? null, p.paymentMethodRef ?? null, p.depositRef ?? null, p.sellerRef ?? null],
  );
  const done = persisted.get(p) ?? { events: 0, charges: 0 };
  for (const e of p.history.slice(done.events)) {
    await db.query('INSERT INTO payment_events (payment_id, at, event, amount) VALUES ($1,$2,$3,$4)', [p.id, e.at, e.event, e.amount ?? null]);
  }
  for (const c of p.extraCharges.slice(done.charges)) {
    await db.query('INSERT INTO payment_charges (payment_id, at, amount, reason) VALUES ($1,$2,$3,$4)', [p.id, c.at, c.amount, c.reason]);
  }
  persisted.set(p, { events: p.history.length, charges: p.extraCharges.length });
}

// ───────────── Avaliações ─────────────
function toReview(r: any): Review {
  return {
    id: r.id, kind: r.kind, bookingId: r.booking_id, listingId: r.listing_id, authorId: opt(r.author_id), authorName: r.author_name,
    targetUserId: opt(r.target_user_id), rating: r.rating, categories: r.categories, comment: r.comment, privateNote: opt(r.private_note),
    wouldRecommend: opt(r.would_recommend), response: r.response_text ? { text: r.response_text, at: iso(r.response_at)! } : undefined,
    createdAt: iso(r.created_at)!, visible: r.visible,
  };
}

export const findReviews = async (db: Db, where: string, params: unknown[] = []) =>
  (await rows(db, `SELECT * FROM reviews WHERE ${where} ORDER BY created_at DESC`, params)).map(toReview);

export async function getReview(db: Db, reviewId: string) {
  const r = await one(db, 'SELECT * FROM reviews WHERE id = $1', [reviewId]);
  return r ? toReview(r) : undefined;
}

export async function insertReview(db: Db, r: Review) {
  await db.query(
    `INSERT INTO reviews (id, kind, booking_id, listing_id, author_id, author_name, target_user_id, rating, categories, comment,
       private_note, would_recommend, response_text, response_at, created_at, visible)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [r.id, r.kind, r.bookingId, r.listingId, r.authorId ?? null, r.authorName, r.targetUserId ?? null, r.rating, JSON.stringify(r.categories),
      r.comment, r.privateNote ?? null, r.wouldRecommend ?? null, r.response?.text ?? null, r.response?.at ?? null, r.createdAt, r.visible],
  );
}

// ───────────── Convites de clientes finais ─────────────
function toInvite(r: any): ClientReviewInvite {
  return { token: r.token, bookingId: r.booking_id, listingId: r.listing_id, createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at)!, usedAt: iso(opt(r.used_at)), label: opt(r.label) };
}
export const invitesForBooking = async (db: Db, bookingId: string) =>
  (await rows(db, 'SELECT * FROM client_invites WHERE booking_id = $1 ORDER BY created_at, token', [bookingId])).map(toInvite);
export async function getInvite(db: Db, tok: string, forUpdate = false) {
  const r = await one(db, `SELECT * FROM client_invites WHERE token = $1${forUpdate ? ' FOR UPDATE' : ''}`, [tok]);
  return r ? toInvite(r) : undefined;
}
export async function insertInvite(db: Db, i: ClientReviewInvite) {
  await db.query('INSERT INTO client_invites (token, booking_id, listing_id, created_at, expires_at, used_at, label) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [i.token, i.bookingId, i.listingId, i.createdAt, i.expiresAt, i.usedAt ?? null, i.label ?? null]);
}

// ───────────── Mensagens ─────────────
export const messagesForBooking = async (db: Db, bookingId: string): Promise<Message[]> =>
  (await rows(db, 'SELECT * FROM messages WHERE booking_id = $1 ORDER BY created_at, id', [bookingId])).map((r) => ({
    id: r.id, bookingId: r.booking_id, senderId: r.sender_id, text: r.text, createdAt: iso(r.created_at)!, flagged: r.flagged,
  }));
export async function insertMessage(db: Db, m: Message) {
  await db.query('INSERT INTO messages (id, booking_id, sender_id, text, created_at, flagged) VALUES ($1,$2,$3,$4,$5,$6)',
    [m.id, m.bookingId, m.senderId, m.text, m.createdAt, !!m.flagged]);
}

// ───────────── Incidentes ─────────────
function toIncident(r: any): Incident {
  return {
    id: r.id, bookingId: r.booking_id, reporterId: r.reporter_id, againstUserId: r.against_user_id, type: r.type,
    description: r.description, evidence: r.evidence, requestedAmount: r.requested_amount, status: r.status,
    resolution: opt(r.resolution), responseDeadline: iso(r.response_deadline)!, createdAt: iso(r.created_at)!, guestResponse: opt(r.guest_response),
  };
}
export const findIncidents = async (db: Db, where: string, params: unknown[] = []) =>
  (await rows(db, `SELECT * FROM incidents WHERE ${where} ORDER BY created_at`, params)).map(toIncident);
export async function getIncident(db: Db, incidentId: string, forUpdate = false) {
  const r = await one(db, `SELECT * FROM incidents WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [incidentId]);
  return r ? toIncident(r) : undefined;
}
export async function saveIncident(db: Db, i: Incident) {
  await db.query(
    `INSERT INTO incidents (id, booking_id, reporter_id, against_user_id, type, description, evidence, requested_amount, status,
       resolution, response_deadline, created_at, guest_response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, resolution=EXCLUDED.resolution, guest_response=EXCLUDED.guest_response`,
    [i.id, i.bookingId, i.reporterId, i.againstUserId, i.type, i.description, i.evidence, i.requestedAmount, i.status,
      i.resolution ? JSON.stringify(i.resolution) : null, i.responseDeadline, i.createdAt, i.guestResponse ?? null],
  );
}

// ───────────── Notificações ─────────────
export async function insertNotification(db: Db, n: Notification) {
  await db.query('INSERT INTO notifications (id, user_id, email, kind, text, link, created_at, read) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [n.id, n.userId ?? null, n.email ?? null, n.kind, n.text, n.link ?? null, n.createdAt, n.read]);
}
export const notificationsForUser = async (db: Db, userId: string): Promise<Notification[]> =>
  (await rows(db, 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 50', [userId])).map((r) => ({
    id: r.id, userId: r.user_id, email: opt(r.email), kind: r.kind, text: r.text, link: opt(r.link), createdAt: iso(r.created_at)!, read: r.read,
  }));

export async function getPaymentByBooking(db: Db, bookingId: string, forUpdate = false) {
  const r = await one<{ id: string }>(db, 'SELECT id FROM payments WHERE booking_id = $1', [bookingId]);
  return getPayment(db, r?.id, forUpdate);
}

export async function findPaymentByRef(db: Db, provider: string, ref: { checkoutRef?: string; providerRef?: string; bookingId?: string }) {
  const r = await one<{ id: string }>(db,
    `SELECT id FROM payments WHERE provider = $1 AND (checkout_ref = $2 OR provider_ref = $3 OR booking_id = $4) LIMIT 1`,
    [provider, ref.checkoutRef ?? '', ref.providerRef ?? '', ref.bookingId ?? '']);
  return r?.id;
}
