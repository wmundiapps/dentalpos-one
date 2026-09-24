import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, id, nowIso, save } from '../db';
import { HttpError, requireAuth, signToken, toSelf, type AuthedRequest } from '../auth';
import { COUNTRY_BY_CODE, SUPPORTED_LOCALES } from '../../../shared/countries';
import { RULES_VERSION } from '../../../shared/rules';

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

authRouter.post('/auth/register', (req, res) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  if (db.users.some((u) => u.email === email)) throw new HttpError(409, 'email_in_use');
  const user = {
    id: id('usr'), email, passwordHash: bcrypt.hashSync(data.password, 10), name: data.name,
    countryCode: data.countryCode, locale: data.locale as never, roles: ['guest' as const], createdAt: nowIso(),
    identityVerified: false, strikes: [], termsAcceptedAt: nowIso(), termsVersion: RULES_VERSION,
  };
  db.users.push(user);
  save();
  res.status(201).json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login', (req, res) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const user = db.users.find((u) => u.email === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) throw new HttpError(401, 'invalid_credentials');
  if (user.banned) throw new HttpError(403, 'account_banned');
  res.json({ token: signToken(user), user: toSelf(user) });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(toSelf(req.user!));
});

authRouter.put('/me', requireAuth, (req: AuthedRequest, res) => {
  const data = z.object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().max(40).optional(),
    bio: z.string().max(1000).optional(),
    countryCode: z.string().refine((c) => !!COUNTRY_BY_CODE[c]).optional(),
    locale: z.enum(SUPPORTED_LOCALES as [string, ...string[]]).optional(),
    companyTaxId: z.string().max(40).optional(),
  }).parse(req.body);
  Object.assign(req.user!, data);
  save();
  res.json(toSelf(req.user!));
});

// Verificação de identidade. Em produção, integrar um provedor de KYC
// (documento + selfie). Aqui a verificação é registrada como concluída.
authRouter.post('/me/verify-identity', requireAuth, (req: AuthedRequest, res) => {
  const data = z.object({ documentType: z.string().min(2).max(60), documentNumber: z.string().min(4).max(40) }).parse(req.body);
  Object.assign(req.user!, data, { identityVerified: true });
  save();
  res.json(toSelf(req.user!));
});

// Registro profissional (CRO, CRM, OAB, GDC...). Em produção, conferência
// manual/automática no conselho; aqui marcado como verificado para demonstração.
authRouter.post('/me/license', requireAuth, (req: AuthedRequest, res) => {
  const data = z.object({ body: z.string().min(2).max(120), number: z.string().min(2).max(40), region: z.string().max(40).optional() }).parse(req.body);
  req.user!.professionalLicense = { ...data, verified: true };
  save();
  res.json(toSelf(req.user!));
});

authRouter.post('/me/become-host', requireAuth, (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('host')) req.user!.roles.push('host');
  save();
  res.json(toSelf(req.user!));
});
