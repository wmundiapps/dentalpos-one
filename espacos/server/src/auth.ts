import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool, type Db } from './db.js';
import { getUser, insertStrike, updateUser, userRatings } from './repo.js';
import type { PublicUser, User } from '../../shared/types.js';
import { STRIKE_RULES } from '../../shared/rules.js';

const SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET é obrigatório em produção');
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, public params?: unknown) {
    super(code);
  }
}

export function signToken(user: User): string {
  return jwt.sign({ sub: user.id }, SECRET, { expiresIn: '7d' });
}

export interface AuthedRequest extends Request<Record<string, string>> {
  user?: User;
}

async function loadUser(req: AuthedRequest) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;
  let sub: string;
  try {
    sub = (jwt.verify(header.slice(7), SECRET) as { sub: string }).sub;
  } catch {
    return; // token inválido: segue como anônimo
  }
  req.user = await getUser(pool, sub);
  if (req.user) await promoteConfiguredAdmin(req.user);
}

/**
 * Administradores definidos por variável de ambiente (ADMIN_EMAILS, separados por vírgula).
 * Use só e-mails de contas que já existem: o cadastro não confirma o e-mail.
 */
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

async function promoteConfiguredAdmin(user: User) {
  if (user.roles.includes('admin') || !adminEmails().includes(user.email.toLowerCase())) return;
  user.roles.push('admin');
  await updateUser(pool, user);
  console.log(`[admin] ${user.email} promovido a administrador (ADMIN_EMAILS)`);
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  loadUser(req).then(() => next(), next);
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  loadUser(req).then(() => {
    if (!req.user) return next(new HttpError(401, 'unauthorized'));
    if (req.user.banned) return next(new HttpError(403, 'account_banned'));
    next();
  }, next);
}

export function assertCanTransact(user: User) {
  if (user.banned) throw new HttpError(403, 'account_banned');
  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    throw new HttpError(403, 'account_suspended', { until: user.suspendedUntil });
  }
}

export function activeStrikes(user: User, now = new Date()) {
  const since = now.getTime() - STRIKE_RULES.windowDays * 86400000;
  return user.strikes.filter((s) => new Date(s.at).getTime() >= since);
}

/** Registra advertência e aplica suspensão/exclusão conforme STRIKE_RULES. */
export async function addStrike(db: Db, user: User, reason: string, incidentId?: string, severe = false) {
  const now = new Date();
  const strike = { at: now.toISOString(), reason, incidentId };
  user.strikes.push(strike);
  await insertStrike(db, user.id, strike);
  const count = activeStrikes(user, now).length;
  if (severe || count >= STRIKE_RULES.banAt) {
    user.banned = true;
  } else if (count >= STRIKE_RULES.suspendAt) {
    user.suspendedUntil = new Date(now.getTime() + STRIKE_RULES.suspensionDays * 86400000).toISOString();
  }
  await updateUser(db, user);
}

export async function toPublicUser(db: Db, u: User): Promise<PublicUser> {
  return {
    id: u.id, name: u.name, countryCode: u.countryCode, createdAt: u.createdAt, identityVerified: u.identityVerified, bio: u.bio,
    professionalLicenseVerified: !!u.professionalLicense?.verified,
    ...(await userRatings(db, u.id)),
  };
}

export function toSelf(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, activeStrikes: activeStrikes(u).length };
}
