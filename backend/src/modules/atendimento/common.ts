import { Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'

export const MOD = 'atendimento'
export { AuthenticatedRequest, Response, asyncHandler, requireRole, pageParams, parseBody, qs, dateISO, audit }

// Quem atende (caixa única): ADMIN/OWNER/RECTOR/BOARD entram automaticamente (requireRole).
export const ATENDE: AcademicRole[] = ['SUPPORT', 'SECRETARY', 'ADMISSIONS', 'FINANCE', 'COORDINATOR', 'STAFF']
// Gestão da central (catálogo, base de conhecimento, IA, modelos, revogação, painel do gestor).
export const GESTAO: AcademicRole[] = ['SUPPORT', 'SECRETARY']
export const ALUNO: AcademicRole[] = ['STUDENT']
const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const isGestor = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role)) || GESTAO.includes(req.user?.role as AcademicRole)

export function fail(status: number, msg: string): never { throw Object.assign(new Error(msg), { status }) }
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)
export function exigirAluno(req: AuthenticatedRequest): string {
  const id = req.user?.studentId
  if (!id) fail(403, 'Usuário não vinculado a um aluno.')
  return id
}

// Contador atômico por tenant+chave.
export async function proximoSeq(tenantId: string, chave: string): Promise<number> {
  const r = await prisma.atdContador.upsert({ where: { tenantId_chave: { tenantId, chave } }, create: { tenantId, chave, valor: 1 }, update: { valor: { increment: 1 } } })
  return r.valor
}
export async function numeroAnual(tenantId: string, prefixo: string, largura = 5, now = new Date()) {
  const ano = now.getFullYear()
  const seq = await proximoSeq(tenantId, `${prefixo}:${ano}`)
  return { ano, seq, numero: `${prefixo}-${ano}-${String(seq).padStart(largura, '0')}` }
}

export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  if (!uniq.length) return {} as Record<string, string>
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } })
  return Object.fromEntries(us.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
}
export async function nomeUsuario(tenantId: string, id?: string | null) { return id ? (await nomesUsuarios(tenantId, [id]))[id] : undefined }

/** Garante que um id pertence ao tenant (evita referência cruzada entre instituições). */
export async function assertTenant(tenantId: string, model: string, id: string | null | undefined, rotulo: string) {
  if (!id) return
  const row = await (prisma as any)[model].findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!row) fail(400, `${rotulo} não encontrado(a) nesta instituição.`)
}

export function baseUrlPublica() { return String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '') }
export const urlRastreio = (codigo: string) => `${baseUrlPublica()}/rastreio?c=${encodeURIComponent(codigo)}`

export async function nomeInstituicao(tenantId: string) {
  const i = await prisma.eduInstitution.findUnique({ where: { tenantId }, select: { nome: true } })
  return i?.nome ?? 'Instituição'
}

export const itensPagina = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, total, page, pageSize })
