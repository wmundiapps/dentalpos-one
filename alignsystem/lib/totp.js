// Verificação em duas etapas por aplicativo autenticador (TOTP, RFC 6238), sem serviço externo.
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

export function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Devolve o passo de tempo aceito (para impedir reuso do mesmo código) ou null
export function verifyCode(secret, code, lastStep = null, now = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= Number(lastStep)) continue;
    const a = Buffer.from(codeAt(secret, s));
    if (timingSafeEqual(a, Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUrl = (secret, account) =>
  `otpauth://totp/${encodeURIComponent('AlignSystem:' + account)}?secret=${secret}&issuer=AlignSystem&algorithm=SHA1&digits=6&period=30`;

// Códigos de recuperação (uso único), guardados só como hash
export function recoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  return { codes, hashes: codes.map(hashRecovery) };
}
export const hashRecovery = (c) => createHash('sha256').update(String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
