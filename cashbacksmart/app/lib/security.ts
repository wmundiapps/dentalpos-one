/**
 * Segurança: limites de tentativas, 2FA (TOTP), criptografia de segredos e captcha (Cloudflare Turnstile).
 */
import crypto from 'crypto';
import { one, q, UserError } from './db';

// ---------- Limite de tentativas (janela fixa, guardado no banco: funciona com vários servidores) ----------
export async function rateLimit(key: string, limit: number, windowSec: number, message?: string) {
  const now = Date.now();
  const start = new Date(Math.floor(now / (windowSec * 1000)) * windowSec * 1000);
  const r = await one<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1,$2,1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`,
    [key, start],
  );
  if (r!.count > limit) {
    const wait = Math.ceil((start.getTime() + windowSec * 1000 - now) / 60000);
    throw new UserError(message || `Muitas tentativas. Tente de novo em ${wait} minuto${wait > 1 ? 's' : ''}.`);
  }
  // limpeza ocasional
  if (Math.random() < 0.01) await q(`delete from rate_limits where window_start < now() - interval '1 day'`);
}

// ---------- Criptografia de segredos (AES-256-GCM) ----------
function encKey() {
  return crypto.createHash('sha256').update('enc:' + (process.env.AUTH_SECRET || 'dev-secret-change-me')).digest();
}
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// ---------- TOTP (RFC 6238), compatível com Google Authenticator, Authy, 1Password ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function newTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}
export function totpAt(secret: string, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}
export function verifyTotp(secret: string, code: string, time = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  for (const drift of [-1, 0, 1]) {
    const exp = totpAt(secret, time + drift * 30000);
    if (crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c))) return true;
  }
  return false;
}
export function otpauthUri(secret: string, email: string) {
  return `otpauth://totp/Cashbacksmart:${encodeURIComponent(email)}?secret=${secret}&issuer=Cashbacksmart&algorithm=SHA1&digits=6&period=30`;
}
export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const s = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

// ---------- Captcha (Cloudflare Turnstile). Sem chave configurada, não bloqueia. ----------
export function captchaSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || '';
}
export async function verifyCaptcha(token: string | null | undefined, ip?: string | null, fetchFn: typeof fetch = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) throw new UserError('Confirme que você não é um robô.');
  const r = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!j.success) throw new UserError('Não conseguimos confirmar que você não é um robô. Tente de novo.');
  return true;
}

// ---------- Senhas fracas ----------
const COMMON = new Set(['12345678', '123456789', '1234567890', 'senha123', 'senha1234', 'password', 'qwerty123', '11111111', '00000000', 'abcd1234', 'cashbacksmart', 'mudar123', 'brasil123']);
export function passwordProblem(pw: string, email?: string) {
  if (!pw || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres';
  if (pw.length > 128) return 'A senha pode ter no máximo 128 caracteres';
  if (COMMON.has(pw.toLowerCase())) return 'Essa senha é muito comum. Escolha outra.';
  if (/^(.)\1+$/.test(pw)) return 'Essa senha é muito fácil de adivinhar.';
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'A senha não pode conter seu e-mail.';
  return null;
}
