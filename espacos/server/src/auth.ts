import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';
import type { PublicUser, User } from '../../shared/types';
import { STRIKE_RULES } from '../../shared/rules';

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

export interface AuthedRequest extends Request {
  user?: User;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), SECRET) as { sub: string };
      req.user = db.users.find((u) => u.id === payload.sub);
    } catch {
      /* token inválido: segue como anônimo */
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  optionalAuth(req, _res, () => {
    if (!req.user) return next(new HttpError(401, 'unauthorized'));
    if (req.user.banned) return next(new HttpError(403, 'account_banned'));
    next();
  });
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

export function addStrike(user: User, reason: string, incidentId?: string, severe = false) {
  const now = new Date();
  user.strikes.push({ at: now.toISOString(), reason, incidentId });
  const count = activeStrikes(user, now).length;
  if (severe || count >= STRIKE_RULES.banAt) {
    user.banned = true;
  } else if (count >= STRIKE_RULES.suspendAt) {
    user.suspendedUntil = new Date(now.getTime() + STRIKE_RULES.suspensionDays * 86400000).toISOString();
  }
}

function avg(nums: number[]) {
  return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : undefined;
}

export function toPublicUser(u: User): PublicUser {
  const asHost = db.reviews.filter((r) => r.visible && r.kind === 'guest_to_listing' && db.listings.find((l) => l.id === r.listingId)?.hostId === u.id);
  const asGuest = db.reviews.filter((r) => r.visible && r.kind === 'host_to_guest' && r.targetUserId === u.id);
  return {
    id: u.id, name: u.name, countryCode: u.countryCode, createdAt: u.createdAt, identityVerified: u.identityVerified, bio: u.bio,
    professionalLicenseVerified: !!u.professionalLicense?.verified,
    ratingAsHost: avg(asHost.map((r) => r.rating)), reviewCountAsHost: asHost.length,
    ratingAsGuest: avg(asGuest.map((r) => r.rating)), reviewCountAsGuest: asGuest.length,
  };
}

export function toSelf(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, activeStrikes: activeStrikes(u).length };
}
