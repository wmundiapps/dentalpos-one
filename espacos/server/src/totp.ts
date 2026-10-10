// Verificação em 2 etapas por aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…).
// TOTP (RFC 6238) sem biblioteca externa: segredo de 160 bits cifrado no banco, código de 6 dígitos a cada 30 s,
// tolerância de ±30 s, anti-reuso (o mesmo código não vale duas vezes) e 8 códigos reserva de uso único (só hash).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { id, one, pool, rows } from './db.js';
import { HttpError } from './auth.js';
import { decryptDocument, encryptDocument } from './secure.js';
import { securityEvent } from './security.js';
import type { User } from '../../shared/types.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Código de 6 dígitos para um passo de 30 s (HOTP com SHA-1, como os aplicativos usam). */
export function totpAt(secret: Buffer, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const stepOf = (now = Date.now()) => Math.floor(now / 30000);

/** Passo do código aceito (janela de ±1), ou null. */
export function matchStep(secret: Buffer, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, '');
  if (c.length !== 6) return null;
  const cur = stepOf(now);
  for (const s of [cur, cur - 1, cur + 1]) {
    if (crypto.timingSafeEqual(Buffer.from(totpAt(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

const ISSUER = 'SpaceHour';
export const otpauthUri = (email: string, secretB32: string) =>
  `otpauth://totp/${encodeURIComponent(`${ISSUER}:${email}`)}?secret=${secretB32}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30`;

type Row = { totp_secret: Buffer | null; totp_pending_secret: Buffer | null; totp_enabled_at: Date | null; totp_last_step: string | null };
const load = (userId: string) => one<Row>(pool, 'SELECT totp_secret, totp_pending_secret, totp_enabled_at, totp_last_step FROM users WHERE id = $1', [userId]);

export async function totpEnabled(userId: string) {
  return !!(await load(userId))?.totp_enabled_at;
}

export async function totpStatus(user: User) {
  const r = await load(user.id);
  const left = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM totp_backup_codes WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  return { enabled: !!r?.totp_enabled_at, since: r?.totp_enabled_at ?? null, backupCodesLeft: left?.n ?? 0 };
}

/** Passo 1: gera o segredo (ainda não vale) e devolve para o QR code. */
export async function startTotpSetup(user: User) {
  const secret = crypto.randomBytes(20);
  await pool.query('UPDATE users SET totp_pending_secret = $2 WHERE id = $1', [user.id, encryptDocument(secret)]);
  const b32 = base32(secret);
  return { secret: b32.replace(/(.{4})/g, '$1 ').trim(), uri: otpauthUri(user.email, b32) };
}

function newBackupCode() {
  const raw = crypto.randomBytes(5).toString('hex'); // 10 caracteres
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

async function issueBackupCodes(userId: string) {
  await pool.query('DELETE FROM totp_backup_codes WHERE user_id = $1', [userId]);
  const codes = Array.from({ length: 8 }, newBackupCode);
  for (const c of codes) {
    await pool.query('INSERT INTO totp_backup_codes (id, user_id, code_hash) VALUES ($1,$2,$3)', [id('tbc'), userId, await bcrypt.hash(c.replace('-', ''), 8)]);
  }
  return codes;
}

/** Passo 2: a pessoa digita o código do aplicativo; ativa e devolve os 8 códigos reserva (mostrados uma vez). */
export async function confirmTotpSetup(user: User, code: string, ip?: string) {
  const r = await load(user.id);
  if (!r?.totp_pending_secret) throw new HttpError(400, 'totp_setup_missing');
  const step = matchStep(decryptDocument(r.totp_pending_secret), code);
  if (step === null) throw new HttpError(400, 'invalid_code', { left: 5 });
  await pool.query('UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled_at = now(), totp_last_step = $2 WHERE id = $1', [user.id, step]);
  await securityEvent('totp_on', { userId: user.id, ip });
  return { backupCodes: await issueBackupCodes(user.id) };
}

/** Confere código do aplicativo (sem reuso) ou código reserva (uso único). */
export async function verifyTotpOrBackup(userId: string, code: string) {
  const r = await load(userId);
  if (!r?.totp_secret || !r.totp_enabled_at) return false;
  const digits = code.replace(/\D/g, '');
  if (digits.length === 6 && /^\s*[\d\s]+\s*$/.test(code)) {
    const step = matchStep(decryptDocument(r.totp_secret), digits);
    if (step === null || (r.totp_last_step !== null && step <= Number(r.totp_last_step))) return false;
    // Trava contra uso simultâneo do mesmo código
    const upd = await pool.query('UPDATE users SET totp_last_step = $2 WHERE id = $1 AND (totp_last_step IS NULL OR totp_last_step < $2)', [userId, step]);
    return upd.rowCount === 1;
  }
  const clean = code.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (clean.length !== 10) return false;
  for (const b of await rows<{ id: string; code_hash: string }>(pool, 'SELECT id, code_hash FROM totp_backup_codes WHERE user_id = $1 AND used_at IS NULL', [userId])) {
    if (await bcrypt.compare(clean, b.code_hash)) {
      const upd = await pool.query('UPDATE totp_backup_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL', [b.id]);
      if (upd.rowCount === 1) { await securityEvent('totp_backup_used', { userId }); return true; }
    }
  }
  return false;
}

/** Desligar ou gerar novos códigos reserva exige senha + código atual. */
async function assertSecondFactor(user: User, password: string, code: string) {
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'invalid_credentials');
  if (!(await verifyTotpOrBackup(user.id, code))) throw new HttpError(400, 'invalid_code', { left: 0 });
}

export async function disableTotp(user: User, password: string, code: string, ip?: string) {
  await assertSecondFactor(user, password, code);
  await pool.query('UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = $1', [user.id]);
  await pool.query('DELETE FROM totp_backup_codes WHERE user_id = $1', [user.id]);
  await securityEvent('totp_off', { userId: user.id, ip });
}

export async function regenerateBackupCodes(user: User, password: string, code: string) {
  await assertSecondFactor(user, password, code);
  return { backupCodes: await issueBackupCodes(user.id) };
}
