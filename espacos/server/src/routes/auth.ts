import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import { id, nowIso, one, pool, rows, withTx } from '../db.js';
import { getUserByEmail, insertUser, updateUser } from '../repo.js';
import { HttpError, requireAuth, signToken, toSelf, type AuthedRequest } from '../auth.js';
import { COUNTRY_BY_CODE, SUPPORTED_LOCALES } from '../../../shared/countries.js';
import { RULES_VERSION } from '../../../shared/rules.js';
import type { User } from '../../../shared/types.js';
import { confirmEmail, sendVerificationEmail } from '../emailVerification.js';
import { requestPasswordReset, resetPassword } from '../passwordReset.js';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  countryCode: z.string().refine((c) => !!COUNTRY_BY_CODE[c], 'country'),
  locale: z.enum(SUPPORTED_LOCALES as [string, ...string[]]),
  acceptTerms: z.literal(true),
  confirmAge: z.literal(true),
  source: z.string().max(200).optional(), // utm_source/medium/campaign/content (first touch)
});

authRouter.post('/auth/register', async (req, res) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  if (await getUserByEmail(pool, email)) throw new HttpError(409, 'email_in_use');
  const user: User = {
    id: id('usr'), email, passwordHash: await bcrypt.hash(data.password, 10), name: data.name,
    countryCode: data.countryCode, locale: data.locale as User['locale'], roles: ['guest'], createdAt: nowIso(),
    identityVerified: false, strikes: [], termsAcceptedAt: nowIso(), termsVersion: RULES_VERSION, licenseStatus: 'none',
  };
  await insertUser(pool, user); // índice único em lower(email) cobre cadastros simultâneos
  if (data.source) await pool.query('UPDATE users SET signup_source = $2 WHERE id = $1', [user.id, data.source]);
  // Falha no envio não impede o cadastro: dá para reenviar pelo aviso no app.
  await sendVerificationEmail(user).catch((e) => console.error('[email] confirmação de cadastro', (e as Error).message));
  res.status(201).json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const user = await getUserByEmail(pool, email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'invalid_credentials');
  if (user.banned) throw new HttpError(403, 'account_banned');
  res.json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/forgot-password', async (req, res) => {
  const { email } = z.object({ email: z.string().email().max(200) }).parse(req.body);
  await requestPasswordReset(email).catch((e) => console.error('[senha]', (e as Error).message));
  res.json({ sent: true }); // sempre igual: não revela se o e-mail tem conta
});

authRouter.post('/auth/reset-password', async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) }).parse(req.body);
  const user = await resetPassword(token, password);
  res.json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/verify-email', async (req, res) => {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
  await confirmEmail(token);
  res.json({ verified: true });
});

authRouter.post('/me/resend-verification', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.emailVerifiedAt) return res.json({ verified: true });
  await sendVerificationEmail(req.user!, { throttle: true });
  res.json({ sent: true });
});

// Cadastros por origem nos últimos N dias (medição das campanhas).
authRouter.get('/admin/signups', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 14) || 14));
  const bySource = await rows(pool,
    `SELECT coalesce(u.signup_source, 'direto') AS source, count(*)::int AS signups,
            count(*) FILTER (WHERE u.email_verified_at IS NOT NULL)::int AS verified,
            count(DISTINCT l.host_id)::int AS hosts_with_listing
       FROM users u LEFT JOIN listings l ON l.host_id = u.id
      WHERE u.created_at > now() - make_interval(days => $1)
      GROUP BY 1 ORDER BY 2 DESC`, [days]);
  const byDay = await rows(pool,
    `SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day, count(*)::int AS signups
       FROM users WHERE created_at > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [days]);
  res.json({ days, bySource, byDay });
});

// Consulta de um usuário pelo e-mail (suporte): cadastro, anúncios, Mercado Pago e e-mails enviados.
authRouter.get('/admin/users', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const email = z.string().trim().min(3).max(200).parse(req.query.email);
  const users = await rows<{ id: string; email: string; name: string; phone: string | null; roles: string[]; created_at: Date; email_verified_at: Date | null; signup_source: string | null; mp_connected_at: Date | null }>(pool,
    `SELECT u.id, u.email, u.name, u.phone, u.roles, u.created_at, u.email_verified_at, u.signup_source, m.connected_at AS mp_connected_at
       FROM users u LEFT JOIN mp_accounts m ON m.user_id = u.id
      WHERE u.deleted_at IS NULL AND lower(u.email) LIKE '%' || lower($1) || '%' ORDER BY u.created_at DESC LIMIT 10`, [email]);
  const ids = users.map((u) => u.id);
  const listings = ids.length ? await rows<{ id: string; host_id: string; title: string; city: string; active: boolean; created_at: Date }>(pool,
    'SELECT id, host_id, title, city, active, created_at FROM listings WHERE host_id = ANY($1) ORDER BY created_at DESC', [ids]) : [];
  const emails = ids.length ? await rows<{ user_id: string; kind: string; created_at: Date; email_status: string; email_error: string | null }>(pool,
    `SELECT user_id, kind, created_at, email_status, email_error FROM notifications
      WHERE user_id = ANY($1) ORDER BY created_at DESC LIMIT 60`, [ids]) : [];
  res.json(users.map((u) => ({
    ...u,
    listings: listings.filter((l) => l.host_id === u.id),
    emails: emails.filter((n) => n.user_id === u.id).slice(0, 15),
  })));
});

// Aplicativo: registra o aparelho para notificações push.
authRouter.post('/me/push-token', requireAuth, async (req: AuthedRequest, res) => {
  const { token, platform } = z.object({ token: z.string().min(20).max(4096), platform: z.enum(['android', 'ios']) }).parse(req.body);
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = $2, platform = $3, last_seen = now()`, [token, req.user!.id, platform]);
  res.status(204).end();
});

authRouter.delete('/me/push-token', requireAuth, async (req: AuthedRequest, res) => {
  const { token } = z.object({ token: z.string().max(4096) }).parse(req.body);
  await pool.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, req.user!.id]);
  res.status(204).end();
});

// Exclusão da conta pelo próprio usuário (LGPD art. 18; exigência da App Store e do Google Play).
// Os dados pessoais são apagados ou anonimizados; reservas, pagamentos e avaliações ficam
// sem identificação pelo prazo legal (Política de Privacidade, 7.3).
authRouter.delete('/me', requireAuth, async (req: AuthedRequest, res) => {
  const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
  const u = req.user!;
  if (!(await bcrypt.compare(password, u.passwordHash))) throw new HttpError(401, 'invalid_credentials');
  const open = await one(pool,
    `SELECT 1 FROM bookings WHERE (guest_id = $1 OR host_id = $1)
       AND status IN ('pending_payment','pending_guarantor','pending_host','confirmed','checked_in') LIMIT 1`, [u.id]);
  if (open) throw new HttpError(409, 'account_has_active_bookings');
  await withTx(async (tx) => {
    await tx.query(
      `UPDATE users SET email = $2, name = 'Conta excluída', phone = NULL, bio = NULL, document_type = NULL, document_number = NULL,
         license_body = NULL, license_number = NULL, license_region = NULL, license_verified = false, company_tax_id = NULL,
         password_hash = $3, banned = true, email_verified_at = NULL, email_verify_token_hash = NULL, email_verify_prev_hash = NULL, signup_source = NULL, deleted_at = now()
       WHERE id = $1`, [u.id, `excluido-${u.id}@deleted.space-hour.com`, crypto.randomBytes(32).toString('hex')]);
    await tx.query('UPDATE listings SET active = false WHERE host_id = $1', [u.id]);
    await tx.query('UPDATE license_verifications SET document = NULL WHERE user_id = $1', [u.id]);
    for (const table of ['push_tokens', 'mp_accounts', 'favorites', 'notifications']) {
      await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [u.id]);
    }
  });
  console.log(`[conta] ${u.id} excluída pelo titular`);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(toSelf(req.user!));
});

authRouter.put('/me', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().max(40).optional(),
    bio: z.string().max(1000).optional(),
    countryCode: z.string().refine((c) => !!COUNTRY_BY_CODE[c]).optional(),
    locale: z.enum(SUPPORTED_LOCALES as [string, ...string[]]).optional(),
    companyTaxId: z.string().max(40).optional(),
  }).parse(req.body);
  Object.assign(req.user!, data);
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});

// Verificação de identidade. Em produção, integrar um provedor de KYC
// (documento + selfie). Aqui a verificação é registrada como concluída.
authRouter.post('/me/verify-identity', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ documentType: z.string().min(2).max(60), documentNumber: z.string().min(4).max(40) }).parse(req.body);
  Object.assign(req.user!, data, { identityVerified: true });
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});

authRouter.post('/me/become-host', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('host')) req.user!.roles.push('host');
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});
