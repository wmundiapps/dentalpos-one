// "Esqueci minha senha": link de uso único por e-mail, válido por 1 hora.
// A resposta ao pedido é sempre a mesma (não revela se o e-mail tem conta).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { one, pool, token } from './db.js';
import { HttpError } from './auth.js';
import { SUPPORT_EMAIL, sendMail } from './mailer.js';
import { getUser, getUserByEmail } from './repo.js';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:5173';
const TTL_MINUTES = 60;
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function requestPasswordReset(email: string) {
  const user = await getUserByEmail(pool, email.trim());
  if (!user || user.banned) return; // mesma resposta para quem não tem conta
  const t = token();
  // no máximo um e-mail por minuto por conta
  const ok = await one(pool,
    `UPDATE users SET password_reset_hash = $2, password_reset_sent_at = now()
     WHERE id = $1 AND (password_reset_sent_at IS NULL OR password_reset_sent_at < now() - interval '1 minute') RETURNING id`,
    [user.id, hash(t)]);
  if (!ok) return;
  const url = `${APP_URL()}/redefinir-senha?token=${t}`;
  const first = user.name.split(' ')[0];
  await sendMail({
    to: user.email,
    subject: 'SpaceHour — redefinir sua senha / reset your password',
    text: `Olá, ${first}!\n\nRecebemos um pedido para redefinir a senha da sua conta. Para criar uma nova senha, abra o link:\n${url}\n\nO link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.\n\nTo reset your password, open the link above (valid for 1 hour).\n\n— SpaceHour · ${SUPPORT_EMAIL()}`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
<h2 style="color:#0f766e;margin:0 0 16px">SpaceHour</h2>
<p style="font-size:16px;line-height:1.5">Olá, ${escape(first)}!<br><br>Recebemos um pedido para redefinir a senha da sua conta.</p>
<p><a href="${url}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Criar nova senha / Reset password</a></p>
<p style="font-size:13px;color:#6b7280">O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.<br>Valid for 1 hour. If it wasn't you, ignore this email.</p>
<p style="font-size:12px;color:#6b7280">SpaceHour · <a href="mailto:${SUPPORT_EMAIL()}">${SUPPORT_EMAIL()}</a></p></div>`,
  });
}

/** Troca a senha pelo link. Também confirma o e-mail (a pessoa provou ter acesso a ele). */
export async function resetPassword(t: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const r = await one<{ id: string }>(pool,
    `UPDATE users SET password_hash = $2, password_reset_hash = NULL, password_changed_at = now(),
       email_verified_at = coalesce(email_verified_at, now())
     WHERE password_reset_hash = $1 AND password_reset_sent_at > now() - make_interval(mins => $3) AND NOT banned
     RETURNING id`, [hash(t), passwordHash, TTL_MINUTES]);
  if (!r) throw new HttpError(400, 'invalid_or_expired_token');
  await pool.query('UPDATE listings SET active = true, pending_email = false WHERE host_id = $1 AND pending_email', [r.id]);
  return (await getUser(pool, r.id))!;
}
