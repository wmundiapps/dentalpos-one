import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, pool } from './db.js';
import { HttpError } from './http.js';

const COOKIE = 'vnd_session';
const secret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (config.isProd) throw new Error('JWT_SECRET ausente');
  return 'vendeu-dev-only-jwt-secret';
};

export interface AuthUser {
  id: string; role: 'user' | 'admin'; accountType: 'comprador' | 'anunciante'; email: string; fullName: string;
  emailVerified: boolean; phoneVerified: boolean; kycStatus: string; feeBlocked: boolean; blocked: boolean; sessionsFrom: number;
}
declare module 'express-serve-static-core' { interface Request { user?: AuthUser } }

export const hashPassword = (p: string) => bcrypt.hash(p, 11);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function startSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId, ts: Date.now() }, secret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 24 * 3600 * 1000, path: '/' });
}
export const endSession = (res: Response) => { res.clearCookie(COOKIE, { path: '/' }); };

async function loadUser(id: string): Promise<AuthUser | null> {
  const u = await one(pool, `SELECT id, role, account_type, email, full_name, email_verified_at, phone_verified_at, kyc_status, fee_blocked_at, blocked_at, anonymized_at, pw_changed_at FROM users WHERE id = $1`, [id]);
  if (!u || u.anonymized_at) return null;
  return {
    id: u.id, role: u.role, accountType: u.account_type, email: u.email, fullName: u.full_name,
    emailVerified: !!u.email_verified_at, phoneVerified: !!u.phone_verified_at, kycStatus: u.kyc_status,
    feeBlocked: !!u.fee_blocked_at, blocked: !!u.blocked_at,
    sessionsFrom: u.pw_changed_at ? new Date(u.pw_changed_at).getTime() : 0,
  };
}

/** Carrega a sessão (se houver). Não bloqueia: use requireAuth nas rotas privadas. */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const p = jwt.verify(token, secret()) as { sub: string; ts?: number };
      const u = await loadUser(p.sub);
      // senha trocada depois da emissão do token = sessão antiga invalidada
      if (u && !u.blocked && (p.ts ?? 0) >= u.sessionsFrom) req.user = u;
    }
  } catch { /* token inválido/expirado = visitante */ }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated'));
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'forbidden'));
  next();
}

/** Proteção contra CSRF: pedidos que alteram dados precisam vir de uma origem conhecida (cookie é SameSite=Lax). */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/api/webhooks/') || req.path.startsWith('/api/cron/')) return next();
  let origin = req.headers.origin as string | undefined;
  if (!origin && req.headers.referer) { try { origin = new URL(req.headers.referer as string).origin; } catch { /* inválido */ } }
  if (origin) {
    if (config.allowedOrigins.includes(origin)) return next();
    return next(new HttpError(403, 'bad_origin'));
  }
  if (req.headers['x-requested-with'] === 'vendeu') return next();
  next(new HttpError(403, 'bad_origin'));
}

export function validPassword(p: string) {
  return p.length >= 8 && p.length <= 100 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
