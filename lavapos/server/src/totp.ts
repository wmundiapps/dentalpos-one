// TOTP (RFC 6238): código de 6 dígitos que muda a cada 30 s, compatível com Google Authenticator, Authy, 1Password etc.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const newSecret = () => { const b = crypto.randomBytes(20); let bits = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); let out = ''; for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };

function b32decode(s: string): Buffer {
  let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) throw new Error('base32'); bits += i.toString(2).padStart(5, '0'); }
  const bytes: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes);
}

export function codeAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Aceita o código atual e o anterior/seguinte (tolerância de relógio). Devolve o passo usado, para impedir reuso. */
export function verifyTotp(secret: string, code: string, lastStep?: number | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = Math.floor(now / 30000);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const a = Buffer.from(codeAt(secret, step)), b = Buffer.from(code);
    if (crypto.timingSafeEqual(a, b)) return step;
  }
  return null;
}

export const otpauthUrl = (secret: string, account: string) => `otpauth://totp/LavaPos:${encodeURIComponent(account)}?secret=${secret}&issuer=LavaPos&algorithm=SHA1&digits=6&period=30`;
