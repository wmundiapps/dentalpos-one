import { Router } from 'express';
import { z } from 'zod';
import { checkPassword, endSession, hashPassword, requireAuth, startSession, validPassword } from '../auth.js';
import { checkCode, issueCode } from '../codes.js';
import { id, one, pool, tx } from '../db.js';
import { HttpError, clientIp, parse, wrap } from '../http.js';
import { hit, limit } from '../ratelimit.js';
import { recordOrigin } from '../origin.js';
import { SIGNUP_TERMS } from '../legal.js';
import { addressSchema, applyIdentity, identitySchema, profileOf, recordAcceptance } from '../accounts.js';
import { normalizePhoneBR } from '../../../shared/documents.js';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email().max(160);
const phoneField = z.string().transform((s, ctx) => {
  const p = normalizePhoneBR(s);
  if (!p) { ctx.addIssue({ code: 'custom', message: 'Telefone inválido (use DDD + número)' }); return z.NEVER; }
  return p;
});
const password = z.string().refine(validPassword, 'A senha precisa ter 8+ caracteres, com letras e números');

const registerSchema = z.object({
  fullName: z.string().trim().min(5, 'Informe o nome completo').max(120).refine((s) => s.split(/\s+/).length >= 2, 'Informe nome e sobrenome'),
  email, password, phone: phoneField,
  accountType: z.enum(['comprador', 'anunciante']),
  identity: identitySchema.optional(),
  accepted: z.record(z.string()),
  marketingOptIn: z.boolean().default(false),
});

authRouter.post('/register', limit('register', 10, 3600), wrap(async (req, res) => {
  const b = parse(registerSchema, req.body);
  if (b.accountType === 'anunciante' && !b.identity) throw new HttpError(422, 'identity_required');
  const userId = id('usr');
  await tx(async (c) => {
    if (await one(c, 'SELECT 1 FROM users WHERE lower(email) = $1 AND anonymized_at IS NULL', [b.email])) throw new HttpError(409, 'email_in_use');
    await c.query('INSERT INTO users (id, email, password_hash, full_name, phone, marketing_opt_in) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, b.email, await hashPassword(b.password), b.fullName, b.phone, b.marketingOptIn]);
    if (b.identity) await applyIdentity(c, userId, b.identity);
    await recordAcceptance(c, req, userId, SIGNUP_TERMS, b.accepted);
    await recordOrigin(req, 'signup', { userId, email: b.email, phone: b.phone }, c);
  });
  await issueCode(userId, 'email', b.email);
  await issueCode(userId, 'phone', b.phone);
  startSession(res, userId);
  res.status(201).json({ id: userId, next: ['verify_email', 'verify_phone', ...(b.accountType === 'anunciante' ? ['kyc'] : [])] });
}));

authRouter.post('/login', limit('login-ip', 30, 900), wrap(async (req, res) => {
  const b = parse(z.object({ email, password: z.string().max(100) }), req.body);
  await hit(`login-email:${b.email}`, 10, 900);
  const u = await one(pool, 'SELECT * FROM users WHERE lower(email) = $1 AND anonymized_at IS NULL', [b.email]);
  const fail = async () => {
    if (u) {
      await pool.query(`UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $1`, [u.id]);
    }
    throw new HttpError(401, 'invalid_credentials');
  };
  if (!u) { await checkPassword(b.password, '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'); return fail(); }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(429, 'account_locked');
  if (!(await checkPassword(b.password, u.password_hash))) return fail();
  if (u.blocked_at) throw new HttpError(403, 'account_blocked');
  await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  await recordOrigin(req, 'login', { userId: u.id, email: u.email, phone: u.phone });
  startSession(res, u.id);
  res.json({ user: profileOf(u) });
}));

authRouter.post('/logout', (_req, res) => { endSession(res); res.json({ ok: true }); });

authRouter.post('/verify-email', requireAuth, limit('verify', 20, 900), wrap(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
  const target = await checkCode(req.user!.id, 'email', code);
  await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND lower(email) = lower($2)', [req.user!.id, target]);
  res.json({ ok: true });
}));
authRouter.post('/verify-phone', requireAuth, limit('verify', 20, 900), wrap(async (req, res) => {
  const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
  const target = await checkCode(req.user!.id, 'phone', code);
  await pool.query('UPDATE users SET phone_verified_at = now() WHERE id = $1 AND phone = $2', [req.user!.id, target]);
  res.json({ ok: true });
}));
authRouter.post('/resend', requireAuth, limit('resend', 5, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const { channel } = parse(z.object({ channel: z.enum(['email', 'phone']) }), req.body);
  const u = await one(pool, 'SELECT email, phone FROM users WHERE id = $1', [req.user!.id]);
  await issueCode(req.user!.id, channel, channel === 'email' ? u.email : u.phone);
  res.json({ ok: true });
}));

// Esqueci a senha: sempre responde igual (não revela se o e-mail existe).
authRouter.post('/forgot', limit('forgot', 5, 3600), wrap(async (req, res) => {
  const b = parse(z.object({ email }), req.body);
  const u = await one(pool, 'SELECT id, email FROM users WHERE lower(email) = $1 AND anonymized_at IS NULL AND blocked_at IS NULL', [b.email]);
  if (u) await issueCode(u.id, 'reset', u.email);
  res.json({ ok: true });
}));
authRouter.post('/reset', limit('reset', 10, 900), wrap(async (req, res) => {
  const b = parse(z.object({ email, code: z.string().regex(/^\d{6}$/), password }), req.body);
  const u = await one(pool, 'SELECT id FROM users WHERE lower(email) = $1 AND anonymized_at IS NULL', [b.email]);
  if (!u) throw new HttpError(400, 'code_invalid');
  await checkCode(u.id, 'reset', b.code);
  await pool.query('UPDATE users SET password_hash = $2, pw_changed_at = now(), failed_logins = 0, locked_until = NULL, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [u.id, await hashPassword(b.password)]);
  res.json({ ok: true });
}));

// ---- conta ----
export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get('/', wrap(async (req, res) => {
  const u = await one(pool, 'SELECT * FROM users WHERE id = $1', [req.user!.id]);
  const owed = await one(pool, `SELECT COALESCE(sum(fee_cents),0)::bigint AS total, count(*)::int AS n FROM sales WHERE seller_id = $1 AND status = 'awaiting_payment'`, [u.id]);
  const pm = await one(pool, "SELECT kind FROM payment_methods WHERE user_id = $1 AND status = 'active'", [u.id]);
  res.json({ user: profileOf(u), feesDueCents: owed.total, feesDueCount: owed.n, paymentMethod: pm ? { kind: pm.kind, connected: true } : null });
}));

meRouter.patch('/', wrap(async (req, res) => {
  const b = parse(z.object({ phone: phoneField.optional(), address: addressSchema.optional(), marketingOptIn: z.boolean().optional() }), req.body);
  const u = await one(pool, 'SELECT * FROM users WHERE id = $1', [req.user!.id]);
  if (b.phone && b.phone !== u.phone) {
    await pool.query('UPDATE users SET phone = $2, phone_verified_at = NULL WHERE id = $1', [u.id, b.phone]);
    await issueCode(u.id, 'phone', b.phone);
  }
  if (b.address) {
    // mudou o endereço depois de verificado: a verificação precisa ser refeita
    await pool.query(`UPDATE users SET cep=$2, street=$3, street_number=$4, complement=$5, district=$6, city=$7, state=$8,
      kyc_status = CASE WHEN kyc_status = 'verified' THEN 'none' ELSE kyc_status END, updated_at = now() WHERE id=$1`,
    [u.id, b.address.cep.replace(/\D/g, ''), b.address.street, b.address.number, b.address.complement || null, b.address.district, b.address.city, b.address.state]);
  }
  if (b.marketingOptIn !== undefined) await pool.query('UPDATE users SET marketing_opt_in = $2 WHERE id = $1', [u.id, b.marketingOptIn]);
  res.json({ user: profileOf(await one(pool, 'SELECT * FROM users WHERE id = $1', [u.id])) });
}));

// Quem se cadastrou como comprador e quer anunciar informa CPF/CNPJ e endereço
meRouter.post('/become-seller', wrap(async (req, res) => {
  const b = parse(identitySchema, req.body);
  await tx((c) => applyIdentity(c, req.user!.id, b));
  res.json({ ok: true, next: ['kyc'] });
}));

meRouter.get('/terms', wrap(async (req, res) => {
  res.json(await (await pool.query('SELECT doc_key, version, text_hash, ip, created_at FROM term_acceptances WHERE user_id = $1 ORDER BY created_at DESC', [req.user!.id])).rows);
}));
