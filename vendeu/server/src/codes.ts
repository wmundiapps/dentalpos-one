// Códigos de 6 dígitos (e-mail, telefone, redefinição de senha). Guardados só como hash, 10 minutos, 5 tentativas.
import crypto from 'node:crypto';
import { id, one, pool } from './db.js';
import { HttpError } from './http.js';
import { hmac } from './secure.js';
import { sendMail, sendSms } from './mailer.js';

export type Channel = 'email' | 'phone' | 'reset';
const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export async function issueCode(userId: string, channel: Channel, target: string): Promise<void> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await pool.query('UPDATE verification_codes SET used_at = now() WHERE user_id = $1 AND channel = $2 AND used_at IS NULL', [userId, channel]);
  await pool.query('INSERT INTO verification_codes (id, user_id, channel, target, code_hash, expires_at) VALUES ($1,$2,$3,$4,$5, now() + make_interval(mins => $6))',
    [id('cod'), userId, channel, target, hmac(`${userId}:${channel}:${code}`), TTL_MIN]);
  if (channel === 'phone') await sendSms(target, `Vendeu: seu código de verificação é ${code}. Nunca compartilhe este código.`);
  else await sendMail({
    to: target,
    subject: channel === 'email' ? 'Seu código de verificação do Vendeu' : 'Redefinição de senha do Vendeu',
    text: `Seu código é ${code}. Ele vale por ${TTL_MIN} minutos.\nNunca compartilhe este código com ninguém — nem com quem diz ser do Vendeu.`,
  });
}

export async function checkCode(userId: string, channel: Channel, code: string): Promise<string> {
  const row = await one(pool, `SELECT * FROM verification_codes WHERE user_id = $1 AND channel = $2 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [userId, channel]);
  if (!row) throw new HttpError(400, 'code_expired');
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hmac(`${userId}:${channel}:${code}`)));
  if (!ok) {
    await pool.query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw new HttpError(400, 'code_invalid');
  }
  await pool.query('UPDATE verification_codes SET used_at = now() WHERE id = $1', [row.id]);
  return row.target as string;
}
