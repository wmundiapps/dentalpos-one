// Moderação e operação. Tudo que a moderação lê de dado sensível (documentos, CPF, origem) é gravado no log de auditoria.
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { many, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { sendMail } from '../mailer.js';
import { audit } from '../origin.js';
import { outrosStats, refreshOutrosGroups } from '../outros.js';
import { decryptBuffer, decryptText } from '../secure.js';
import { markPaid } from '../sales.js';
import { orderView, resolveDispute } from '../orders.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', wrap(async (_req, res) => {
  const q = async (sql: string) => (await one(pool, sql)).n as number;
  res.json({
    kycPending: await q("SELECT count(*)::int AS n FROM users WHERE kyc_status = 'pending'"),
    listingsInReview: await q("SELECT count(*)::int AS n FROM listings WHERE status = 'pending_review'"),
    reportsOpen: await q("SELECT count(*)::int AS n FROM reports WHERE status = 'open'"),
    dataRequestsOpen: await q("SELECT count(*)::int AS n FROM data_requests WHERE status = 'open'"),
    activeListings: await q("SELECT count(*)::int AS n FROM listings WHERE status = 'active'"),
    ordersDisputed: await q("SELECT count(*)::int AS n FROM orders WHERE status = 'disputed'"),
    heldCents: await q("SELECT COALESCE(sum(price_cents),0)::bigint AS n FROM orders WHERE status IN ('paid','shipped','received','return_requested','disputed')"),
    commissionReleasedCents: await q("SELECT COALESCE(sum(commission_cents),0)::bigint AS n FROM orders WHERE status = 'released'"),
    salesFlagged: await q("SELECT count(*)::int AS n FROM sales WHERE flagged AND status IN ('awaiting_payment','paid')"),
    feesPaidCents: await q("SELECT COALESCE(sum(fee_cents),0)::bigint AS n FROM sales WHERE status = 'paid'"),
    feesPendingCents: await q("SELECT COALESCE(sum(fee_cents),0)::bigint AS n FROM sales WHERE status = 'awaiting_payment'"),
    users: await q('SELECT count(*)::int AS n FROM users WHERE anonymized_at IS NULL'),
  });
}));

// ---- verificação de identidade ----
adminRouter.get('/kyc', wrap(async (_req, res) => {
  res.json({ items: await many(pool, "SELECT id, full_name, email, doc_type, doc_masked, kyc_submitted_at FROM users WHERE kyc_status = 'pending' ORDER BY kyc_submitted_at") });
}));

adminRouter.get('/kyc/:userId', wrap(async (req, res) => {
  const u = await one(pool, 'SELECT * FROM users WHERE id = $1', [req.params.userId]);
  if (!u) throw new HttpError(404, 'not_found');
  const docs = await many(pool, 'SELECT id, kind, mime, size, created_at FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC', [u.id]);
  // outras contas que compartilham IP, dispositivo ou telefone (sinal de conta múltipla)
  const related = await many(pool, `SELECT DISTINCT u2.id, u2.full_name, u2.email, u2.kyc_status FROM origin_records a
    JOIN origin_records b ON b.user_id <> a.user_id AND (b.ip = a.ip OR (b.device_hash IS NOT NULL AND b.device_hash = a.device_hash) OR (b.phone IS NOT NULL AND b.phone = a.phone))
    JOIN users u2 ON u2.id = b.user_id WHERE a.user_id = $1 LIMIT 20`, [u.id]);
  await audit(req.user!.id, 'admin.kyc.view', 'user', u.id, {}, req);
  res.json({
    id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, docType: u.doc_type, docNumber: u.doc_enc ? decryptText(u.doc_enc) : null,
    companyName: u.company_name, birthDate: u.birth_date,
    address: { cep: u.cep, street: u.street, number: u.street_number, complement: u.complement, district: u.district, city: u.city, state: u.state },
    emailVerified: !!u.email_verified_at, phoneVerified: !!u.phone_verified_at, kycStatus: u.kyc_status, documents: docs, relatedAccounts: related,
  });
}));

adminRouter.get('/kyc/:userId/documents/:docId', wrap(async (req, res) => {
  const d = await one(pool, 'SELECT * FROM kyc_documents WHERE id = $1 AND user_id = $2', [req.params.docId, req.params.userId]);
  if (!d) throw new HttpError(404, 'not_found');
  await audit(req.user!.id, 'admin.kyc.document', 'kyc_document', d.id, { userId: req.params.userId, kind: d.kind }, req);
  res.set({ 'Content-Type': d.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline' });
  res.send(decryptBuffer(d.data));
}));

adminRouter.post('/kyc/:userId/decision', wrap(async (req, res) => {
  const b = parse(z.object({ approve: z.boolean(), reason: z.string().trim().min(5).max(400).optional() }), req.body);
  if (!b.approve && !b.reason) throw new HttpError(422, 'reason_required');
  const u = await one(pool, "SELECT id, email, kyc_status FROM users WHERE id = $1", [req.params.userId]);
  if (!u || u.kyc_status !== 'pending') throw new HttpError(409, 'invalid_status');
  await pool.query('UPDATE users SET kyc_status = $2, kyc_reviewed_at = now(), kyc_reviewed_by = $3, kyc_reject_reason = $4 WHERE id = $1', [u.id, b.approve ? 'verified' : 'rejected', req.user!.id, b.approve ? null : b.reason]);
  await audit(req.user!.id, b.approve ? 'admin.kyc.approve' : 'admin.kyc.reject', 'user', u.id, { reason: b.reason }, req);
  await sendMail({ to: u.email, subject: b.approve ? 'Sua conta foi verificada' : 'Precisamos de ajustes na sua verificação',
    text: b.approve ? 'Tudo certo! Sua identidade foi verificada e você já pode publicar anúncios.' : `Não conseguimos concluir sua verificação: ${b.reason}\nEnvie os documentos novamente em Minha conta > Verificação.` });
  res.json({ ok: true });
}));

// ---- anúncios ----
adminRouter.get('/listings', wrap(async (req, res) => {
  const status = z.enum(['pending_review', 'active', 'rejected', 'removed', 'pending_checkout', 'sold']).default('pending_review').parse(req.query.status);
  res.json({ items: await many(pool, `SELECT l.id, l.title, l.description, l.price_cents, l.category, l.condition, l.operation, l.status, l.risk_score, l.risk_flags, l.review_note, l.created_at, l.seller_id, u.full_name AS seller_name, u.kyc_status
    FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.status = $1 ORDER BY l.created_at LIMIT 100`, [status]) });
}));
adminRouter.post('/listings/:id/decision', wrap(async (req, res) => {
  const b = parse(z.object({ approve: z.boolean(), note: z.string().trim().min(3).max(400) }), req.body);
  const l = await one(pool, 'SELECT id, category, status FROM listings WHERE id = $1', [req.params.id]);
  if (!l) throw new HttpError(404, 'not_found');
  if (b.approve) await pool.query("UPDATE listings SET status = 'active', published_at = COALESCE(published_at, now()), review_note = $2 WHERE id = $1 AND status IN ('pending_review','rejected','paused')", [l.id, b.note]);
  else await pool.query("UPDATE listings SET status = 'removed', removed_reason = $2, closed_at = now() WHERE id = $1 AND status NOT IN ('sold')", [l.id, `moderação: ${b.note}`]);
  await audit(req.user!.id, b.approve ? 'admin.listing.approve' : 'admin.listing.remove', 'listing', l.id, { note: b.note }, req);
  if (l.category === 'outros') await refreshOutrosGroups();
  res.json({ ok: true });
}));

// ---- denúncias ----
adminRouter.get('/reports', wrap(async (_req, res) => {
  res.json({ items: await many(pool, `SELECT r.id, r.reason, r.details, r.created_at, r.listing_id, l.title, l.status AS listing_status, r.reported_user_id
    FROM reports r LEFT JOIN listings l ON l.id = r.listing_id WHERE r.status = 'open' ORDER BY r.created_at LIMIT 100`) });
}));
adminRouter.post('/reports/:id/decision', wrap(async (req, res) => {
  const b = parse(z.object({ uphold: z.boolean(), note: z.string().trim().min(3).max(400), blockSeller: z.boolean().default(false) }), req.body);
  const r = await one(pool, "SELECT * FROM reports WHERE id = $1 AND status = 'open'", [req.params.id]);
  if (!r) throw new HttpError(404, 'not_found');
  await pool.query('UPDATE reports SET status = $2, handled_by = $3, handled_at = now(), handler_note = $4 WHERE id = $1', [r.id, b.uphold ? 'upheld' : 'dismissed', req.user!.id, b.note]);
  if (b.uphold && r.listing_id) await pool.query("UPDATE listings SET status = 'removed', removed_reason = $2, closed_at = now() WHERE id = $1 AND status NOT IN ('sold')", [r.listing_id, `denúncia procedente: ${r.reason}`]);
  if (!b.uphold && r.listing_id) await pool.query("UPDATE listings SET status = 'active' WHERE id = $1 AND status = 'pending_review' AND review_note LIKE 'Retirado automaticamente%'", [r.listing_id]);
  if (b.uphold && b.blockSeller && r.reported_user_id) await pool.query("UPDATE users SET blocked_at = now(), block_reason = $2 WHERE id = $1", [r.reported_user_id, `denúncia: ${r.reason}`]);
  await audit(req.user!.id, 'admin.report.decide', 'report', r.id, b, req);
  res.json({ ok: true });
}));

// ---- usuários ----
adminRouter.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  res.json({ items: await many(pool, `SELECT id, full_name, email, account_type, kyc_status, blocked_at, fee_blocked_at, created_at FROM users
    WHERE anonymized_at IS NULL AND ($1 = '' OR lower(email) LIKE '%' || $1 || '%' OR lower(full_name) LIKE '%' || $1 || '%') ORDER BY created_at DESC LIMIT 50`, [q]) });
}));
adminRouter.post('/users/:id/block', wrap(async (req, res) => {
  const b = parse(z.object({ block: z.boolean(), reason: z.string().trim().min(3).max(300) }), req.body);
  const target = await one(pool, 'SELECT role FROM users WHERE id = $1', [req.params.id]);
  if (!target) throw new HttpError(404, 'not_found');
  if (target.role === 'admin') throw new HttpError(403, 'forbidden');
  await pool.query('UPDATE users SET blocked_at = $2, block_reason = $3 WHERE id = $1', [req.params.id, b.block ? new Date() : null, b.block ? b.reason : null]);
  if (b.block) await pool.query("UPDATE listings SET status = 'removed', removed_reason = 'conta bloqueada' WHERE seller_id = $1 AND status IN ('active','paused','pending_review','draft')", [req.params.id]);
  await audit(req.user!.id, b.block ? 'admin.user.block' : 'admin.user.unblock', 'user', String(req.params.id), b, req);
  res.json({ ok: true });
}));

// ---- vendas e taxas ----
adminRouter.get('/sales', wrap(async (req, res) => {
  const flagged = req.query.flagged === 'true';
  res.json({ items: await many(pool, `SELECT s.id, s.status, s.fee_cents, s.declared_price_cents, s.max_listed_price_cents, s.flagged, s.flag_reason, s.buyer_confirmation, s.due_at, s.paid_at, s.receipt_number, l.title, u.full_name AS seller_name
    FROM sales s JOIN listings l ON l.id = s.listing_id JOIN users u ON u.id = s.seller_id ${flagged ? 'WHERE s.flagged' : ''} ORDER BY s.created_at DESC LIMIT 100`) });
}));
adminRouter.post('/sales/:id/waive', wrap(async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(5).max(300) }), req.body);
  const s = await one(pool, "SELECT * FROM sales WHERE id = $1 AND status = 'awaiting_payment'", [req.params.id]);
  if (!s) throw new HttpError(404, 'not_found');
  await pool.query("UPDATE sales SET status = 'waived' WHERE id = $1", [s.id]);
  if (s.kind === 'success') await pool.query("UPDATE listings SET status = 'sold' WHERE id = $1", [s.listing_id]);
  await audit(req.user!.id, 'admin.sale.waive', 'sale', s.id, b, req);
  res.json({ ok: true });
}));
adminRouter.post('/sales/:id/mark-paid', wrap(async (req, res) => {
  const b = parse(z.object({ reason: z.string().trim().min(5).max(300) }), req.body);
  const s = await one(pool, 'SELECT fee_cents FROM sales WHERE id = $1', [req.params.id]);
  if (!s) throw new HttpError(404, 'not_found');
  await markPaid(String(req.params.id), s.fee_cents, { manual: true, by: req.user!.id });
  await audit(req.user!.id, 'admin.sale.mark_paid', 'sale', String(req.params.id), b, req);
  res.json({ ok: true });
}));

// ---- pedidos (compra pela plataforma) ----
adminRouter.get('/orders', wrap(async (req, res) => {
  const status = z.enum(['disputed', 'return_requested', 'paid', 'shipped', 'received', 'released', 'refunded']).default('disputed').parse(req.query.status);
  res.json({ items: await many(pool, `SELECT o.id, o.status, o.price_cents, o.commission_cents, o.delivery_mode, o.dispute_reason, o.dispute_by, o.return_reason, o.created_at, o.disputed_at, l.title,
      b.full_name AS buyer_name, s.full_name AS seller_name FROM orders o JOIN listings l ON l.id = o.listing_id JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
      WHERE o.status = $1 ORDER BY o.created_at LIMIT 100`, [status]) });
}));
adminRouter.get('/orders/:id', wrap(async (req, res) => {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (!o) throw new HttpError(404, 'not_found');
  await audit(req.user!.id, 'admin.order.view', 'order', o.id, {}, req);
  res.json({ order: await orderView(o, req.user!.id, true), events: (await pool.query('SELECT event, note, actor_id, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at', [o.id])).rows });
}));
adminRouter.post('/orders/:id/resolve', wrap(async (req, res) => {
  const b = parse(z.object({ outcome: z.enum(['refund', 'release']), note: z.string().trim().min(5).max(500) }), req.body);
  await resolveDispute(req.user!.id, String(req.params.id), b.outcome, b.note);
  await audit(req.user!.id, 'admin.order.resolve', 'order', String(req.params.id), b, req);
  res.json({ ok: true });
}));

// ---- categoria Outros ----
adminRouter.get('/outros', wrap(async (_req, res) => {
  res.json({ stats: await outrosStats(pool, 50), groups: await many(pool, 'SELECT * FROM category_groups ORDER BY total_count DESC, token') });
}));
adminRouter.post('/outros/refresh', wrap(async (_req, res) => { res.json(await refreshOutrosGroups()); }));
adminRouter.post('/outros/groups/:token', wrap(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['auto', 'approved', 'hidden']).optional(), label: z.string().trim().min(2).max(40).optional() }), req.body);
  await pool.query('UPDATE category_groups SET status = COALESCE($2, status), label = COALESCE($3, label), updated_at = now() WHERE token = $1', [req.params.token, b.status ?? null, b.label ?? null]);
  if (b.status === 'hidden') await pool.query('UPDATE listings SET group_token = NULL WHERE group_token = $1', [req.params.token]);
  res.json({ ok: true });
}));

// ---- origem do anúncio (para ordem judicial / investigação de fraude) ----
adminRouter.get('/origin', wrap(async (req, res) => {
  const q = parse(z.object({ listingId: z.string().optional(), userId: z.string().optional(), ip: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }), req.query);
  if (!Object.values(q).some(Boolean)) throw new HttpError(422, 'filter_required');
  const rows = await many(pool, `SELECT * FROM origin_records WHERE ($1::text IS NULL OR listing_id = $1) AND ($2::text IS NULL OR user_id = $2) AND ($3::text IS NULL OR ip = $3)
    AND ($4::text IS NULL OR lower(email) = lower($4)) AND ($5::text IS NULL OR phone = $5) ORDER BY created_at DESC LIMIT 200`,
  [q.listingId ?? null, q.userId ?? null, q.ip ?? null, q.email ?? null, q.phone ?? null]);
  await audit(req.user!.id, 'admin.origin.query', 'origin', null, q, req);
  res.json({ items: rows });
}));

// ---- pedidos LGPD ----
adminRouter.get('/data-requests', wrap(async (_req, res) => {
  res.json({ items: await many(pool, "SELECT d.*, u.email FROM data_requests d LEFT JOIN users u ON u.id = d.user_id WHERE d.status = 'open' ORDER BY d.created_at") });
}));
adminRouter.post('/data-requests/:id/resolve', wrap(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['done', 'denied']) }), req.body);
  await pool.query('UPDATE data_requests SET status = $2, resolved_at = now() WHERE id = $1', [req.params.id, b.status]);
  await audit(req.user!.id, 'admin.dsr.resolve', 'data_request', String(req.params.id), b, req);
  res.json({ ok: true });
}));

