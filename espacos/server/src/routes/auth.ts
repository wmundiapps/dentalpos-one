import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { id, nowIso, pool, rows } from '../db.js';
import { getUserByEmail, insertUser, updateUser } from '../repo.js';
import { HttpError, requireAuth, signToken, toSelf, type AuthedRequest } from '../auth.js';
import { COUNTRY_BY_CODE, SUPPORTED_LOCALES } from '../../../shared/countries.js';
import { RULES_VERSION } from '../../../shared/rules.js';
import type { User } from '../../../shared/types.js';
import { confirmEmail, sendVerificationEmail } from '../emailVerification.js';

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
