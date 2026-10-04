// Proteções do SpaceHour: limite de tentativas, verificação em duas etapas por
// código no e-mail, filtro de conteúdo impróprio (texto e fotos) e registro de
// eventos de segurança. Env opcional: MODERATION_AI_MODEL (padrão claude-haiku-4-5);
// sem ANTHROPIC_API_KEY as fotos passam só pelo filtro de formato.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { id, one, pool } from './db.js';
import { HttpError, isAdminEmail } from './auth.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';
import type { User } from '../../shared/types.js';

// ───────────── Registro de eventos ─────────────
export async function securityEvent(kind: string, data: { userId?: string; ip?: string; detail?: string } = {}) {
  await pool.query('INSERT INTO security_events (id, kind, user_id, ip, detail) VALUES ($1,$2,$3,$4,$5)',
    [id('sec'), kind, data.userId ?? null, data.ip ?? null, data.detail?.slice(0, 500) ?? null]).catch(() => undefined);
}

// ───────────── Limite de tentativas ─────────────
/** Quantas tentativas a chave teve na janela. */
async function recent(key: string, windowSecs: number) {
  const r = await one<{ n: number }>(pool,
    'SELECT count(*)::int AS n FROM rate_events WHERE key = $1 AND created_at > now() - make_interval(secs => $2)', [key, windowSecs]);
  return r?.n ?? 0;
}
export async function hit(key: string) {
  await pool.query('INSERT INTO rate_events (key) VALUES ($1)', [key]);
}
/** Bloqueia (429) se a chave passou do limite; senão conta mais uma tentativa. */
export async function limit(key: string, max: number, windowSecs: number, count = true) {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return; // só nos testes automáticos
  if (await recent(key, windowSecs) >= max) throw new HttpError(429, 'too_many_attempts', { minutes: Math.ceil(windowSecs / 60) });
  if (count) await hit(key);
}
export const LOGIN_WINDOW = 15 * 60;
export const LOGIN_MAX_PER_EMAIL = 8; // senhas erradas por conta em 15 min
export const LOGIN_MAX_PER_IP = 30; // senhas erradas por IP em 15 min

/** Antes de conferir a senha: conta ou IP com erros demais ficam bloqueados por 15 minutos. */
export async function assertLoginAllowed(email: string, ip?: string) {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return;
  await limit(`login:email:${email.trim().toLowerCase()}`, LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW, false);
  if (ip) await limit(`login:ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW, false);
}
export async function loginFailed(email: string, ip?: string) {
  await hit(`login:email:${email.trim().toLowerCase()}`);
  if (ip) await hit(`login:ip:${ip}`);
  await securityEvent('login_failed', { ip, detail: email.slice(0, 200) });
}

/** Limpa registros antigos (rotina periódica). */
export async function pruneSecurity() {
  await pool.query("DELETE FROM rate_events WHERE created_at < now() - interval '1 day'");
  await pool.query("DELETE FROM login_challenges WHERE created_at < now() - interval '1 day'");
  await pool.query("DELETE FROM security_events WHERE created_at < now() - interval '180 days'");
}

// ───────────── Verificação em duas etapas (código no e-mail) ─────────────
const CHALLENGE_MINUTES = 10;
export const CHALLENGE_MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const codeHash = (challengeId: string, code: string) => crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex');

/** Administradores sempre; demais contas se ativaram em Perfil. */
export async function twoFactorRequired(user: User) {
  if (user.roles.includes('admin') || (user.emailVerifiedAt && isAdminEmail(user.email))) return true;
  const r = await one<{ on: boolean }>(pool, 'SELECT two_factor_enabled AS on FROM users WHERE id = $1', [user.id]);
  return !!r?.on;
}

export async function twoFactorStatus(user: User) {
  const r = await one<{ on: boolean }>(pool, 'SELECT two_factor_enabled AS on FROM users WHERE id = $1', [user.id]);
  const forced = user.roles.includes('admin');
  return { enabled: forced || !!r?.on, forced };
}

export async function setTwoFactor(user: User, enabled: boolean) {
  await pool.query('UPDATE users SET two_factor_enabled = $2 WHERE id = $1', [user.id, enabled]);
  await securityEvent(enabled ? 'two_factor_on' : 'two_factor_off', { userId: user.id });
}

const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_m, a: string, b: string) => `${a}•••${b}`);

async function sendLoginCode(user: User, challengeId: string, origin: { ip?: string; userAgent?: string }) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await pool.query('UPDATE login_challenges SET code_hash = $2, attempts = 0, created_at = now(), expires_at = now() + make_interval(mins => $3) WHERE id = $1',
    [challengeId, codeHash(challengeId, code), CHALLENGE_MINUTES]);
  const first = escapeHtml(user.name.split(' ')[0]);
  const where = origin.ip ? ` (IP ${origin.ip})` : '';
  await sendMail({
    to: user.email,
    subject: `Código de acesso SpaceHour: ${code}`,
    text: `Olá, ${user.name.split(' ')[0]}!\n\nAlguém (provavelmente você) está entrando na sua conta SpaceHour${where}.\n\nSeu código de acesso: ${code}\nVale por ${CHALLENGE_MINUTES} minutos.\n\nSe não foi você, NÃO informe este código a ninguém e troque sua senha em "Esqueci minha senha".\n\n— SpaceHour · ${SUPPORT_EMAIL()}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
<p style="font-size:16px;line-height:1.5">Olá, ${first}!<br><br>Alguém (provavelmente você) está entrando na sua conta SpaceHour${escapeHtml(where)}.</p>
<p style="font-size:14px;color:#374151;margin:0">Seu código de acesso:</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:6px 0 16px;color:#111827">${code}</p>
<p style="font-size:14px;color:#374151">Vale por ${CHALLENGE_MINUTES} minutos.</p>
<p style="font-size:13px;color:#b91c1c"><strong>Se não foi você</strong>, não informe este código a ninguém e troque sua senha em "Esqueci minha senha".</p>
<p style="font-size:12px;color:#6b7280">SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p></div>`,
  });
}

/** Senha conferida: cria o desafio e manda o código por e-mail. */
export async function startLoginChallenge(user: User, origin: { ip?: string; userAgent?: string }) {
  const challengeId = id('lc');
  await pool.query(
    `INSERT INTO login_challenges (id, user_id, code_hash, ip, user_agent, expires_at)
     VALUES ($1,$2,'',$3,$4, now() + make_interval(mins => $5))`,
    [challengeId, user.id, origin.ip ?? null, origin.userAgent?.slice(0, 300) ?? null, CHALLENGE_MINUTES]);
  await sendLoginCode(user, challengeId, origin);
  return { twoFactor: true as const, challengeId, email: maskEmail(user.email) };
}

export async function resendLoginChallenge(challengeId: string, getUser: (id: string) => Promise<User | undefined>, origin: { ip?: string; userAgent?: string }) {
  const c = await one<{ user_id: string; recent: boolean }>(pool,
    `SELECT user_id, created_at > now() - make_interval(secs => $2) AS recent FROM login_challenges
      WHERE id = $1 AND used_at IS NULL AND created_at > now() - interval '1 hour'`, [challengeId, RESEND_SECONDS]);
  if (!c) throw new HttpError(400, 'login_code_expired');
  if (c.recent) throw new HttpError(429, 'verification_recently_sent');
  const user = await getUser(c.user_id);
  if (!user) throw new HttpError(400, 'login_code_expired');
  await sendLoginCode(user, challengeId, origin);
}

/** Confere o código; devolve o id do usuário. */
export async function verifyLoginChallenge(challengeId: string, code: string, ip?: string) {
  const c = await one<{ user_id: string; code_hash: string; attempts: number; fresh: boolean }>(pool,
    `SELECT user_id, code_hash, attempts, expires_at > now() AS fresh FROM login_challenges WHERE id = $1 AND used_at IS NULL`, [challengeId]);
  if (!c || !c.fresh || c.attempts >= CHALLENGE_MAX_ATTEMPTS) throw new HttpError(400, 'login_code_expired');
  const ok = crypto.timingSafeEqual(Buffer.from(c.code_hash.padEnd(64, '0')), Buffer.from(codeHash(challengeId, code.replace(/\D/g, ''))));
  if (!ok) {
    await pool.query('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1', [challengeId]);
    await securityEvent('login_code_failed', { userId: c.user_id, ip });
    throw new HttpError(400, 'invalid_code', { left: CHALLENGE_MAX_ATTEMPTS - c.attempts - 1 });
  }
  await pool.query('UPDATE login_challenges SET used_at = now() WHERE id = $1', [challengeId]);
  return c.user_id;
}

// ───────────── Conteúdo impróprio: texto ─────────────
// Termos de conteúdo sexual explícito, golpes e domínios adultos/encurtadores
// usados para disfarçar links. Busca por palavra inteira, sem acentos.
const BLOCKED_TERMS = [
  'porno', 'pornografia', 'porn', 'xxx', 'sexo explicito', 'nudes', 'putaria', 'onlyfans', 'privacy.com.br', 'acompanhante de luxo',
  'garota de programa', 'garoto de programa', 'camgirl', 'webcam sexy', 'hentai', 'pedofilia', 'cp infantil',
];
const BLOCKED_DOMAINS = [
  'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn', 'onlyfans', 'chaturbate', 'brazzers', 'erome', 'fansly',
  'bit.ly', 'tinyurl', 'cutt.ly', 'encurtador', 'is.gd', 'rebrand.ly', 'shorturl',
];
const DANGEROUS_FILE = /\.(exe|scr|bat|cmd|msi|apk|jar|vbs|ps1|dll|com|pif|hta)(\b|$)/i;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Motivo da recusa, ou null se o texto está ok. */
export function textProblem(text: string): string | null {
  const t = fold(text);
  for (const term of BLOCKED_TERMS) if (new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t)) return 'adult';
  const urls = t.match(/\b((https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(com|net|org|xyz|ly|gd|me|io|br|site|online|top|click)(\.[a-z]{2})?\/[^\s]*)/g) ?? [];
  for (const u of urls) {
    if (BLOCKED_DOMAINS.some((d) => u.includes(d))) return 'link';
    if (DANGEROUS_FILE.test(u)) return 'file';
  }
  if (/<\s*script|javascript:|data:text\/html|on(error|load)\s*=/.test(t)) return 'code';
  return null;
}

/** Recusa (422) textos com conteúdo impróprio e registra a tentativa. */
export async function assertCleanText(fields: Array<string | undefined | null>, ctx: { userId?: string; ip?: string; where: string }) {
  for (const f of fields) {
    if (!f) continue;
    const reason = textProblem(f);
    if (reason) {
      await securityEvent('content_blocked', { userId: ctx.userId, ip: ctx.ip, detail: `${ctx.where}:${reason}: ${f.slice(0, 200)}` });
      throw new HttpError(422, 'content_not_allowed', { reason });
    }
  }
}

// ───────────── Conteúdo impróprio: fotos (IA) ─────────────
const MODERATION_MODEL = () => process.env.MODERATION_AI_MODEL ?? 'claude-haiku-4-5';
const AI_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const AI_MAX_BYTES = 3_700_000; // limite de 5 MB do modelo, já em base64

let client: Anthropic | undefined;
const ai = () => (process.env.ANTHROPIC_API_KEY ? (client ??= new Anthropic()) : undefined);

/**
 * Confere se a foto é adequada para um anúncio (sem nudez, sexo, violência explícita,
 * drogas ou armas em destaque). Falha da IA não bloqueia o envio (fica registrada).
 */
export async function assertCleanImage(data: Buffer, mime: string, ctx: { userId?: string; ip?: string }) {
  const c = ai();
  if (!c || !AI_IMAGE_TYPES.has(mime) || data.length > AI_MAX_BYTES) return;
  let verdict = '';
  try {
    const res = await c.messages.create({
      model: MODERATION_MODEL(),
      max_tokens: 20,
      system: 'Você modera fotos enviadas para anúncios de consultórios, salas e espaços profissionais. Responda só com uma palavra: OK se a foto é adequada, ou BLOQUEAR se mostra nudez, conteúdo sexual, violência explícita, sangue, uso de drogas, armas em destaque ou símbolos de ódio. Fotos de salas, móveis, equipamentos médicos/odontológicos, fachadas, pessoas vestidas e logotipos são OK.',
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: data.toString('base64') } },
        { type: 'text', text: 'Esta foto é adequada? Responda OK ou BLOQUEAR.' },
      ] }],
    });
    verdict = res.stop_reason === 'refusal' ? 'BLOQUEAR'
      : res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim().toUpperCase();
  } catch (e) {
    await securityEvent('image_moderation_error', { userId: ctx.userId, detail: (e as Error).message });
    return;
  }
  if (verdict.startsWith('BLOQ')) {
    await securityEvent('image_blocked', { userId: ctx.userId, ip: ctx.ip });
    throw new HttpError(422, 'image_not_allowed');
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
