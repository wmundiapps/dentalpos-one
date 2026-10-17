// Senhas (scrypt) e sessão assinada em cookie HttpOnly.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { parseCookies, fail } from './http.js';
import { token, sha256 } from './util.js';

const scryptAsync = promisify(scrypt);
const COOKIE = 'as_session';
const SESSION_DAYS = 7;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

export function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use letras e números na senha.';
  return null;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new Error('SESSION_SECRET ausente ou curto demais');
  return s;
}

const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function sessionCookie(user) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = Buffer.from(JSON.stringify({ u: user.id, r: user.role, exp })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readSession(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export async function currentUser(sql, req) {
  const s = readSession(req);
  if (!s) return null;
  const [u] = await sql`select id, email, name, role, dentist_id, active, totp_enabled_at from users where id = ${s.u}`;
  return u && u.active ? u : null;
}

export async function requireUser(sql, req, role) {
  const u = await currentUser(sql, req);
  if (!u) fail(401, 'Faça login para continuar.');
  if (role && u.role !== role) fail(403, 'Acesso não permitido para este perfil.');
  return u;
}

// Link de definição de senha (primeiro acesso do dentista ou "esqueci a senha")
export async function createPasswordToken(sql, userId, hours = 72) {
  const t = token(32);
  await sql`insert into password_tokens (token_hash, user_id, expires_at)
            values (${sha256(t)}, ${userId}, now() + ${hours + ' hours'}::interval)`;
  return t;
}

export async function consumePasswordToken(sql, t) {
  const [row] = await sql`update password_tokens set used_at = now()
    where token_hash = ${sha256(String(t || ''))} and used_at is null and expires_at > now()
    returning user_id`;
  return row?.user_id || null;
}
