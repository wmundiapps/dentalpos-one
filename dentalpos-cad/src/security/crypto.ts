// Primitivas de segurança (WebCrypto): TOTP (RFC 6238), PBKDF2, AES-GCM, SHA-256.
const enc = new TextEncoder(), dec = new TextDecoder();
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
export const toB64 = (u: Uint8Array): string => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function base32Encode(b: Uint8Array): string {
  let bits = 0, v = 0, out = "";
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(v << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, v = 0; const out: number[] = [];
  for (const ch of clean) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return Uint8Array.from(out);
}

export async function hotp(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const key = await crypto.subtle.importKey("raw", buf(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8); const dv = new DataView(msg);
  dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[19] & 15;
  const code = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
export const totp = (secret: Uint8Array, nowMs = Date.now(), step = 30, digits = 6) => hotp(secret, Math.floor(nowMs / 1000 / step), digits);

/** comparação em tempo (quase) constante */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** aceita o código atual ±1 janela (30 s) e rejeita reutilização do mesmo passo (lastStep) */
export async function verifyTotp(secret: Uint8Array, code: string, nowMs = Date.now(), lastStep = -1): Promise<{ ok: boolean; step: number }> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, step: -1 };
  const cur = Math.floor(nowMs / 30000);
  for (const d of [0, -1, 1]) {
    const step = cur + d;
    if (step <= lastStep) continue;
    if (safeEqual(await hotp(secret, step), clean)) return { ok: true, step };
  }
  return { ok: false, step: -1 };
}
export const otpauthUri = (secretB32: string, account: string, issuer = "DentalPos CAD") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

export async function sha256Hex(s: string | Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", typeof s === "string" ? buf(enc.encode(s)) : buf(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const PBKDF2_ITER = 250_000;
async function baseKey(password: string) { return crypto.subtle.importKey("raw", buf(enc.encode(password)), "PBKDF2", false, ["deriveBits", "deriveKey"]); }
export async function hashPassword(password: string, salt: Uint8Array, iter = PBKDF2_ITER): Promise<string> {
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: buf(salt), iterations: iter, hash: "SHA-256" }, await baseKey(password), 256);
  return toB64(new Uint8Array(bits));
}
export async function deriveAesKey(password: string, salt: Uint8Array, iter = PBKDF2_ITER): Promise<CryptoKey> {
  // sal diferente do usado no hash de verificação: a chave de criptografia não pode ser deduzida do hash armazenado
  const s2 = new Uint8Array([...salt, 0x45, 0x4e, 0x43]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: buf(s2), iterations: iter, hash: "SHA-256" }, await baseKey(password), { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(enc.encode(text))));
  return toB64(iv) + "." + toB64(ct);
}
export async function decryptText(key: CryptoKey, packed: string): Promise<string> {
  const [iv, ct] = packed.split(".");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(iv)) }, key, buf(fromB64(ct))));
}
