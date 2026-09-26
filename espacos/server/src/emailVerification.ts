// Confirmação de e-mail: link de uso único enviado no cadastro (válido por 48 h).
// Sem e-mail confirmado a conta não reserva, não anuncia, não envia registro
// profissional e não é promovida por ADMIN_EMAILS.
import crypto from 'node:crypto';
import { one, pool, token } from './db.js';
import { HttpError } from './auth.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';
import type { User } from '../../shared/types.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const TTL_HOURS = 48;
const RESEND_SECONDS = 60;
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export async function sendVerificationEmail(user: User, { throttle = false } = {}) {
  if (user.emailVerifiedAt) return;
  const t = token();
  const updated = await one(pool,
    `UPDATE users SET email_verify_token_hash = $2, email_verify_sent_at = now()
     WHERE id = $1 AND ($3::boolean IS FALSE OR email_verify_sent_at IS NULL OR email_verify_sent_at < now() - make_interval(secs => $4))
     RETURNING id`, [user.id, hash(t), throttle, RESEND_SECONDS]);
  if (!updated) throw new HttpError(429, 'verification_recently_sent');
  const url = `${APP_URL()}/confirmar-email?token=${t}`;
  const first = user.name.split(' ')[0];
  await sendMail({
    to: user.email,
    subject: 'SpaceHour — confirme seu e-mail / confirm your email',
    text: `Olá, ${first}!\n\nConfirme seu e-mail para começar a usar o SpaceHour:\n${url}\n\nO link vale por ${TTL_HOURS} horas. Se você não criou esta conta, ignore este e-mail.\n\nConfirm your email to start using SpaceHour (link valid for ${TTL_HOURS} hours).\n\n— SpaceHour · ${SUPPORT_EMAIL()}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
<p style="font-size:16px;line-height:1.5">Olá, ${escape(first)}!<br><br>Confirme seu e-mail para começar a usar o SpaceHour.</p>
<p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar e-mail / Confirm email</a></p>
<p style="font-size:13px;color:#6b7280">O link vale por ${TTL_HOURS} horas. Se você não criou esta conta, ignore este e-mail.<br>Link valid for ${TTL_HOURS} hours. If you didn't sign up, ignore this email.</p>
<p style="font-size:12px;color:#6b7280">SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p></div>`,
  });
}

/** Confirma pelo token do link. Devolve o id do usuário confirmado. */
export async function confirmEmail(t: string): Promise<string> {
  const r = await one<{ id: string }>(pool,
    `UPDATE users SET email_verified_at = now(), email_verify_token_hash = NULL
     WHERE email_verify_token_hash = $1 AND email_verify_sent_at > now() - make_interval(hours => $2)
     RETURNING id`, [hash(t), TTL_HOURS]);
  if (!r) throw new HttpError(400, 'invalid_or_expired_token');
  return r.id;
}

export function assertEmailVerified(user: User) {
  if (!user.emailVerifiedAt) throw new HttpError(403, 'email_not_verified');
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
