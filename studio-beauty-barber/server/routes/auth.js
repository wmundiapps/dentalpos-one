import { db } from '../db.js';
import { profileOf } from '../brand.js';
import { cfg } from '../config.js';
import { HttpError, validate, uid, nowIso, normalizePhone } from '../util.js';
import {
  hashPassword, verifyPassword, checkPasswordPolicy, rateLimit, newTotpSecret, verifyTotp, totpUri, sha256,
  verifyTurnstile, newToken,
} from '../security.js';
import { auth, createSession, destroySession, audit } from '../auth.js';
import { DEFAULT_HOURS } from '../availability.js';
import { upsertLead } from '../domain.js';
import { sendPlatformEmail } from '../integrations/channels.js';

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'salao';

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
const MAX_FAILS = 5;
const LOCK_MIN = 15;

export default function register(r) {
  // ---------- Esqueci a senha: link por e-mail válido por 30 minutos, uso único ----------
  r.post('/api/auth/forgot', async (ctx) => {
    rateLimit(`forgot-ip:${ctx.ip}`, 8, 3600_000);
    const d = validate(ctx.body, { email: 'email' });
    rateLimit(`forgot:${d.email}`, 3, 3600_000);
    const generic = { ok: true, message: 'Se este e-mail estiver cadastrado, enviamos o link para criar uma nova senha. Confira também o spam.' };
    const u = await db.get('SELECT * FROM users WHERE email = ? AND active = 1', [d.email]);
    if (!u) return generic; // mesma resposta: ninguém descobre quem tem conta
    const token = newToken(32);
    await db.run('INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at) VALUES (?,?,?,?,?,?)',
      [uid(), u.id, sha256(token), new Date(Date.now() + 30 * 60_000).toISOString(), ctx.ip, nowIso()]);
    const link = `${cfg.appUrl}/#/redefinir/${token}`;
    try {
      const res = await sendPlatformEmail(u.email, 'Crie uma nova senha no Studio Beauty Barber',
        `Olá, ${u.name.split(' ')[0]}!\n\nRecebemos um pedido para criar uma nova senha. Use o link abaixo em até 30 minutos:\n\n${link}\n\nSe não foi você, ignore este e-mail: a sua senha continua a mesma.\n\nStudio Beauty Barber · WMundi Technologies`);
      if (res?.status !== 'sent') console.warn('[senha] e-mail de redefinição não enviado:', res?.status, res?.error || '');
    } catch (e) { console.error('[senha] falha ao enviar e-mail:', e.message); }
    ctx.user = u; ctx.salon = { id: u.salon_id };
    await audit(ctx, 'password_reset_requested', 'user', u.id);
    return generic;
  });

  r.post('/api/auth/reset', async (ctx) => {
    rateLimit(`reset:${ctx.ip}`, 10, 3600_000);
    const d = validate(ctx.body, { token: 'str:20:100', password: 'str:1:200' });
    checkPasswordPolicy(d.password);
    const row = await db.get('SELECT * FROM password_resets WHERE token_hash = ?', [sha256(d.token)]);
    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) throw new HttpError(400, 'Este link venceu ou já foi usado. Peça um novo em "Esqueci minha senha".');
    const claim = await db.run('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL', [nowIso(), row.id]);
    if (!claim.changes) throw new HttpError(400, 'Este link venceu ou já foi usado. Peça um novo em "Esqueci minha senha".');
    const hash = await hashPassword(d.password);
    await db.run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', [hash, row.user_id]);
    await db.run('DELETE FROM sessions WHERE user_id = ?', [row.user_id]); // desconecta todos os aparelhos
    const u = await db.get('SELECT * FROM users WHERE id = ?', [row.user_id]);
    ctx.user = u; ctx.salon = { id: u.salon_id };
    await audit(ctx, 'password_reset_done', 'user', u.id);
    return { ok: true };
  });

  // ---------- Cadastro self-service (teste grátis) ----------
  r.post('/api/auth/signup', async (ctx) => {
    rateLimit(`signup:${ctx.ip}`, 5, 3600_000);
    if (!(await verifyTurnstile(ctx.body?.turnstile, ctx.ip))) throw new HttpError(400, 'Falha na verificação anti-robô. Tente novamente.');
    const d = validate(ctx.body, {
      salon_name: 'str:2:80', owner_name: 'str:2:80', email: 'email', password: 'str:1:200', phone: 'phone',
      city: 'str?:0:80', terms: 'bool',
    });
    if (!d.terms) throw new HttpError(422, 'Aceite os Termos de Uso e a Política de Privacidade para continuar.');
    checkPasswordPolicy(d.password);
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', [d.email])) throw new HttpError(409, 'Este e-mail já está cadastrado. Tente entrar.');

    const salonId = uid(), userId = uid();
    const slug = `${slugify(d.salon_name)}-${uid().slice(0, 4)}`;
    const trialEnds = new Date(Date.now() + cfg.trialDays * 86400_000).toISOString();
    const hash = await hashPassword(d.password);
    await db.tx(async (t) => {
      await t.run(
        `INSERT INTO salons (id, slug, name, phone, email, city, hours_json, brand_json, plan, status, trial_ends_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [salonId, slug, d.salon_name, d.phone, d.email, d.city, JSON.stringify(DEFAULT_HOURS),
          JSON.stringify({ automations: { reminders: true, birthday: false, reactivation: false } }), 'smart', 'trial', trialEnds, nowIso()]);
      await t.run('INSERT INTO users (id, salon_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)',
        [userId, salonId, d.owner_name, d.email, hash, 'owner', nowIso()]);
    });
    ctx.user = { id: userId }; ctx.salon = { id: salonId };
    await audit(ctx, 'signup', 'salon', salonId);
    await createSession(ctx, { id: userId, salon_id: salonId });

    // Funil comercial da própria plataforma: todo cadastro vira lead no HQ.
    const hq = await db.get('SELECT id FROM salons WHERE slug = ?', [cfg.hqSlug]);
    if (hq) await upsertLead(hq.id, { name: d.owner_name, phone: d.phone, email: d.email, company: d.salon_name, city: d.city, source: 'cadastro-teste', consent: true, consentIp: ctx.ip, notes: `Teste grátis até ${trialEnds.slice(0, 10)}` }).catch(() => {});
    sendPlatformEmail(d.email, 'Bem-vindo ao Studio Beauty Barber',
      `Olá, ${d.owner_name}! Seu teste grátis de ${cfg.trialDays} dias começou.\nAcesse: ${cfg.appUrl}\n\nDica: cadastre seus serviços e profissionais e compartilhe a sua página de agendamento: ${cfg.appUrl}/s/${slug}`).catch(() => {});
    return { ok: true, salon: { id: salonId, slug, name: d.salon_name }, trial_ends_at: trialEnds };
  });

  // ---------- Login (com bloqueio por tentativas e 2FA) ----------
  r.post('/api/auth/login', async (ctx) => {
    rateLimit(`login-ip:${ctx.ip}`, 20, 15 * 60_000);
    const email = String(ctx.body?.email || '').trim().toLowerCase().slice(0, 254);
    const password = String(ctx.body?.password || '').slice(0, 200);
    if (!email || !password) throw new HttpError(422, 'Informe e-mail e senha.');
    rateLimit(`login-email:${sha256(email)}`, 10, 15 * 60_000);

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (user?.locked_until && user.locked_until > nowIso()) {
      throw new HttpError(423, `Conta bloqueada temporariamente por tentativas inválidas. Tente novamente em alguns minutos.`);
    }
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || !user.active) {
      if (user) {
        const fails = user.failed_logins + 1;
        const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null;
        await db.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [lock ? 0 : fails, lock, user.id]);
        ctx.user = user; ctx.salon = { id: user.salon_id };
        await audit(ctx, lock ? 'login_locked' : 'login_failed', 'user', user.id);
      }
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    if (user.totp_enabled) {
      const code = ctx.body?.code;
      if (!code) return { need_2fa: true };
      rateLimit(`totp:${user.id}`, 8, 15 * 60_000);
      if (!verifyTotp(user.totp_secret, code)) throw new HttpError(401, 'Código de verificação inválido.');
    }
    await db.run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [nowIso(), user.id]);
    await createSession(ctx, user);
    ctx.user = user; ctx.salon = { id: user.salon_id };
    await audit(ctx, 'login', 'user', user.id);
    return { ok: true };
  });

  r.post('/api/auth/logout', auth(), async (ctx) => {
    await audit(ctx, 'logout', 'user', ctx.user.id);
    await destroySession(ctx);
    return { ok: true };
  });

  r.get('/api/auth/me', auth(), async (ctx) => ({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, totp_enabled: !!ctx.user.totp_enabled },
    salon: {
      id: ctx.salon.id, slug: ctx.salon.slug, name: ctx.salon.name, plan: ctx.salon.plan, status: ctx.salon.status, lifetime: !!ctx.salon.lifetime, is_hq: ctx.salon.slug === cfg.hqSlug,
      trial_ends_at: ctx.salon.trial_ends_at, timezone: ctx.salon.timezone,
      logo: ctx.salon.logo_path ? `/uploads/${ctx.salon.logo_path}` : null, brand: profileOf(ctx.salon),
    },
  }));

  r.post('/api/auth/change-password', auth(), async (ctx) => {
    rateLimit(`chpw:${ctx.user.id}`, 5, 15 * 60_000);
    const { current, next } = ctx.body || {};
    const u = await db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
    if (!(await verifyPassword(String(current || ''), u.password_hash))) throw new HttpError(401, 'Senha atual incorreta.');
    checkPasswordPolicy(next);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), u.id]);
    await db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [u.id, ctx.sessionId]); // encerra os outros dispositivos
    await audit(ctx, 'password_changed', 'user', u.id);
    return { ok: true };
  });

  // ---------- 2FA (TOTP: Google Authenticator, Authy, 1Password...) ----------
  r.post('/api/auth/2fa/setup', auth(), async (ctx) => {
    const secret = newTotpSecret();
    await db.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret, ctx.user.id]);
    return { secret, uri: totpUri(secret, ctx.user.email) };
  });
  r.post('/api/auth/2fa/enable', auth(), async (ctx) => {
    rateLimit(`totp-en:${ctx.user.id}`, 8, 15 * 60_000);
    const u = await db.get('SELECT totp_secret FROM users WHERE id = ?', [ctx.user.id]);
    if (!u?.totp_secret || !verifyTotp(u.totp_secret, ctx.body?.code)) throw new HttpError(422, 'Código inválido. Confira o horário do celular e tente de novo.');
    await db.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [ctx.user.id]);
    await audit(ctx, '2fa_enabled', 'user', ctx.user.id);
    return { ok: true };
  });
  r.post('/api/auth/2fa/disable', auth(), async (ctx) => {
    rateLimit(`totp-dis:${ctx.user.id}`, 5, 15 * 60_000);
    const u = await db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
    if (!(await verifyPassword(String(ctx.body?.password || ''), u.password_hash)) || !verifyTotp(u.totp_secret, ctx.body?.code)) {
      throw new HttpError(401, 'Senha ou código incorretos.');
    }
    await db.run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [u.id]);
    await audit(ctx, '2fa_disabled', 'user', u.id);
    return { ok: true };
  });

  // ---------- Sessões ativas e auditoria ----------
  r.get('/api/auth/sessions', auth(), async (ctx) => {
    const rows = await db.all('SELECT id, ip, ua, created_at, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC', [ctx.user.id]);
    return { sessions: rows.map((s) => ({ ...s, current: s.id === ctx.sessionId })) };
  });
  r.delete('/api/auth/sessions/:id', auth(), async (ctx) => {
    await db.run('DELETE FROM sessions WHERE id = ? AND user_id = ?', [ctx.params.id, ctx.user.id]);
    return { ok: true };
  });
  r.get('/api/audit', auth('manager'), async (ctx) => ({
    events: await db.all('SELECT a.action, a.entity, a.ip, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.salon_id = ? ORDER BY a.created_at DESC LIMIT 100', [ctx.salon.id]),
  }));

  // ---------- Usuários do salão ----------
  r.get('/api/users', auth('manager'), async (ctx) => ({
    users: await db.all('SELECT id, name, email, role, staff_id, active, totp_enabled, last_login_at FROM users WHERE salon_id = ? ORDER BY name', [ctx.salon.id]),
  }));
  r.post('/api/users', auth('owner'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', email: 'email', password: 'str:1:200', role: 'enum:manager,reception,staff', staff_id: 'str?:0:60' });
    checkPasswordPolicy(d.password);
    if (await db.get('SELECT 1 AS x FROM users WHERE email = ?', [d.email])) throw new HttpError(409, 'Este e-mail já está em uso.');
    const id = uid();
    await db.run('INSERT INTO users (id, salon_id, name, email, password_hash, role, staff_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, ctx.salon.id, d.name, d.email, await hashPassword(d.password), d.role, d.staff_id, nowIso()]);
    await audit(ctx, 'user_created', 'user', id, { role: d.role });
    return { id };
  });
  r.patch('/api/users/:id', auth('owner'), async (ctx) => {
    const d = validate(ctx.body, { role: 'enum?:manager,reception,staff', active: 'bool?' });
    const u = await db.get('SELECT * FROM users WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!u) throw new HttpError(404, 'Usuário não encontrado.');
    if (u.role === 'owner') throw new HttpError(422, 'O proprietário não pode ser alterado aqui.');
    await db.run('UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ?', [d.role, d.active, u.id]);
    if (d.active === 0) await db.run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
    await audit(ctx, 'user_updated', 'user', u.id, d);
    return { ok: true };
  });
}
