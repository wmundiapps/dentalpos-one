import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { one, pool } from './db.js';
import { HttpError } from './security.js';

const SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-me-dev-only-secret';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET (32+ caracteres) é obrigatório em produção');
}

export interface AuthUser { id: string; tenantId: string | null; role: 'owner' | 'staff' | 'platform'; name: string; email: string }
export interface AuthedRequest extends Request { user?: AuthUser }

/** Sessão curta (12 h) e algoritmo fixo: não aceita token "alg: none" nem outro algoritmo. */
export const signToken = (userId: string) => jwt.sign({ sub: userId }, SECRET, { algorithm: 'HS256', expiresIn: '12h' });

export async function loadUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return next();
    let payload: { sub: string; iat?: number };
    try {
      payload = jwt.verify(h.slice(7), SECRET, { algorithms: ['HS256'] }) as { sub: string; iat?: number };
    } catch { return next(); }
    const u = await one<{ id: string; tenant_id: string | null; role: AuthUser['role']; name: string; email: string; pw: Date }>(pool,
      'SELECT id, tenant_id, role, name, email, password_changed_at AS pw FROM users WHERE id = $1', [payload.sub]);
    // Senha trocada depois deste login: a sessão antiga deixa de valer
    if (u && (payload.iat ?? 0) * 1000 >= new Date(u.pw).getTime() - 5000) {
      req.user = { id: u.id, tenantId: u.tenant_id, role: u.role, name: u.name, email: u.email };
    }
    next();
  } catch (e) { next(e); }
}

export function requireUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Entre para continuar.', 'sem_sessao'));
  next();
}

/** Usuário de um lava-rápido (dono ou equipe). Devolve o tenantId já validado. */
export function tenantOf(req: AuthedRequest): string {
  if (!req.user?.tenantId) throw new HttpError(401, 'Entre para continuar.', 'sem_sessao');
  return req.user.tenantId;
}

export function requireOwner(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'owner') return next(new HttpError(403, 'Só o dono do lava-rápido pode fazer isso.', 'sem_permissao'));
  next();
}

export function requirePlatform(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'platform') return next(new HttpError(403, 'Acesso negado.', 'sem_permissao'));
  next();
}
