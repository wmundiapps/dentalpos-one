import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'node:crypto';
import { id, nowIso, one, pool, rows, withTx } from '../db.js';
import { getUser, getUserByEmail, insertUser, updateUser } from '../repo.js';
import { HttpError, promoteConfiguredAdmin, requireAuth, signToken, toSelf, type AuthedRequest } from '../auth.js';
import { COUNTRY_BY_CODE, SUPPORTED_LOCALES } from '../../../shared/countries.js';
import { RULES_VERSION } from '../../../shared/rules.js';
import type { User } from '../../../shared/types.js';
import { confirmEmail, confirmEmailCode, sendVerificationEmail } from '../emailVerification.js';
import { requestPasswordReset, resetPassword } from '../passwordReset.js';
import { RESET_MAX_USERS, RESET_PHRASE, resetAllData } from '../reset.js';
import { assertCleanText, assertLoginAllowed, limit, loginFailed, resendLoginChallenge, securityEvent, setTwoFactor, startLoginChallenge, twoFactorRequired, twoFactorStatus, verifyLoginChallenge } from '../security.js';

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
  marketingOptIn: z.boolean().optional(), // consentimento separado para novidades (LGPD)
});

authRouter.post('/auth/register', async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (req.ip) await limit(`register:ip:${req.ip}`, 10, 60 * 60); // no máximo 10 contas por hora por IP
  await assertCleanText([data.name], { ip: req.ip, where: 'register' });
  const email = data.email.toLowerCase();
  if (await getUserByEmail(pool, email)) throw new HttpError(409, 'email_in_use');
  if (emailProvider(email).kind === 'disposable') throw new HttpError(422, 'disposable_email');
  const user: User = {
    id: id('usr'), email, passwordHash: await bcrypt.hash(data.password, 10), name: data.name,
    countryCode: data.countryCode, locale: data.locale as User['locale'], roles: ['guest'], createdAt: nowIso(),
    identityVerified: false, strikes: [], termsAcceptedAt: nowIso(), termsVersion: RULES_VERSION, licenseStatus: 'none',
  };
  await insertUser(pool, user); // índice único em lower(email) cobre cadastros simultâneos
  await pool.query('UPDATE users SET signup_source = $2, signup_ip = $3, signup_user_agent = $4 WHERE id = $1',
    [user.id, data.source ?? null, req.ip ?? null, req.get('user-agent')?.slice(0, 300) ?? null]);
  if (data.marketingOptIn) await pool.query('UPDATE users SET marketing_opt_in_at = now() WHERE id = $1', [user.id]);
  // Falha no envio não impede o cadastro: dá para reenviar pelo aviso no app.
  await sendVerificationEmail(user).catch((e) => console.error('[email] confirmação de cadastro', (e as Error).message));
  res.status(201).json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(req.body);
  await assertLoginAllowed(email, req.ip); // senha errada demais: bloqueio de 15 minutos
  const user = await getUserByEmail(pool, email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await loginFailed(email, req.ip);
    throw new HttpError(401, 'invalid_credentials');
  }
  if (user.banned) throw new HttpError(403, 'account_banned');
  // Verificação em duas etapas: código no e-mail antes de liberar o acesso
  if (await twoFactorRequired(user)) return res.json(await startLoginChallenge(user, { ip: req.ip, userAgent: req.get('user-agent') }));
  await promoteConfiguredAdmin(user); // o menu Admin já aparece neste login, sem recarregar
  res.json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login/verify', async (req, res) => {
  const { challengeId, code } = z.object({ challengeId: z.string().min(4).max(60), code: z.string().min(4).max(12) }).parse(req.body);
  if (req.ip) await limit(`login2fa:ip:${req.ip}`, 30, 15 * 60);
  const user = await getUser(pool, await verifyLoginChallenge(challengeId, code, req.ip));
  if (!user || user.banned) throw new HttpError(403, 'account_banned');
  await securityEvent('login_2fa_ok', { userId: user.id, ip: req.ip });
  await promoteConfiguredAdmin(user);
  res.json({ token: signToken(user), user: toSelf(user) });
});

authRouter.post('/auth/login/resend', async (req, res) => {
  const { challengeId } = z.object({ challengeId: z.string().min(4).max(60) }).parse(req.body);
  await resendLoginChallenge(challengeId, (uid) => getUser(pool, uid), { ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ sent: true });
});

authRouter.get('/me/two-factor', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await twoFactorStatus(req.user!));
});

authRouter.post('/me/two-factor', requireAuth, async (req: AuthedRequest, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await setTwoFactor(req.user!, enabled);
  res.json(await twoFactorStatus(req.user!));
});

authRouter.post('/auth/forgot-password', async (req, res) => {
  const { email } = z.object({ email: z.string().email().max(200) }).parse(req.body);
  if (req.ip) await limit(`forgot:ip:${req.ip}`, 10, 60 * 60);
  await limit(`forgot:email:${email.toLowerCase()}`, 5, 60 * 60);
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
  await confirmEmail(token, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json({ verified: true });
});
authRouter.post('/me/verify-code', requireAuth, async (req: AuthedRequest, res) => {
  const { code } = z.object({ code: z.string().min(6).max(12) }).parse(req.body);
  await confirmEmailCode(req.user!.id, code, { ip: req.ip, userAgent: req.get('user-agent') });
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

// Provedor do e-mail (gmail, hotmail, domínio próprio...) e aviso de e-mail descartável
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'dispostable.com', 'maildrop.cc', 'mohmal.com', 'emailondeck.com', 'throwawaymail.com', 'fakeinbox.com'];
const FREE = ['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'msn.com', 'proton.me', 'protonmail.com'];
export function emailProvider(email: string) {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return { domain, kind: DISPOSABLE.includes(domain) ? 'disposable' : FREE.includes(domain) ? 'free' : 'own_domain' };
}

// Consulta de um usuário pelo e-mail (suporte): cadastro, anúncios, Mercado Pago e e-mails enviados.
authRouter.get('/admin/users', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const email = z.string().trim().min(3).max(200).parse(req.query.email);
  const users = await rows<{ id: string; email: string; name: string; phone: string | null; roles: string[]; created_at: Date; email_verified_at: Date | null; signup_source: string | null; mp_connected_at: Date | null;
    signup_ip: string | null; signup_user_agent: string | null; email_verified_ip: string | null; email_verified_user_agent: string | null; identity_verified: boolean; identity_status: string | null; license_status: string | null }>(pool,
    `SELECT u.id, u.email, u.name, u.phone, u.roles, u.created_at, u.email_verified_at, u.signup_source, m.connected_at AS mp_connected_at,
            u.signup_ip, u.signup_user_agent, u.email_verified_ip, u.email_verified_user_agent, u.identity_verified, u.license_status,
            (SELECT status FROM identity_verifications iv WHERE iv.user_id = u.id ORDER BY created_at DESC LIMIT 1) AS identity_status
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
    emailProvider: emailProvider(u.email),
    listings: listings.filter((l) => l.host_id === u.id),
    emails: emails.filter((n) => n.user_id === u.id).slice(0, 15),
  })));
});

// Limpeza total antes do lançamento (Admin → Usuários → Começar do zero)
authRouter.post('/admin/reset-all-data', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  const { password, confirm } = z.object({ password: z.string().min(1).max(200), confirm: z.string().max(40) }).parse(req.body);
  if (confirm.trim().toUpperCase() !== RESET_PHRASE) throw new HttpError(422, 'reset_confirm_phrase');
  if (!(await bcrypt.compare(password, req.user!.passwordHash))) throw new HttpError(401, 'invalid_credentials');
  const count = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM users');
  if (count!.n > RESET_MAX_USERS) throw new HttpError(409, 'reset_too_many_users', { max: RESET_MAX_USERS });
  console.warn(`[reset] limpeza total pedida por ${req.user!.email} (${req.ip})`);
  res.json(await resetAllData());
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
  await assertCleanText([data.name, data.bio], { userId: req.user!.id, ip: req.ip, where: 'profile' });
  Object.assign(req.user!, data);
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});

// Verificação de identidade: POST /me/identity (routes/files.ts) — CPF/CNPJ + documento + selfie.

authRouter.post('/me/become-host', requireAuth, async (req: AuthedRequest, res) => {
  if (!req.user!.roles.includes('host')) req.user!.roles.push('host');
  await updateUser(pool, req.user!);
  res.json(toSelf(req.user!));
});
