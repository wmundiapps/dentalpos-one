import { NextFunction, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { httpError, limitar, resolverTenantPublico } from '../apoio/common'
import { hashIp, hashUa, redigirLog } from './mascara'

export const MODULO = 'lgpd'
export { httpError, limitar, resolverTenantPublico }
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

export function ipDe(req: Request): string {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
}
export const hashesDe = (req: Request, tenantId: string) => ({ ipHash: hashIp(ipDe(req), tenantId), uaHash: hashUa(req.get('user-agent') || '', tenantId) })

/** Gestão LGPD: administração/reitoria OU o usuário designado como encarregado (DPO) ativo da instituição. */
export async function ehGestorLgpd(req: AuthenticatedRequest): Promise<boolean> {
  if (!req.user) return false
  if (SUPER.includes(String(req.user.role).toUpperCase())) return true
  const dpo = await prisma.lgpDpo.findFirst({ where: { tenantId: req.user.tenantId, userId: req.user.id, ativo: true }, select: { id: true } })
  return !!dpo
}

export function exigirGestorLgpd(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  ehGestorLgpd(req).then((ok) => (ok ? next() : res.status(403).json({ error: 'Acesso restrito ao encarregado (DPO) e à administração.' }))).catch(next)
}

/** Registra na trilha de auditoria LGPD (append-only). Nunca lança erro. */
export async function trilha(p: { tenantId: string; refType: string; refId: string; acao: string; userId?: string | null; ator?: string; detalhe?: unknown }) {
  try {
    await prisma.lgpTrilha.create({
      data: { tenantId: p.tenantId, refType: p.refType, refId: p.refId, acao: p.acao, userId: p.userId ?? null, ator: p.ator, detalhe: p.detalhe === undefined ? undefined : (redigirLog(p.detalhe) as any) },
    })
  } catch (e: any) {
    console.error('[lgpd-trilha]', String(e?.message || e).slice(0, 200))
  }
}

export async function proximoSeq(tenantId: string, chave: string): Promise<number> {
  const r = await prisma.lgpContador.upsert({
    where: { tenantId_chave: { tenantId, chave } },
    create: { tenantId, chave, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return r.valor
}

export async function instituicaoPublica(tenantId: string) {
  const i = await prisma.eduInstitution.findFirst({ where: { tenantId }, select: { nome: true, nomeFantasia: true, sigla: true, cnpj: true, email: true, telefone: true, site: true, endereco: true, cidade: true, uf: true, mantenedora: true } })
  return i ?? { nome: 'Instituição', nomeFantasia: null, sigla: null, cnpj: null, email: null, telefone: null, site: null, endereco: null, cidade: null, uf: null, mantenedora: null }
}

export async function tenantPublico(req: Request): Promise<string> {
  const t = await resolverTenantPublico(String(req.params.tenant))
  if (!t) throw httpError(404, 'Instituição não encontrada.')
  return t
}

/** Limite por IP em rotas públicas (memória do processo; complementa o rate limit global da API). */
export function limitePublico(req: Request, chave: string, max: number, janelaMs: number) {
  if (!limitar(`lgpd:${chave}:${ipDe(req)}`, max, janelaMs)) throw httpError(429, 'Muitas requisições em pouco tempo. Tente novamente em alguns minutos.')
}

export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D+/g, '')
export function formatarCpf(d: string) { return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d }

export function cpfValido(v: unknown): boolean {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
