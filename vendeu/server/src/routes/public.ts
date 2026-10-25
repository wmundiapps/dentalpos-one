import { Router } from 'express';
import { z } from 'zod';
import { autoPauseOnReports } from './reportsHelper.js';
import { config } from '../config.js';
import { id, many, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { getLegal, legalIndex } from '../legal.js';
import { outrosStats } from '../outros.js';
import { limit } from '../ratelimit.js';
import { CATEGORIES, CONDITIONS, OPERATIONS } from '../../../shared/catalog.js';
import { calcFeeCents, feeTable, MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '../../../shared/fees.js';
import { BRAND } from '../../../shared/brand.js';
import { recordOrigin } from '../origin.js';

export const publicRouter = Router();

publicRouter.get('/config', (_req, res) => {
  res.json({ brand: BRAND, operations: OPERATIONS, conditions: CONDITIONS, categories: CATEGORIES, feeCapCents: config.feeCapCents, company: config.company, feeDueDays: config.feeDueDays, publishRequiresKyc: !config.allowUnverifiedPublish });
});

publicRouter.get('/fees', (_req, res) => { res.json({ table: feeTable(), capCents: config.feeCapCents, rule: 'Anunciar é grátis. A taxa é cobrada só quando você vende (ou aluga) e retira o anúncio. Acima de R$ 3.000, a taxa de R$ 100 sobe R$ 50 a cada R$ 1.000 (ou fração).' }); });
publicRouter.get('/fees/calc', wrap(async (req, res) => {
  const { priceCents } = parse(z.object({ priceCents: z.coerce.number().int().min(MIN_PRICE_CENTS).max(MAX_PRICE_CENTS) }), req.query);
  const feeCents = calcFeeCents(priceCents, config.feeCapCents);
  res.json({ priceCents, feeCents, youReceiveCents: priceCents - feeCents });
}));

// contagem de anúncios ativos por operação / condição / categoria (para os menus)
publicRouter.get('/categories', wrap(async (_req, res) => {
  const rows = await many(pool, "SELECT operation, condition, category, count(*)::int AS n FROM listings WHERE status = 'active' GROUP BY 1,2,3");
  res.json({ categories: CATEGORIES, counts: rows });
}));

publicRouter.get('/outros/groups', wrap(async (req, res) => {
  const cond = z.enum(CONDITIONS).optional().parse(req.query.condition);
  const rows = await many(pool, `SELECT g.token, g.label,
      (SELECT count(*)::int FROM listings l WHERE l.group_token = g.token AND l.status = 'active' ${cond ? 'AND l.condition = $1' : ''}) AS active_count
    FROM category_groups g WHERE g.status <> 'hidden' AND g.total_count > 0 ORDER BY active_count DESC, g.label`, cond ? [cond] : []);
  res.json({ groups: rows.filter((r) => r.active_count > 0).map((r) => ({ token: r.token, label: r.label, activeCount: r.active_count })) });
}));
publicRouter.get('/outros/stats', wrap(async (_req, res) => { res.json(await outrosStats()); }));

publicRouter.get('/legal', (_req, res) => { res.json({ documents: legalIndex() }); });
publicRouter.get('/legal/:key', (req, res) => { const d = getLegal(String(req.params.key)); res.json({ key: d.key, title: d.title, version: d.version, markdown: d.markdown }); });

// foto pública do anúncio
publicRouter.get('/uploads/:id', wrap(async (req, res) => {
  const f = await one(pool, "SELECT mime, data FROM uploads WHERE id = $1 AND kind = 'photo'", [req.params.id]);
  if (!f?.data) throw new HttpError(404, 'not_found');
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.send(f.data);
}));

// denúncia: aceita visitante (limite por IP) e usuário logado
publicRouter.post('/reports', limit('report', 10, 3600), wrap(async (req, res) => {
  const b = parse(z.object({
    listingId: z.string().optional(),
    reason: z.enum(['golpe', 'produto_ilegal', 'falsificado', 'roubado_ou_duvidoso', 'foto_falsa', 'preco_enganoso', 'fora_da_plataforma', 'outro']),
    details: z.string().trim().max(1000).optional(),
  }), req.body);
  if (!b.listingId) throw new HttpError(422, 'listing_required');
  const l = await one(pool, 'SELECT id, seller_id, status FROM listings WHERE id = $1', [b.listingId]);
  if (!l) throw new HttpError(404, 'not_found');
  const reportId = id('rep');
  await pool.query('INSERT INTO reports (id, listing_id, reported_user_id, reporter_id, reason, details) VALUES ($1,$2,$3,$4,$5,$6)', [reportId, l.id, l.seller_id, req.user?.id ?? null, b.reason, b.details ?? null]);
  await recordOrigin(req, 'report', { userId: req.user?.id, listingId: l.id, email: req.user?.email });
  await autoPauseOnReports(l.id);
  res.status(201).json({ id: reportId });
}));
