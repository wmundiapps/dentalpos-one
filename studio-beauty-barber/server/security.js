// Camada de segurança: senhas, sessões, 2FA (TOTP), criptografia de segredos,
// rate limit, verificação de assinatura de webhooks, anti-phishing e antivírus (ClamAV).
import {
  scrypt as _scrypt, randomBytes, createHash, createHmac, timingSafeEqual,
  createCipheriv, createDecipheriv, hkdfSync,
} from 'node:crypto';
import net from 'node:net';
import { promisify } from 'node:util';
import { cfg } from './config.js';
import { HttpError } from './util.js';

const scrypt = promisify(_scrypt);

// ---------- Senhas (scrypt) ----------
const COMMON = new Set(['123456', '12345678', '123456789', '1234567890', 'password', 'senha123', 'qwerty123', 'admin123', 'mudar123', 'brasil123']);

export function checkPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new HttpError(422, 'A senha precisa ter pelo menos 10 caracteres.');
  if (pw.length > 200) throw new HttpError(422, 'Senha muito longa.');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(422, 'Use letras e números na senha.');
  if (COMMON.has(pw.toLowerCase())) throw new HttpError(422, 'Senha muito comum. Escolha outra.');
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const key = await scrypt(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(pw, salt, expected.length, { N: +N, r: +r, p: +p });
    return timingSafeEqual(key, expected);
  } catch { return false; }
}

// ---------- Tokens e sessões ----------
export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const hmac = (key, data, enc = 'hex') => createHmac('sha256', key).update(data).digest(enc);

export function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) {
    // gasta o mesmo tempo para não vazar o tamanho
    timingSafeEqual(A, A);
    return false;
  }
  return timingSafeEqual(A, B);
}

// ---------- Criptografia de segredos (chaves de API dos salões) ----------
const encKey = Buffer.from(hkdfSync('sha256', cfg.encKey, 'sbb-salt', 'sbb-secrets-v1', 32));

export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(blob) {
  const [v, iv, tag, ct] = String(blob).split(':');
  if (v !== 'v1') throw new Error('formato de segredo desconhecido');
  const d = createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

// ---------- TOTP (RFC 6238) para 2FA ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function base32Decode(str) {
  let bits = '';
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('base32 inválido');
    bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function newTotpSecret() { return base32Encode(randomBytes(20)); }

export function totpCode(secretB32, atMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function verifyTotp(secretB32, code, atMs = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  for (const w of [-1, 0, 1]) {
    if (safeEqual(totpCode(secretB32, atMs + w * 30000), c)) return true;
  }
  return false;
}

export function totpUri(secretB32, email) {
  return `otpauth://totp/Studio%20Beauty%20Barber:${encodeURIComponent(email)}?secret=${secretB32}&issuer=Studio%20Beauty%20Barber&digits=6&period=30`;
}

// ---------- Rate limit em memória (use Redis ao escalar para várias instâncias) ----------
const buckets = new Map();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    throw new HttpError(429, `Muitas tentativas. Tente novamente em ${retry}s.`, { retryAfter: retry });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

export function resetRateLimits() { buckets.clear(); }

// ---------- Assinaturas de webhooks ----------
export function verifyMetaSignature(rawBody, header, appSecret = cfg.meta.appSecret) {
  if (!appSecret) return false;
  const m = /^sha256=([a-f0-9]{64})$/i.exec(String(header || ''));
  if (!m) return false;
  return safeEqual(hmac(appSecret, rawBody), m[1].toLowerCase());
}

export function verifyStripeSignature(rawBody, header, secret = cfg.stripe.webhookSecret, toleranceSec = 300) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = hmac(secret, `${t}.${rawBody}`);
  return String(header).split(',').filter((kv) => kv.startsWith('v1=')).some((kv) => safeEqual(kv.slice(3), expected));
}

// ---------- Anti-phishing ----------
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'ow.ly', 'buff.ly', 'rebrand.ly', 'l.wl.co']);
const SAFE_HOSTS = ['wa.me', 'whatsapp.com', 'instagram.com', 'facebook.com', 'google.com', 'goo.gl/maps', 'maps.app.goo.gl', 'g.page', 'studiobeautybarber.com'];

export function extractUrls(text) {
  return String(text || '').match(/\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi) || [];
}

export function analyzeUrl(raw, allowHosts = []) {
  const reasons = [];
  let u;
  try { u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, reasons: ['URL malformada'] }; }
  const host = u.hostname.toLowerCase();
  if (u.username || u.password) reasons.push('URL com usuário/senha embutidos');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) reasons.push('endereço IP em vez de domínio');
  if (host.split('.').some((l) => l.startsWith('xn--'))) reasons.push('domínio com caracteres disfarçados (punycode)');
  if (SHORTENERS.has(host)) reasons.push('encurtador de link');
  if (/[^\x00-\x7F]/.test(raw)) reasons.push('caracteres não-ASCII no endereço');
  if (u.protocol !== 'https:') reasons.push('sem HTTPS');
  const tldRisky = /\.(zip|mov|top|xyz|click|country|gq|tk|cf|ml)$/.test(host);
  if (tldRisky) reasons.push('extensão de domínio de alto risco');
  const allowed = [...SAFE_HOSTS, ...allowHosts].some((h) => host === h || host.endsWith('.' + h));
  return { ok: reasons.length === 0, allowed, reasons, host };
}

// Mensagens de saída (campanhas/robô): só links de domínios permitidos e sem sinais suspeitos.
export function assertSafeOutbound(text, allowHosts = []) {
  for (const url of extractUrls(text)) {
    const a = analyzeUrl(url, allowHosts);
    if (!a.ok) throw new HttpError(422, `Link bloqueado pelo anti-phishing (${a.reasons.join(', ')}): ${url}`);
    if (!a.allowed) throw new HttpError(422, `Link de domínio não autorizado (${a.host}). Cadastre o domínio em Segurança > Domínios permitidos.`);
  }
}

// Mensagens de entrada: não bloqueia, apenas sinaliza para o atendente e impede o robô de repetir o link.
export function scanInbound(text) {
  const flags = [];
  for (const url of extractUrls(text)) {
    const a = analyzeUrl(url);
    if (!a.ok) flags.push({ url, reasons: a.reasons });
  }
  if (/(senha|c[oó]digo de verifica[cç][aã]o|token|cvv|cart[aã]o).{0,40}(envie|mande|informe|passe)/i.test(text)) {
    flags.push({ url: null, reasons: ['pedido de dado sensível (possível golpe)'] });
  }
  return flags;
}

// ---------- Antivírus (ClamAV via clamd INSTREAM) + validação de arquivo ----------
const MAGIC = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), ext: 'png' },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, ext: 'jpg' },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', ext: 'webp' },
];

export function sniffImage(buf) {
  return MAGIC.find((m) => m.test(buf)) || null;
}

export function scanWithClamav(buf, { host = cfg.clamav.host, port = cfg.clamav.port, timeoutMs = 8000 } = {}) {
  if (!host) return Promise.resolve({ scanned: false, clean: true });
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let resp = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new HttpError(503, 'Antivírus indisponível (timeout).')); }, timeoutMs);
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 65536) {
        const chunk = buf.subarray(i, i + 65536);
        const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
        sock.write(len); sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => { resp += d.toString(); });
    sock.on('end', () => {
      clearTimeout(timer);
      if (/OK/.test(resp) && !/FOUND/.test(resp)) resolve({ scanned: true, clean: true });
      else if (/FOUND/.test(resp)) resolve({ scanned: true, clean: false, detail: resp.trim() });
      else reject(new HttpError(503, 'Antivírus retornou resposta inesperada.'));
    });
    sock.on('error', (e) => { clearTimeout(timer); reject(new HttpError(503, 'Antivírus indisponível: ' + e.message)); });
  });
}

// ---------- Cabeçalhos de segurança ----------
export function securityHeaders(extra = {}) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'X-Permitted-Cross-Domain-Policies': 'none',
    ...extra,
  };
}

// ---------- Cloudflare Turnstile (CAPTCHA) nos formulários públicos ----------
export async function verifyTurnstile(token, ip) {
  if (!cfg.turnstile.secret) return true; // desligado até configurar a chave
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: cfg.turnstile.secret, response: token, remoteip: ip || '' }),
    });
    const d = await r.json();
    return d.success === true;
  } catch { return false; }
}
