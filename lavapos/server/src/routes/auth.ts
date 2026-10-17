import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, withTx, pool } from '../db.js';
import { signToken, loadUser, requireUser, type AuthedRequest } from '../auth.js';
import { HttpError, audit, clientIp, rateLimit } from '../security.js';
import { defaultSettings } from '../settings.js';
import { seedTenant } from '../defaults.js';
import { TERMS_VERSION } from '../legal.js';
import { onlyDigits, passwordProblem, text, validCnpj } from '../validators.js';
import { enqueue, appUrl } from '../notify.js';
import { newSecret, otpauthUrl, verifyTotp } from '../totp.js';
import { decrypt, encrypt } from '../secure.js';

export const authRouter = Router();
const DUMMY_HASH = bcrypt.hashSync('nao-e-uma-senha', 12); // custo igual para e-mail inexistente (não revela quem tem conta)
const MAX_FAILS = 5;
const LOCK_MIN = 15;

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lavacar';

const registerSchema = z.object({
  lavacarName: text(80).pipe(z.string().min(2)),
  ownerName: text(100).pipe(z.string().min(2)),
  email: z.string().email().max(160).transform((s) => s.toLowerCase()),
  phone: text(20).default(''),
  cnpj: z.string().max(20).default('').refine((c) => c === '' || validCnpj(c), 'CNPJ inválido'),
  password: z.string().max(128),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'é preciso aceitar o contrato e a política de privacidade' }) }),
  website: z.string().max(0).optional(), // isca anti-robô: pessoas não preenchem
});

authRouter.post('/register', rateLimit('register', 8, 3600, true), async (req, res) => {
  const b = registerSchema.parse(req.body);
  const pw = passwordProblem(b.password);
  if (pw) throw new HttpError(400, pw, 'senha_fraca');
  const hash = await bcrypt.hash(b.password, 12);
  const out = await withTx(async (tx) => {
    if (await one(tx, 'SELECT 1 FROM users WHERE email = $1', [b.email])) throw new HttpError(409, 'Já existe uma conta com esse e-mail. Entre ou recupere o acesso.', 'email_em_uso');
    const slug = `${slugify(b.lavacarName)}-${Math.random().toString(36).slice(2, 6)}`;
    const t = await one<{ id: string }>(tx,
      `INSERT INTO tenants (slug, name, owner_name, email, phone, cnpj, trial_ends_at, settings, terms_version, terms_accepted_at, terms_accepted_ip)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '30 days', $7, $8, now(), $9) RETURNING id`,
      [slug, b.lavacarName, b.ownerName, b.email, onlyDigits(b.phone), onlyDigits(b.cnpj) || null, JSON.stringify(defaultSettings()), TERMS_VERSION, clientIp(req)]);
    const u = await one<{ id: string }>(tx, `INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id`, [t!.id, b.ownerName, b.email, hash]);
    await seedTenant(tx, t!.id);
    await audit(tx, 'cadastro', { tenantId: t!.id, userId: u!.id, ip: clientIp(req) }, { termsVersion: TERMS_VERSION });
    await enqueue(tx, { tenantId: t!.id, channel: 'email', to: b.email, subject: 'Bem-vindo ao LavaPos — seus 30 dias grátis começaram', topic: 'boas-vindas', dedupeKey: 'boas-vindas',
      body: `Olá, ${b.ownerName.split(' ')[0]}!\n\nSua conta do ${b.lavacarName} está pronta. Você tem 30 dias grátis, sem cartão.\n\nPrimeiros passos (10 minutos):\n1. Confira os preços em Serviços e preços\n2. Ajuste os dias e horários em Configurações\n3. Faça seu primeiro check-in com fotos\n4. Compartilhe seu link de agendamento: ${appUrl()}/l/${slug}\n\nDepois dos 30 dias: R$ 119,00 por mês. Você pode cancelar quando quiser.\n\nImportante: o LavaPos nunca pede sua senha por WhatsApp, SMS ou e-mail.\nDúvidas: suporte@lavapos.com.br` });
    return { token: signToken(u!.id), slug };
  });
  res.status(201).json(out);
});

authRouter.post('/login', rateLimit('login', 20, 900, true), async (req, res) => {
  const { email, password, code } = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(128), code: z.string().max(10).optional() }).parse(req.body);
  const u = await one<{ id: string; tenant_id: string | null; password_hash: string; failed_logins: number; locked_until: Date | null; totp_enabled: boolean; totp_secret: string | null; totp_last_step: number | null }>(pool,
    'SELECT id, tenant_id, password_hash, failed_logins, locked_until, totp_enabled, totp_secret, totp_last_step FROM users WHERE email = $1', [email.toLowerCase()]);
  const ip = clientIp(req);
  if (u?.locked_until && u.locked_until.getTime() > Date.now()) {
    await audit(pool, 'login_bloqueado', { tenantId: u.tenant_id, userId: u.id, ip });
    throw new HttpError(429, `Conta bloqueada por tentativas erradas. Tente de novo em ${LOCK_MIN} minutos ou recupere a senha.`, 'bloqueada');
  }
  const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) {
    if (u) {
      const fails = u.failed_logins + 1;
      await pool.query('UPDATE users SET failed_logins = $2::int, locked_until = CASE WHEN $2::int >= $3::int THEN now() + ($4::text || \' minutes\')::interval ELSE NULL END WHERE id = $1', [u.id, fails, MAX_FAILS, String(LOCK_MIN)]);
      await audit(pool, 'login_falhou', { tenantId: u.tenant_id, userId: u.id, ip }, { tentativas: fails });
    }
    throw new HttpError(401, 'E-mail ou senha incorretos.', 'credenciais');
  }
  // 2 etapas: senha certa mas sem código pede o código (não conta como erro); código errado conta como tentativa
  if (u.totp_enabled && u.totp_secret) {
    if (!code) throw new HttpError(401, 'Digite o código de 6 dígitos do aplicativo autenticador.', 'precisa_2fa');
    const step = verifyTotp(decrypt(u.totp_secret), code.replace(/\s/g, ''), u.totp_last_step);
    if (step === null) {
      const fails = u.failed_logins + 1;
      await pool.query('UPDATE users SET failed_logins = $2::int, locked_until = CASE WHEN $2::int >= $3::int THEN now() + ($4::text || \' minutes\')::interval ELSE NULL END WHERE id = $1', [u.id, fails, MAX_FAILS, String(LOCK_MIN)]);
      await audit(pool, 'login_2fa_falhou', { tenantId: u.tenant_id, userId: u.id, ip });
      throw new HttpError(401, 'Código incorreto ou já usado.', 'codigo_invalido');
    }
    await pool.query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [u.id, step]);
  }
  await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  await audit(pool, 'login', { tenantId: u.tenant_id, userId: u.id, ip });
  res.json({ token: signToken(u.id) });
});

authRouter.get('/me', loadUser, requireUser, async (req: AuthedRequest, res) => {
  const t = req.user!.tenantId
    ? await one(pool, 'SELECT id, slug, name, owner_name, email, phone, cnpj, trial_ends_at, monthly_fee_cents, billing_status, terms_version FROM tenants WHERE id = $1', [req.user!.tenantId])
    : null;
  res.json({ user: req.user, tenant: t && { id: t.id, slug: t.slug, name: t.name, ownerName: t.owner_name, email: t.email, phone: t.phone, cnpj: t.cnpj, trialEndsAt: t.trial_ends_at, monthlyFeeCents: t.monthly_fee_cents, billingStatus: t.billing_status, termsVersion: t.terms_version } });
});

authRouter.post('/change-password', loadUser, requireUser, rateLimit('pw', 10, 900, true), async (req: AuthedRequest, res) => {
  const { current, next } = z.object({ current: z.string().max(128), next: z.string().max(128) }).parse(req.body);
  const pw = passwordProblem(next);
  if (pw) throw new HttpError(400, pw, 'senha_fraca');
  const u = await one<{ password_hash: string }>(pool, 'SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!u || !(await bcrypt.compare(current, u.password_hash))) throw new HttpError(401, 'Senha atual incorreta.', 'credenciais');
  await pool.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [req.user!.id, await bcrypt.hash(next, 12)]);
  await audit(pool, 'senha_trocada', { tenantId: req.user!.tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json({ ok: true, token: signToken(req.user!.id) }); // as outras sessões deixam de valer
});

// ---- Verificação em 2 etapas
authRouter.get('/2fa', loadUser, requireUser, async (req: AuthedRequest, res) => {
  const u = await one<{ totp_enabled: boolean }>(pool, 'SELECT totp_enabled FROM users WHERE id = $1', [req.user!.id]);
  res.json({ enabled: !!u?.totp_enabled });
});

authRouter.post('/2fa/setup', loadUser, requireUser, rateLimit('2fa', 10, 900, true), async (req: AuthedRequest, res) => {
  const secret = newSecret();
  await pool.query('UPDATE users SET totp_secret = $2, totp_enabled = false, totp_last_step = NULL WHERE id = $1', [req.user!.id, encrypt(secret)]);
  res.json({ secret, otpauth: otpauthUrl(secret, req.user!.email) }); // mostrado uma única vez, para cadastrar no aplicativo autenticador
});

authRouter.post('/2fa/enable', loadUser, requireUser, rateLimit('2fa', 10, 900, true), async (req: AuthedRequest, res) => {
  const { code } = z.object({ code: z.string().max(10) }).parse(req.body);
  const u = await one<{ totp_secret: string | null }>(pool, 'SELECT totp_secret FROM users WHERE id = $1', [req.user!.id]);
  const step = u?.totp_secret ? verifyTotp(decrypt(u.totp_secret), code.replace(/\s/g, '')) : null;
  if (step === null) throw new HttpError(400, 'Código incorreto. Confira o aplicativo e tente de novo.', 'codigo_invalido');
  await pool.query('UPDATE users SET totp_enabled = true, totp_last_step = $2 WHERE id = $1', [req.user!.id, step]);
  await audit(pool, '2fa_ligado', { tenantId: req.user!.tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json({ ok: true });
});

authRouter.post('/2fa/disable', loadUser, requireUser, rateLimit('2fa', 10, 900, true), async (req: AuthedRequest, res) => {
  const { password, code } = z.object({ password: z.string().max(128), code: z.string().max(10) }).parse(req.body);
  const u = await one<{ password_hash: string; totp_secret: string | null; totp_enabled: boolean }>(pool, 'SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = $1', [req.user!.id]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Senha incorreta.', 'credenciais');
  if (u.totp_enabled && u.totp_secret && verifyTotp(decrypt(u.totp_secret), code.replace(/\s/g, '')) === null) throw new HttpError(400, 'Código incorreto.', 'codigo_invalido');
  await pool.query('UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_last_step = NULL WHERE id = $1', [req.user!.id]);
  await audit(pool, '2fa_desligado', { tenantId: req.user!.tenantId, userId: req.user!.id, ip: clientIp(req) });
  res.json({ ok: true });
});
