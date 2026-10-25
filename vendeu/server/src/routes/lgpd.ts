import { Router } from 'express';
import { z } from 'zod';
import { endSession, checkPassword, requireAuth } from '../auth.js';
import { id, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { deleteAccount, exportUserData } from '../lgpd.js';
import { audit } from '../origin.js';
import { limit } from '../ratelimit.js';

export const lgpdRouter = Router();
lgpdRouter.use(requireAuth);

lgpdRouter.get('/export', limit('export', 5, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const data = await exportUserData(req.user!.id);
  await audit(req.user!.id, 'lgpd.export', 'user', req.user!.id, {}, req);
  res.set({ 'Content-Disposition': 'attachment; filename="meus-dados-vendeu.json"', 'Cache-Control': 'no-store' });
  res.json(data);
}));

lgpdRouter.post('/requests', limit('dsr', 10, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const b = parse(z.object({ kind: z.enum(['correct', 'info', 'revoke']), details: z.string().trim().max(1500).optional() }), req.body);
  const rid = id('dsr');
  await pool.query('INSERT INTO data_requests (id, user_id, kind, details) VALUES ($1,$2,$3,$4)', [rid, req.user!.id, b.kind, b.details ?? null]);
  if (b.kind === 'revoke') await pool.query('UPDATE users SET marketing_opt_in = false WHERE id = $1', [req.user!.id]);
  res.status(201).json({ id: rid, message: 'Pedido recebido. Respondemos em até 15 dias, conforme a LGPD.' });
}));

lgpdRouter.get('/requests', wrap(async (req, res) => {
  res.json((await pool.query('SELECT id, kind, status, created_at, resolved_at FROM data_requests WHERE user_id = $1 ORDER BY created_at DESC', [req.user!.id])).rows);
}));

// eliminar a conta: exige a senha de novo
lgpdRouter.post('/delete-account', limit('delete-acc', 5, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const b = parse(z.object({ password: z.string().max(100), confirm: z.literal('ELIMINAR') }), req.body);
  const u = await one(pool, 'SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!(await checkPassword(b.password, u.password_hash))) throw new HttpError(401, 'invalid_credentials');
  await audit(req.user!.id, 'lgpd.delete_account', 'user', req.user!.id, {}, req);
  await deleteAccount(req.user!.id);
  endSession(res);
  res.json({ ok: true });
}));
