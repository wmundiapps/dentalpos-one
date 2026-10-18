// Sessões, papéis (RBAC), CSRF e auditoria.
import { db } from './db.js';
import { cfg } from './config.js';
import { HttpError, nowIso, uid } from './util.js';
import { newToken, sha256 } from './security.js';
import { parseCookies, cookieString } from './http.js';

export const SESSION_COOKIE = 'sbb_session';
const ROLE_RANK = { staff: 1, reception: 2, manager: 3, owner: 4 };

export async function createSession(ctx, user) {
  const token = newToken(32);
  const expires = new Date(Date.now() + cfg.sessionDays * 86400_000).toISOString();
  await db.run(
    'INSERT INTO sessions (id, user_id, salon_id, expires_at, ip, ua, created_at) VALUES (?,?,?,?,?,?,?)',
    [sha256(token), user.id, user.salon_id, expires, ctx.ip, String(ctx.req.headers['user-agent'] || '').slice(0, 200), nowIso()],
  );
  ctx.setCookie(cookieString(SESSION_COOKIE, token, { maxAgeSec: cfg.sessionDays * 86400 }));
  return token;
}

export async function loadSession(ctx) {
  const token = parseCookies(ctx.req.headers.cookie || '')[SESSION_COOKIE];
  if (!token) return null;
  const row = await db.get(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.salon_id, u.name, u.email, u.role, u.staff_id, u.active, u.totp_enabled
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [sha256(token)]);
  if (!row || !row.active) return null;
  if (row.expires_at < nowIso()) {
    await db.run('DELETE FROM sessions WHERE id = ?', [row.session_id]);
    return null;
  }
  const salon = await db.get('SELECT * FROM salons WHERE id = ?', [row.salon_id]);
  if (!salon) return null;
  return { user: row, salon, sessionId: row.session_id };
}

export async function destroySession(ctx) {
  const token = parseCookies(ctx.req.headers.cookie || '')[SESSION_COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  ctx.setCookie(cookieString(SESSION_COOKIE, '', { maxAgeSec: 0 }));
}

// Middleware: exige login (e opcionalmente um papel mínimo). Também aplica CSRF em métodos que alteram dados.
export function auth(minRole = 'staff') {
  return async (ctx) => {
    const s = await loadSession(ctx);
    if (!s) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.req.method)) {
      if (ctx.req.headers['x-requested-with'] !== 'sbb') throw new HttpError(403, 'Requisição bloqueada (CSRF).');
      const origin = ctx.req.headers.origin;
      if (origin) {
        const ok = [cfg.appUrl, cfg.baseUrl].some((u) => { try { return new URL(u).origin === origin; } catch { return false; } })
          || origin === `http://${ctx.req.headers.host}` || origin === `https://${ctx.req.headers.host}`;
        if (!ok) throw new HttpError(403, 'Origem não autorizada.');
      }
    }
    if ((ROLE_RANK[s.user.role] || 0) < (ROLE_RANK[minRole] || 99)) throw new HttpError(403, 'Você não tem permissão para isso.');
    if (s.salon.status === 'suspended') throw new HttpError(402, 'Conta suspensa. Regularize a assinatura.');
    ctx.user = s.user;
    ctx.salon = s.salon;
    ctx.sessionId = s.sessionId;
  };
}

export async function audit(ctx, action, entity = null, entityId = null, meta = null) {
  try {
    await db.run(
      'INSERT INTO audit_log (id, salon_id, user_id, action, entity, entity_id, ip, meta_json, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [uid(), ctx.salon?.id ?? null, ctx.user?.id ?? null, action, entity, entityId, ctx.ip ?? null, meta ? JSON.stringify(meta).slice(0, 2000) : null, nowIso()],
    );
  } catch { /* auditoria nunca derruba a requisição */ }
}
