// Avaliação do app, sugestões de melhoria e relatos de erro.
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, optionalAuth, requireAuth, type AuthedRequest } from '../auth';
import { id, pool, rows } from '../db';
import { SUPPORT_EMAIL, sendMail } from '../mailer';

export const feedbackRouter = Router();

const KINDS = ['rating', 'suggestion', 'bug', 'other'] as const;
const STATUSES = ['new', 'seen', 'planned', 'done', 'wont_fix'] as const;

feedbackRouter.post('/feedback', optionalAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    kind: z.enum(KINDS),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().max(5000).default(''),
    email: z.string().email().max(200).optional(),
    page: z.string().max(300).optional(),
    locale: z.string().max(10).optional(),
  }).refine((d) => d.rating !== undefined || d.message.trim().length >= 3, 'rating_or_message').parse(req.body);
  const fid = id('fbk');
  const email = req.user?.email ?? data.email;
  await pool.query(
    'INSERT INTO app_feedback (id, user_id, email, rating, kind, message, page, locale, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [fid, req.user?.id ?? null, email ?? null, data.rating ?? null, data.kind, data.message.trim(), data.page ?? null, data.locale ?? null,
      String(req.headers['user-agent'] ?? '').slice(0, 300)]);
  // Aviso à equipe (não bloqueia a resposta se o e-mail falhar)
  sendMail({
    to: SUPPORT_EMAIL(), replyTo: email,
    subject: `[SpaceHour feedback] ${data.kind}${data.rating ? ` ${'★'.repeat(data.rating)}` : ''}`,
    text: `${data.message}\n\nUsuário: ${req.user ? `${req.user.name} <${req.user.email}>` : email ?? 'anônimo'}\nPágina: ${data.page ?? '-'}\nIdioma: ${data.locale ?? '-'}\nID: ${fid}`,
  }).catch((e) => console.error('[feedback email]', (e as Error).message));
  res.status(201).json({ id: fid });
});

feedbackRouter.get('/admin/feedback', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const summary = await rows(pool, `SELECT COUNT(*)::int AS total, ROUND(AVG(rating)::numeric, 2)::float AS average,
    COUNT(*) FILTER (WHERE kind = 'bug' AND status IN ('new','seen'))::int AS open_bugs FROM app_feedback`);
  const items = await rows(pool, 'SELECT * FROM app_feedback ORDER BY created_at DESC LIMIT 200');
  res.json({ summary: summary[0], items });
});

feedbackRouter.post('/admin/feedback/:id/status', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const { status } = z.object({ status: z.enum(STATUSES) }).parse(req.body);
  const r = await pool.query('UPDATE app_feedback SET status = $2 WHERE id = $1', [req.params.id, status]);
  if (!r.rowCount) throw new HttpError(404, 'not_found');
  res.json({ ok: true });
});
