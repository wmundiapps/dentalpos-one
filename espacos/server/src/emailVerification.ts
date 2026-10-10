// Confirmação de e-mail: link enviado no cadastro (válido por 7 dias). O link do e-mail anterior
// continua valendo após um reenvio, e clicar de novo num link já usado apenas confirma de novo.
// Sem e-mail confirmado a conta não reserva, não anuncia, não envia registro
// profissional e não é promovida por ADMIN_EMAILS.
import crypto from 'node:crypto';
import { one, pool, token } from './db.js';
import { HttpError } from './auth.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';
import type { User } from '../../shared/types.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const TTL_DAYS = 7;
const RESEND_SECONDS = 60;
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const codeHash = (userId: string, code: string) => hash(`${userId}:${code}`);
export const CODE_MAX_ATTEMPTS = 5;
type Origin = { ip?: string; userAgent?: string };

export async function sendVerificationEmail(user: User, { throttle = false, reminder = false } = {}) {
  if (user.emailVerifiedAt) return;
  const t = token();
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const updated = await one(pool,
    `UPDATE users SET email_verify_prev_hash = email_verify_token_hash, email_verify_token_hash = $2, email_verify_sent_at = now(),
       email_verify_code_hash = $5, email_verify_code_attempts = 0
     WHERE id = $1 AND ($3::boolean IS FALSE OR email_verify_sent_at IS NULL OR email_verify_sent_at < now() - make_interval(secs => $4))
     RETURNING id`, [user.id, hash(t), throttle, RESEND_SECONDS, codeHash(user.id, code)]);
  if (!updated) throw new HttpError(429, 'verification_recently_sent');
  const url = `${APP_URL()}/confirmar-email?token=${t}`;
  const first = user.name.split(' ')[0];
  await sendMail({
    to: user.email,
    subject: reminder ? `${first}, falta só confirmar seu e-mail no SpaceHour (código ${code})` : `Seu código SpaceHour: ${code}`,
    text: `Olá, ${first}!\n\n${reminder ? 'Seu cadastro no SpaceHour está quase pronto: falta só confirmar seu e-mail.' : 'Confirme seu e-mail para começar a usar o SpaceHour.'}\n\nSeu código: ${code}\nDigite no site ou no aplicativo, ou toque no link:\n${url}\n\nO link vale por ${TTL_DAYS} dias. Se você não criou esta conta, ignore este e-mail.\n\nConfirm your email to start using SpaceHour (link valid for ${TTL_DAYS} days).\n\n— SpaceHour · ${SUPPORT_EMAIL()}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
<p style="font-size:16px;line-height:1.5">Olá, ${escape(first)}!<br><br>${reminder ? 'Seu cadastro no SpaceHour está quase pronto: falta só confirmar seu e-mail. Sem a confirmação não dá para reservar nem anunciar.' : 'Confirme seu e-mail para começar a usar o SpaceHour.'}</p>
<p style="font-size:14px;color:#374151;margin:0">Seu código / Your code:</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:6px 0 16px;color:#111827">${code}</p>
<p style="font-size:14px;color:#374151">Digite o código no site ou no aplicativo, ou toque no botão:</p>
<p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar e-mail / Confirm email</a></p>
<p style="font-size:13px;color:#6b7280">O link vale por ${TTL_DAYS} dias. Se você não criou esta conta, ignore este e-mail.<br>Link valid for ${TTL_DAYS} days. If you didn't sign up, ignore this email.</p>
<p style="font-size:12px;color:#6b7280">SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p></div>`,
  });
}

/** Confirma pelo token do link (atual ou o do e-mail anterior). Devolve o id do usuário. */
export async function confirmEmail(t: string, origin: Origin = {}): Promise<string> {
  const h = hash(t);
  const u = await one<{ id: string; verified: boolean; fresh: boolean }>(pool,
    `SELECT id, email_verified_at IS NOT NULL AS verified,
            coalesce(email_verify_sent_at > now() - make_interval(days => $2), false) AS fresh
     FROM users WHERE deleted_at IS NULL AND (email_verify_token_hash = $1 OR email_verify_prev_hash = $1)
     ORDER BY (email_verify_token_hash = $1) DESC LIMIT 1`, [h, TTL_DAYS]);
  if (!u) throw new HttpError(400, 'invalid_or_expired_token');
  if (u.verified) return u.id; // link clicado de novo: já está confirmado
  if (!u.fresh) throw new HttpError(400, 'invalid_or_expired_token');
  await markVerified(u.id, origin);
  return u.id;
}

/** Confirma pelo código de 6 dígitos (usuário logado). Até 5 tentativas por código enviado. */
export async function confirmEmailCode(userId: string, code: string, origin: Origin = {}) {
  const u = await one<{ verified: boolean; fresh: boolean; code_hash: string | null; attempts: number }>(pool,
    `SELECT email_verified_at IS NOT NULL AS verified, email_verify_code_hash AS code_hash, email_verify_code_attempts AS attempts,
            coalesce(email_verify_sent_at > now() - make_interval(days => $2), false) AS fresh
       FROM users WHERE id = $1`, [userId, TTL_DAYS]);
  if (!u) throw new HttpError(404, 'user_not_found');
  if (u.verified) return;
  if (!u.code_hash || !u.fresh || u.attempts >= CODE_MAX_ATTEMPTS) throw new HttpError(429, 'code_expired_resend');
  const ok = crypto.timingSafeEqual(Buffer.from(u.code_hash), Buffer.from(codeHash(userId, code.replace(/\D/g, ''))));
  if (!ok) {
    await pool.query('UPDATE users SET email_verify_code_attempts = email_verify_code_attempts + 1 WHERE id = $1', [userId]);
    throw new HttpError(400, 'invalid_code', { left: CODE_MAX_ATTEMPTS - u.attempts - 1 });
  }
  await markVerified(userId, origin);
}

async function markVerified(userId: string, origin: Origin) {
  const done = await one(pool,
    `UPDATE users SET email_verified_at = now(), email_verified_ip = $2, email_verified_user_agent = $3, email_verify_code_hash = NULL
      WHERE id = $1 AND email_verified_at IS NULL RETURNING id`, [userId, origin.ip ?? null, origin.userAgent?.slice(0, 300) ?? null]);
  // Anúncios salvos antes da confirmação entram no ar agora
  if (done) await pool.query('UPDATE listings SET active = true, pending_email = false WHERE host_id = $1 AND pending_email', [userId]);
}

export function assertEmailVerified(user: User) {
  if (!user.emailVerifiedAt) throw new HttpError(403, 'email_not_verified', undefined, { to: '/perfil', label: 'verifyEmail' });
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
