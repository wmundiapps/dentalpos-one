// Captação (só equipe/admin) + links públicos do e-mail (clique e descadastro).
import { Router, type Response } from 'express';
import { z } from 'zod';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import * as P from '../prospecting.js';

export const prospectingRouter = Router();

function requireAdmin(req: AuthedRequest) {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
}

prospectingRouter.get('/admin/prospecting/overview', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json({
    segments: P.SEGMENTS, base: await P.baseStatus(), stats: await P.stats(), config: await P.getConfig(),
    mapsEnabled: !!process.env.GOOGLE_PLACES_API_KEY,
  });
});

prospectingRouter.post('/admin/prospecting/search', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const q = z.object({
    source: z.enum(['receita', 'maps']),
    segment: z.string().max(40).optional(),
    cnaes: z.array(z.string().max(10)).max(20).optional(),
    query: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    uf: z.string().length(2).optional(),
    onlyWithEmail: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }).parse(req.body);
  const results = q.source === 'receita' ? await P.searchReceita(q) : await P.searchMaps({ ...q, city: q.city ?? '' });
  res.json({ results });
});

const candidate = z.object({
  source: z.enum(['receita', 'maps', 'csv', 'manual']),
  sourceRef: z.string().max(200).optional(),
  name: z.string().min(1).max(200),
  segment: z.string().max(120).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
});

prospectingRouter.post('/admin/prospecting/add', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { items } = z.object({ items: z.array(candidate).min(1).max(1000) }).parse(req.body);
  res.json(await P.addProspects(items.map((i) => ({ ...i, segment: i.segment ?? undefined })), req.user!.id));
});

prospectingRouter.get('/admin/prospecting/prospects', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const q = z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional() }).parse(req.query);
  res.json({ prospects: await P.listProspects(q), stats: await P.stats() });
});

prospectingRouter.patch('/admin/prospecting/prospects/:id', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const d = z.object({
    status: z.enum(['new', 'in_sequence', 'done', 'hot', 'replied', 'converted', 'unsubscribed', 'bounced', 'excluded']).optional(),
    notes: z.string().max(2000).optional(),
    email: z.string().email().max(200).optional(),
  }).parse(req.body);
  const { pool } = await import('../db.js');
  if (d.status === 'unsubscribed') { await P.optOut(String(req.params.id), 'admin'); return res.json({ ok: true }); }
  await pool.query(`UPDATE prospects SET status = coalesce($2, status), notes = coalesce($3, notes), email = coalesce(lower($4), email) WHERE id = $1`,
    [req.params.id, d.status ?? null, d.notes ?? null, d.email ?? null]);
  if (d.status === 'bounced') { // e-mail inválido: não tenta de novo
    await pool.query(`INSERT INTO prospect_blocklist (hash, kind, reason)
      SELECT encode(sha256(convert_to('email:' || lower(trim(email)), 'UTF8')), 'hex'), 'email', 'bounced' FROM prospects WHERE id = $1 AND email IS NOT NULL ON CONFLICT DO NOTHING`, [req.params.id]);
  }
  res.json({ ok: true });
});

// Excel com WhatsApp de um clique (links controlados); grava quem exportou
prospectingRouter.get('/admin/prospecting/export.xlsx', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const q = z.object({ status: z.string().max(20).optional(), amostra: z.coerce.number().int().min(1).max(20).optional() }).parse(req.query);
  const { buffer } = await P.exportXlsx({ status: q.status, sample: q.amostra, userId: req.user!.id, ip: req.ip });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="captacao-spacehour-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

prospectingRouter.put('/admin/prospecting/config', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const c = z.object({
    sending_enabled: z.boolean().optional(),
    daily_limit: z.number().int().min(1).max(200).optional(),
    step2_after_days: z.number().int().min(1).max(30).optional(),
    step3_after_days: z.number().int().min(1).max(60).optional(),
    send_to_webmail: z.boolean().optional(),
  }).parse(req.body);
  res.json(await P.setConfig(c));
});

prospectingRouter.post('/admin/prospecting/run', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { dryRun } = z.object({ dryRun: z.boolean().default(true) }).parse(req.body ?? {});
  res.json(await P.runSequence({ dryRun }));
});

prospectingRouter.post('/admin/prospecting/test', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { step } = z.object({ step: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).parse(req.body);
  await P.sendTest(req.user!.email, step);
  res.json({ sent: true, to: req.user!.email });
});

// ───────────── Públicos (links do e-mail) ─────────────
prospectingRouter.get('/p/c/:token', async (req, res) => {
  res.redirect(302, await P.handleClick(String(req.params.token).slice(0, 80), req.query.s === '0' ? 0 : Number(req.query.s) || undefined));
});

// Clique no número do WhatsApp (lista ou Excel): só abre a conversa se puder convidar
prospectingRouter.get('/p/w/:token', async (req, res) => {
  const r = await P.whatsappInvite(String(req.params.token).slice(0, 80));
  if ('url' in r) return res.redirect(302, r.url);
  res.status(409).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'no-store');
  res.send(simplePage(P.esc(r.error)));
});

function simplePage(html: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpaceHour</title>
<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#1f2937;text-align:center">
<h2 style="color:#0f766e">SpaceHour</h2><p>${html}</p></div>`;
}

async function unsubscribePage(req: AuthedRequest, res: Response) {
  const email = await P.unsubscribe(String(req.params.token).slice(0, 80));
  if (req.method === 'POST') return res.status(200).json({ ok: true }); // descadastro em um clique (RFC 8058)
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpaceHour</title>
<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#1f2937;text-align:center">
<h2 style="color:#0f766e">SpaceHour</h2>
<p>${email ? `Pronto: <strong>${P.esc(email)}</strong> não vai mais receber nossos e-mails.` : 'Este link não é mais válido, mas pode ficar tranquilo: você não está na nossa lista.'}</p>
<p style="color:#6b7280;font-size:14px">Se foi engano, escreva para suporte@space-hour.com.</p></div>`);
}
prospectingRouter.get('/p/u/:token', unsubscribePage);
prospectingRouter.post('/p/u/:token', unsubscribePage);
