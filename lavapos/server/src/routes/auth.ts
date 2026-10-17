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
    return { token: signToken(u!.id), slug };
  });
  res.status(201).json(out);
});

authRouter.post('/login', rateLimit('login', 20, 900, true), async (req, res) => {
  const { email, password } = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(128) }).parse(req.body);
  const u = await one<{ id: string; tenant_id: string | null; password_hash: string; failed_logins: number; locked_until: Date | null }>(pool,
    'SELECT id, tenant_id, password_hash, failed_logins, locked_until FROM users WHERE email = $1', [email.toLowerCase()]);
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
