import { Response } from 'express'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'

export { asyncHandler, getTenantId, getUserId, requireRole, audit }
export type Req = AuthenticatedRequest
export const HR = 'HR' as AcademicRole
export const DIA = 86_400_000
export const erro = (status: number, msg: string): never => { throw Object.assign(new Error(msg), { status }) }
export const txt = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max)
export const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
export const data = (v: unknown): Date | undefined => { if (!v) return undefined; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? undefined : d }
export const isSuper = (req: Req) => ['ADMIN', 'OWNER', 'RECTOR', 'BOARD'].includes(String(req.user?.role).toUpperCase())
export const ok = (res: Response, body: unknown, status = 200) => res.status(status).json(body)

/** Aplica só os campos permitidos (com conversão) ao montar o data do Prisma. */
export function pick(b: any, campos: Record<string, 'str' | 'num' | 'bool' | 'date' | 'json'>, parcial = false) {
  const out: any = {}
  for (const [k, t] of Object.entries(campos)) {
    if (b?.[k] === undefined) continue
    const v = b[k]
    out[k] = t === 'str' ? (v === null || v === '' ? null : txt(v, 4000)) : t === 'num' ? (v === null || v === '' ? null : num(v)) : t === 'bool' ? Boolean(v) : t === 'date' ? (data(v) ?? null) : v
  }
  void parcial
  return out
}
