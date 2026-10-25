// Conta Mercado Pago do vendedor: obrigatória para publicar (é por onde ele recebe). O vendedor conecta a conta
// pelo login do próprio Mercado Pago (OAuth): o Vendeu nunca vê senha, número de cartão nem dados bancários.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { id, one, pool } from '../db.js';
import { HttpError, clientIp, parse, wrap } from '../http.js';
import { PAYMENT_AUTH_TEXT, PAYMENT_AUTH_VERSION } from '../legal.js';
import { mpAuthUrl, mpExchangeCode } from '../payments.js';
import { limit } from '../ratelimit.js';
import { audit } from '../origin.js';
import { encryptText, sha256 } from '../secure.js';

export const paymentMethodRouter = Router();
const jwtSecret = () => process.env.JWT_SECRET ?? 'vendeu-dev-only-jwt-secret';

export async function activeMethod(userId: string) {
  return one(pool, "SELECT id, kind, mp_user_id, created_at FROM payment_methods WHERE user_id = $1 AND status = 'active'", [userId]);
}
const view = (m: any) => (m ? { kind: m.kind, connected: true, since: m.created_at } : null);
const authHash = () => sha256(`${PAYMENT_AUTH_VERSION}\n${PAYMENT_AUTH_TEXT}`);

async function saveAccount(req: any, userId: string, mpUserId: string, access: string | null, refresh: string | null) {
  await pool.query("UPDATE payment_methods SET status = 'removed', removed_at = now() WHERE user_id = $1 AND status = 'active'", [userId]);
  await pool.query(
    `INSERT INTO payment_methods (id, user_id, provider, mp_user_id, access_token_enc, refresh_token_enc, auth_text_hash, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id('pmt'), userId, config.payments.provider, mpUserId, access ? encryptText(access) : null, refresh ? encryptText(refresh) : null, authHash(), clientIp(req), String(req.headers['user-agent'] ?? '').slice(0, 400)]);
  await audit(userId, 'payment_method.connect', 'user', userId, { mpUserId }, req);
}

// retorno do Mercado Pago (o navegador chega aqui vindo do login do MP; não leva cookie de outra origem, por isso o state assinado)
paymentMethodRouter.get('/mp/callback', wrap(async (req, res) => {
  const { code, state } = parse(z.object({ code: z.string().min(4).max(300), state: z.string().max(1000) }), req.query);
  let userId: string;
  try { userId = (jwt.verify(state, jwtSecret()) as { sub: string }).sub; } catch { throw new HttpError(400, 'invalid_state'); }
  const acc = await mpExchangeCode(code);
  await saveAccount(req, userId, acc.userId, acc.accessToken, acc.refreshToken);
  res.redirect(`${config.appUrl}/venda?mp=ok`);
}));

paymentMethodRouter.use(requireAuth);

paymentMethodRouter.get('/', wrap(async (req, res) => {
  res.json({
    method: view(await activeMethod(req.user!.id)),
    provider: config.payments.provider,
    authorization: { version: PAYMENT_AUTH_VERSION, text: PAYMENT_AUTH_TEXT },
    removalFeeCents: config.removalFeeCents,
  });
}));

// começa a conexão com o Mercado Pago
paymentMethodRouter.post('/mp/start', limit('pm', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  if (req.user!.accountType !== 'anunciante') throw new HttpError(403, 'seller_account_required');
  parse(z.object({ authorize: z.literal(true) }), req.body);
  if (config.payments.provider === 'mock') throw new HttpError(400, 'use_mock_connect');
  if (!config.payments.mpClientId) throw new HttpError(503, 'mercadopago_not_configured');
  const state = jwt.sign({ sub: req.user!.id }, jwtSecret(), { expiresIn: '15m' });
  res.json({ url: mpAuthUrl(state) });
}));

// só desenvolvimento/teste: "conecta" uma conta simulada
paymentMethodRouter.post('/', limit('pm', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  if (config.payments.provider !== 'mock' || config.isProd) throw new HttpError(404, 'not_found');
  if (req.user!.accountType !== 'anunciante') throw new HttpError(403, 'seller_account_required');
  parse(z.object({ token: z.literal('mock_ok'), authorize: z.literal(true) }), req.body);
  await saveAccount(req, req.user!.id, `mock_mp_${req.user!.id}`, null, null);
  res.status(201).json({ method: view(await activeMethod(req.user!.id)) });
}));

paymentMethodRouter.delete('/', wrap(async (req, res) => {
  const busy = await one(pool, `SELECT 1 WHERE EXISTS (SELECT 1 FROM listings WHERE seller_id = $1 AND status IN ('active','reserved','paused','pending_review'))
    OR EXISTS (SELECT 1 FROM sales WHERE seller_id = $1 AND status = 'awaiting_payment')
    OR EXISTS (SELECT 1 FROM orders WHERE seller_id = $1 AND status IN ('offered','awaiting_payment','paid','shipped','received','return_requested','disputed'))`, [req.user!.id]);
  if (busy) throw new HttpError(409, 'method_in_use');
  await pool.query("UPDATE payment_methods SET status = 'removed', removed_at = now(), access_token_enc = NULL, refresh_token_enc = NULL WHERE user_id = $1 AND status = 'active'", [req.user!.id]);
  res.json({ ok: true });
}));
