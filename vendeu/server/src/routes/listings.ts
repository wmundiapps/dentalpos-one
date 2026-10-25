import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { id, many, one, pool, tx } from '../db.js';
import { HttpError, clientIp, parse, wrap } from '../http.js';
import { processPhoto } from '../images.js';
import { limit } from '../ratelimit.js';
import { evaluateListing, norm } from '../risk.js';
import { recordOrigin } from '../origin.js';
import { DECLARATION_VERSION, declarationText, SELLER_TERMS } from '../legal.js';
import { hasAccepted, recordAcceptance } from '../accounts.js';
import { activeMethod } from './paymentMethod.js';
import { refreshOutrosGroups } from '../outros.js';
import { sha256 } from '../secure.js';
import { CATEGORY_SLUGS, CONDITIONS, MAX_PHOTOS, MIN_PHOTOS, OPERATIONS, ORIGIN_KINDS, ORIGIN_KIND_VALUES, REGISTERED_ASSET } from '../../../shared/catalog.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '../../../shared/fees.js';

export const listingsRouter = Router();

const PHOTO_SQL = `(SELECT u.url FROM listing_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.listing_id = l.id ORDER BY p.position, p.created_at LIMIT 1)`;
const CARD_COLS = `l.id, l.title, l.price_cents, l.rent_period, l.operation, l.condition, l.category, l.city, l.state, l.district, l.published_at, l.group_token, l.status, ${PHOTO_SQL} AS photo, (SELECT kyc_status = 'verified' FROM users su WHERE su.id = l.seller_id) AS seller_verified`;

const card = (r: any) => ({
  id: r.id, title: r.title, priceCents: r.price_cents, rentPeriod: r.rent_period, operation: r.operation, condition: r.condition,
  category: r.category, city: r.city, state: r.state, district: r.district, publishedAt: r.published_at, groupToken: r.group_token,
  status: r.status, photo: r.photo, sellerVerified: !!r.seller_verified,
});

// ---------- vitrine pública ----------
const browseSchema = z.object({
  operation: z.enum(OPERATIONS),
  condition: z.enum(CONDITIONS),                // novos e usados nunca se misturam: obrigatório
  category: z.enum(CATEGORY_SLUGS).optional(),
  group: z.string().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().length(2).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['recent', 'price_asc', 'price_desc']).default('recent'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
const PAGE = 24;

listingsRouter.get('/', wrap(async (req, res) => {
  const q = parse(browseSchema, req.query);
  const where = ["l.status = 'active'", 'l.operation = $1', 'l.condition = $2'];
  const params: unknown[] = [q.operation, q.condition];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.category) add('l.category = ?', q.category);
  if (q.group) add('l.group_token = ?', q.group);
  if (q.city) add('lower(l.city) = ?', q.city.toLowerCase());
  if (q.state) add('l.state = ?', q.state.toUpperCase());
  if (q.min !== undefined) add('l.price_cents >= ?', q.min);
  if (q.max !== undefined) add('l.price_cents <= ?', q.max);
  for (const w of norm(q.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6)) add(`l.search_text LIKE ?`, `%${w.replace(/[%_\\]/g, '')}%`);
  const order = q.sort === 'price_asc' ? 'l.price_cents ASC' : q.sort === 'price_desc' ? 'l.price_cents DESC' : 'l.published_at DESC';
  const total = (await one(pool, `SELECT count(*)::int AS n FROM listings l WHERE ${where.join(' AND ')}`, params)).n;
  params.push(PAGE, (q.page - 1) * PAGE);
  const rows = await many(pool, `SELECT ${CARD_COLS} FROM listings l WHERE ${where.join(' AND ')} ORDER BY ${order}, l.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ items: rows.map(card), total, page: q.page, pageSize: PAGE });
}));

listingsRouter.get('/mine', requireAuth, wrap(async (req, res) => {
  const rows = await many(pool, `SELECT ${CARD_COLS}, l.risk_flags, l.review_note, l.removed_reason, l.views,
    (SELECT s.id FROM sales s WHERE s.listing_id = l.id AND s.status = 'awaiting_payment' LIMIT 1) AS open_sale_id
    FROM listings l WHERE l.seller_id = $1 ORDER BY l.created_at DESC`, [req.user!.id]);
  res.json({ items: rows.map((r) => ({ ...card(r), riskFlags: r.risk_flags, reviewNote: r.review_note, removedReason: r.removed_reason, views: r.views, openSaleId: r.open_sale_id })) });
}));

listingsRouter.get('/:id', wrap(async (req, res) => {
  const l = await one(pool, `SELECT l.*, u.full_name AS seller_name, u.created_at AS seller_since, u.kyc_status AS seller_kyc,
    (SELECT count(*)::int FROM sales s WHERE s.seller_id = l.seller_id AND s.status = 'paid') AS seller_sales
    FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.id = $1`, [req.params.id]);
  const isOwner = !!l && req.user?.id === l.seller_id;
  const isAdmin = req.user?.role === 'admin';
  if (!l || (!['active', 'reserved'].includes(l.status) && !isOwner && !isAdmin)) throw new HttpError(404, 'not_found');
  if (!isOwner) await pool.query('UPDATE listings SET views = views + 1 WHERE id = $1', [l.id]);
  const photos = await many(pool, `SELECT p.id, u.url FROM listing_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.listing_id = $1 ORDER BY p.position, p.created_at`, [l.id]);
  res.json({
    id: l.id, title: l.title, description: l.description, priceCents: l.price_cents, rentPeriod: l.rent_period, operation: l.operation,
    condition: l.condition, category: l.category, city: l.city, state: l.state, district: l.district, attributes: l.attributes,
    groupToken: l.group_token, status: l.status, publishedAt: l.published_at, views: l.views, photos,
    seller: { name: l.seller_name.split(' ')[0], verified: l.seller_kyc === 'verified', memberSince: l.seller_since, completedDeals: l.seller_sales },
    isOwner,
    ...(isOwner || isAdmin ? { riskFlags: l.risk_flags, reviewNote: l.review_note, addressPrivate: l.address_private } : {}),
  });
}));

// ---------- criação e edição ----------
const attrs = z.record(z.union([z.string().max(100), z.number()])).refine((o) => Object.keys(o).length <= 12, 'atributos demais');
const baseFields = {
  operation: z.enum(OPERATIONS), category: z.enum(CATEGORY_SLUGS), condition: z.enum(CONDITIONS),
  title: z.string().trim().min(8, 'Título muito curto').max(90),
  description: z.string().trim().min(30, 'Descreva melhor o produto (mínimo 30 caracteres)').max(4000),
  priceCents: z.number().int().min(MIN_PRICE_CENTS).max(MAX_PRICE_CENTS),
  rentPeriod: z.enum(['dia', 'semana', 'mes']).optional(),
  city: z.string().trim().min(2).max(80), state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  district: z.string().trim().max(80).optional(), addressPrivate: z.string().trim().max(200).optional(),
  attributes: attrs.default({}),
};
const createSchema = z.object(baseFields).superRefine((v, ctx) => {
  if (v.operation === 'locacao' && !v.rentPeriod) ctx.addIssue({ code: 'custom', path: ['rentPeriod'], message: 'Informe o período do aluguel' });
});
const updateSchema = z.object(baseFields).partial();

const searchText = (v: { title: string; description: string; city: string; district?: string | null }) => norm(`${v.title} ${v.description} ${v.city} ${v.district ?? ''}`);

function requireSeller(req: Request) {
  const u = req.user!;
  if (u.accountType !== 'anunciante') throw new HttpError(403, 'seller_account_required');
  if (u.feeBlocked) throw new HttpError(402, 'fee_overdue');
}
async function ownListing(req: Request, db = pool) {
  const l = await one(db, 'SELECT * FROM listings WHERE id = $1 AND seller_id = $2', [req.params.id, req.user!.id]);
  if (!l) throw new HttpError(404, 'not_found');
  return l;
}

listingsRouter.post('/', requireAuth, limit('listing-create', 30, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  requireSeller(req);
  const b = parse(createSchema, req.body);
  const listingId = id('lst');
  await tx(async (c) => {
    await c.query(
      `INSERT INTO listings (id, seller_id, operation, category, condition, title, description, price_cents, rent_period, city, state, district, address_private, attributes, search_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [listingId, req.user!.id, b.operation, b.category, b.condition, b.title, b.description, b.priceCents, b.operation === 'locacao' ? b.rentPeriod : null,
        b.city, b.state, b.district ?? null, b.addressPrivate ?? null, JSON.stringify(b.attributes), searchText(b)]);
    await c.query('INSERT INTO listing_price_history (id, listing_id, price_cents) VALUES ($1,$2,$3)', [id('prc'), listingId, b.priceCents]);
    await recordOrigin(req, 'listing_create', { userId: req.user!.id, listingId, email: req.user!.email }, c);
  });
  res.status(201).json({ id: listingId, status: 'draft' });
}));

listingsRouter.put('/:id', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  if (['sold', 'pending_checkout', 'removed'].includes(l.status)) throw new HttpError(409, 'listing_closed');
  const b = parse(updateSchema, req.body);
  const locked = l.status === 'active' || l.status === 'paused' || l.status === 'pending_review';
  if (locked && (b.operation || b.category || b.condition)) throw new HttpError(409, 'locked_fields'); // a declaração assinada cobre esses dados
  const m = { ...l, title: b.title ?? l.title, description: b.description ?? l.description, price_cents: b.priceCents ?? l.price_cents,
    operation: b.operation ?? l.operation, category: b.category ?? l.category, condition: b.condition ?? l.condition,
    rent_period: b.rentPeriod ?? l.rent_period, city: b.city ?? l.city, state: b.state ?? l.state, district: b.district ?? l.district,
    address_private: b.addressPrivate ?? l.address_private, attributes: b.attributes ?? l.attributes };
  if (m.operation === 'locacao' && !m.rent_period) throw new HttpError(422, 'rent_period_required');
  await tx(async (c) => {
    await c.query(
      `UPDATE listings SET operation=$2, category=$3, condition=$4, title=$5, description=$6, price_cents=$7, rent_period=$8, city=$9, state=$10,
         district=$11, address_private=$12, attributes=$13, search_text=$14, updated_at=now() WHERE id=$1`,
      [l.id, m.operation, m.category, m.condition, m.title, m.description, m.price_cents, m.operation === 'locacao' ? m.rent_period : null,
        m.city, m.state, m.district, m.address_private, JSON.stringify(m.attributes),
        searchText({ title: m.title, description: m.description, city: m.city, district: m.district })]);
    if (m.price_cents !== l.price_cents) await c.query('INSERT INTO listing_price_history (id, listing_id, price_cents) VALUES ($1,$2,$3)', [id('prc'), l.id, m.price_cents]);
  });
  // anúncio já no ar: reavalia depois da edição (quem edita para burlar a triagem cai em revisão)
  if (l.status === 'active') {
    const r = evaluateListing({ title: m.title, description: m.description, priceCents: Number(m.price_cents), category: m.category, operation: m.operation, condition: m.condition });
    const next = r.blocked ? 'rejected' : r.score >= config.reviewRiskThreshold ? 'pending_review' : 'active';
    await pool.query('UPDATE listings SET risk_score=$2, risk_flags=$3, status=$4, removed_reason=$5 WHERE id=$1', [l.id, r.score, r.flags, next, r.blocked ? r.blockReasons.join(',') : null]);
    return res.json({ ok: true, status: next });
  }
  res.json({ ok: true, status: l.status });
}));

// ---------- fotos ----------
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
listingsRouter.post('/:id/photos', requireAuth, limit('photo', 60, 3600, (r) => r.user!.id), photoUpload.single('file'), wrap(async (req, res) => {
  const l = await ownListing(req);
  if (['sold', 'pending_checkout', 'removed'].includes(l.status)) throw new HttpError(409, 'listing_closed');
  if (!req.file) throw new HttpError(400, 'file_required');
  const count = (await one(pool, 'SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = $1', [l.id])).n;
  if (count >= MAX_PHOTOS) throw new HttpError(422, 'too_many_photos');
  const photo = await processPhoto(req.file.buffer);
  const uploadId = id('img');
  await tx(async (c) => {
    await c.query('INSERT INTO uploads (id, owner_id, kind, mime, size, data, url, content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [uploadId, req.user!.id, 'photo', photo.mime, photo.data.length, photo.data, `/api/uploads/${uploadId}`, sha256(photo.data.toString('base64'))]);
    await c.query('INSERT INTO listing_photos (id, listing_id, upload_id, position) VALUES ($1,$2,$3,$4)', [id('pho'), l.id, uploadId, count]);
  });
  res.status(201).json({ id: uploadId, url: `/api/uploads/${uploadId}`, count: count + 1 });
}));

listingsRouter.delete('/:id/photos/:photoId', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  const left = (await one(pool, 'SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = $1', [l.id])).n;
  if (['active', 'pending_review'].includes(l.status) && left <= MIN_PHOTOS) throw new HttpError(422, 'min_photos');
  const r = await pool.query('DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2', [req.params.photoId, l.id]);
  if (!r.rowCount) throw new HttpError(404, 'not_found');
  res.json({ ok: true });
}));

listingsRouter.put('/:id/photos-order', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  const { order } = parse(z.object({ order: z.array(z.string()).max(MAX_PHOTOS) }), req.body);
  for (let i = 0; i < order.length; i++) await pool.query('UPDATE listing_photos SET position = $3 WHERE id = $2 AND listing_id = $1', [l.id, order[i], i]);
  res.json({ ok: true });
}));

// ---------- publicar (declaração de origem + triagem) ----------
const publishSchema = z.object({
  originKind: z.enum(ORIGIN_KIND_VALUES),
  assetRef: z.string().trim().max(40).optional(),
  signerName: z.string().trim().min(5).max(120),
  confirm: z.literal(true),
  accepted: z.record(z.string()).default({}),
});
const sameName = (a: string, b: string) => norm(a).replace(/\s+/g, ' ').trim() === norm(b).replace(/\s+/g, ' ').trim();

listingsRouter.post('/:id/publish', requireAuth, limit('publish', 30, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  requireSeller(req);
  const u = await one(pool, 'SELECT * FROM users WHERE id = $1', [req.user!.id]);
  const l = await ownListing(req);
  if (!['draft', 'rejected', 'paused'].includes(l.status)) throw new HttpError(409, 'invalid_status');
  if (!u.email_verified_at || !u.phone_verified_at) throw new HttpError(422, 'contact_not_verified');
  if (u.kyc_status !== 'verified' && !config.allowUnverifiedPublish) throw new HttpError(403, 'kyc_required', { kycStatus: u.kyc_status });
  if (!(await activeMethod(u.id))) throw new HttpError(402, 'payment_method_required');
  const b = parse(publishSchema, req.body);
  if (!sameName(b.signerName, u.full_name)) throw new HttpError(422, 'signer_name_mismatch');
  const asset = REGISTERED_ASSET[l.category as keyof typeof REGISTERED_ASSET];
  if (asset && !b.assetRef) throw new HttpError(422, 'asset_ref_required', asset);
  const photos = (await one(pool, 'SELECT count(*)::int AS n FROM listing_photos WHERE listing_id = $1', [l.id])).n;
  if (photos < MIN_PHOTOS) throw new HttpError(422, 'photos_required');

  // fotos já usadas por OUTRO anunciante em anúncio ativo = possível foto roubada
  const dup = await one(pool, `SELECT 1 FROM listing_photos lp JOIN uploads a ON a.id = lp.upload_id
    JOIN uploads b ON b.content_hash = a.content_hash AND b.owner_id <> a.owner_id
    JOIN listing_photos lp2 ON lp2.upload_id = b.id JOIN listings l2 ON l2.id = lp2.listing_id AND l2.status IN ('active','sold','pending_checkout')
    WHERE lp.listing_id = $1 LIMIT 1`, [l.id]);
  const risk = evaluateListing(
    { title: l.title, description: l.description, priceCents: Number(l.price_cents), category: l.category, operation: l.operation, condition: l.condition },
    [...(dup ? [{ code: 'foto_repetida', score: 40 }] : []), ...(b.originKind === 'compra_sem_nota' ? [{ code: 'origem_sem_nota', score: 10 }] : [])]);

  const origin = ORIGIN_KINDS.find((o) => o.value === b.originKind)!;
  const text = declarationText({ signerName: u.full_name, listingTitle: l.title, originLabel: origin.label, assetRef: b.assetRef });
  const status = risk.blocked ? 'rejected' : risk.score >= config.reviewRiskThreshold ? 'pending_review' : 'active';

  await tx(async (c) => {
    const missing: typeof SELLER_TERMS = [];
    for (const k of SELLER_TERMS) if (!(await hasAccepted(u.id, [k]))) missing.push(k);
    await recordAcceptance(c, req, u.id, missing, b.accepted);
    await c.query('INSERT INTO listing_declarations (id, listing_id, user_id, origin_kind, asset_ref, signer_name, text_version, text_hash, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id('dcl'), l.id, u.id, b.originKind, b.assetRef ?? null, u.full_name, DECLARATION_VERSION, sha256(text), clientIp(req), String(req.headers['user-agent'] ?? '').slice(0, 400)]);
    await c.query(
      `UPDATE listings SET status=$2, risk_score=$3, risk_flags=$4, removed_reason=$5, review_note=NULL,
         published_at = CASE WHEN $2 = 'active' THEN now() ELSE published_at END, updated_at = now() WHERE id=$1`,
      [l.id, status, risk.score, risk.flags, risk.blocked ? risk.blockReasons.join(',') : null]);
    await recordOrigin(req, 'listing_publish', { userId: u.id, listingId: l.id, email: u.email, phone: u.phone }, c);
  });
  if (risk.blocked) throw new HttpError(422, 'listing_blocked', { reasons: risk.blockReasons });
  if (l.category === 'outros' && status === 'active') await refreshOutrosGroups();
  res.json({ status, riskFlags: risk.flags, declaration: text });
}));

// prévia do texto que será assinado (a tela mostra exatamente o texto do servidor)
listingsRouter.get('/:id/declaration-preview', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  const { originKind, assetRef } = parse(z.object({ originKind: z.enum(ORIGIN_KIND_VALUES), assetRef: z.string().trim().max(40).optional() }), req.query);
  const u = await one(pool, 'SELECT full_name FROM users WHERE id = $1', [req.user!.id]);
  const origin = ORIGIN_KINDS.find((o) => o.value === originKind)!;
  res.json({ text: declarationText({ signerName: u.full_name, listingTitle: l.title, originLabel: origin.label, assetRef }), version: DECLARATION_VERSION, requiresAsset: REGISTERED_ASSET[l.category as keyof typeof REGISTERED_ASSET] ?? null });
}));

listingsRouter.get('/:id/declaration', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  const d = await one(pool, 'SELECT * FROM listing_declarations WHERE listing_id = $1 ORDER BY created_at DESC LIMIT 1', [l.id]);
  if (!d) throw new HttpError(404, 'not_found');
  const origin = ORIGIN_KINDS.find((o) => o.value === d.origin_kind)!;
  res.json({ text: declarationText({ signerName: d.signer_name, listingTitle: l.title, originLabel: origin.label, assetRef: d.asset_ref }), signedAt: d.created_at, version: d.text_version, hash: d.text_hash, ip: d.ip });
}));

listingsRouter.post('/:id/pause', requireAuth, wrap(async (req, res) => {
  const l = await ownListing(req);
  if (l.status !== 'active') throw new HttpError(409, 'invalid_status');
  await pool.query("UPDATE listings SET status='paused', updated_at=now() WHERE id=$1", [l.id]);
  res.json({ status: 'paused' });
}));
listingsRouter.post('/:id/resume', requireAuth, wrap(async (req, res) => {
  requireSeller(req);
  const l = await ownListing(req);
  if (l.status !== 'paused') throw new HttpError(409, 'invalid_status');
  await pool.query("UPDATE listings SET status='active', updated_at=now() WHERE id=$1", [l.id]);
  res.json({ status: 'active' });
}));
