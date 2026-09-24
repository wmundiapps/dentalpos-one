import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { id, nowIso, pool } from '../db';
import { getUserByEmail, insertUser, updateUser } from '../repo';
import { HttpError, requireAuth, signToken, toSelf, type AuthedRequest } from '../auth';
import { COUNTRY_BY_CODE, SUPPORTED_LOCALES } from '../../../shared/countries';
import { RULES_VERSION } from '../../../shared/rules';
import type { User } from '../../../shared/types';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  countryCode: z.string().refine((c) => !!COUNTRY_BY_CODE[c], 'country'),
  locale: z.enum(SUPPORTED_LOCALES as [string, ...string[]]),
  acceptTerms: z.literal(true),
  confirmAge: z.literal(true),
});

authRouter.post('/auth/register', async (req, res) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  if (await getUserByEmail(pool, email)) throw new HttpError(409, 'email_in_use');
  const user: User = {
    id: id('usr'), email, passwordHash: await bcrypt.hash(data.password, 10), name: data.name,
    countryCode: data.countryCode, locale: data.locale as User['locale'], roles: ['guest'], createdAt: nowIso(),
    identityVerified: false, strikes: [], termsAcceptedAt: nowIso(), termsVersion: RULES_VERSION,
  };
  await insertUser(pool, user); // índice único em lower(email) cobre cadastros simultâneos
  res.status(201).json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const user = await getUserByEmail(pool, email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'invalid_credentials');
  if (user.banned) throw new HttpError(403, 'account_banned');
  res.json({ token: signToken(user), user: toSelf(user) });
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

// Registro profissional (CRO, CRM, OAB, GDC...). Em produção, conferência
// manual/automática no conselho; aqui marcado como verificado para demonstração.
authRouter.post('/me/license', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ body: z.string().min(2).max(120), number: z.string().min(2).max(40), region: z.string().max(40).optional() }).parse(req.body);
  req.user!.professionalLicense = { ...data, verified: true };
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});

authRouter.post('/me/become-host', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('host')) req.user!.roles.push('host');
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});
