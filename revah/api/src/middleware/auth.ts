import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Tenant, User } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { sha256 } from '../lib/crypto'
import { HttpError } from '../lib/errors'

export interface AuthedRequest extends Request {
  user: User
  tenant: Tenant
  viaApiKey?: boolean
  rawBody?: Buffer
}

export interface TokenClaims {
  sub: string
  tid: string
  role: string
  emb?: boolean // sessão aberta dentro do DentalPos One (modo embutido)
}

export function signSession(user: Pick<User, 'id' | 'tenantId' | 'role'>, embedded = false) {
  if (!config.jwtSecret) throw new Error('JWT_SECRET não configurado.')
  const claims: TokenClaims = { sub: user.id, tid: user.tenantId, role: user.role, ...(embedded ? { emb: true } : {}) }
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'], issuer: 'revah' })
}

function bearer(req: Request) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearer(req)
    if (!token) throw new HttpError(401, 'Faça login para continuar.', 'UNAUTHENTICATED')
    let claims: TokenClaims
    try {
      claims = jwt.verify(token, config.jwtSecret, { issuer: 'revah' }) as TokenClaims
    } catch {
      throw new HttpError(401, 'Sessão expirada. Faça login novamente.', 'UNAUTHENTICATED')
    }
    const user = await prisma.user.findUnique({ where: { id: claims.sub }, include: { tenant: true } })
    if (!user || !user.isActive || user.tenantId !== claims.tid) throw new HttpError(401, 'Usuário inválido.', 'UNAUTHENTICATED')
    const { tenant, ...plainUser } = user
    ;(req as AuthedRequest).user = plainUser as User
    ;(req as AuthedRequest).tenant = tenant
    next()
  } catch (e) {
    next(e)
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = (req as AuthedRequest).user?.role
    if (!r || !roles.includes(r)) return next(new HttpError(403, 'Seu perfil não tem permissão para esta ação.', 'FORBIDDEN'))
    next()
  }
}

export function requireSuperadmin(req: Request, _res: Response, next: NextFunction) {
  const email = (req as AuthedRequest).user?.email?.toLowerCase()
  if (!email || !config.superadminEmails.includes(email)) return next(new HttpError(403, 'Acesso restrito à WMundi.', 'FORBIDDEN'))
  next()
}

// Chave de API por empresa: "rvh_<prefixo>_<segredo>" em Authorization: Bearer ou X-Api-Key.
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = String(req.headers['x-api-key'] || bearer(req) || '')
    const m = /^rvh_([a-z0-9]{8})_([A-Za-z0-9_-]{20,})$/.exec(raw)
    if (!m) throw new HttpError(401, 'Chave de API ausente ou inválida.', 'UNAUTHENTICATED')
    const key = await prisma.apiKey.findUnique({ where: { prefix: m[1] }, include: { tenant: true } })
    if (!key || key.revokedAt || key.hash !== sha256(raw)) throw new HttpError(401, 'Chave de API inválida.', 'UNAUTHENTICATED')
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    const owner = await prisma.user.findFirst({ where: { tenantId: key.tenantId, role: 'OWNER' }, orderBy: { createdAt: 'asc' } })
    ;(req as AuthedRequest).tenant = key.tenant
    ;(req as AuthedRequest).user = (owner || { id: 'api', tenantId: key.tenantId, role: 'ADMIN', email: 'api', name: 'API' }) as User
    ;(req as AuthedRequest).viaApiKey = true
    next()
  } catch (e) {
    next(e)
  }
}
