import { Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'

export const MOD = 'mensagens'
export { AuthenticatedRequest, Response, asyncHandler, requireRole, pageParams, parseBody, qs, dateISO, audit }

// Quem usa o Mensageiro (equipe interna). ADMIN/OWNER/RECTOR/BOARD entram automaticamente (requireRole). Aluno NÃO acessa.
// 'LEGAL' = equipe jurídica (papel gravado na tabela User pelo módulo jurídico).
export const USA: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'FINANCE', 'SECRETARY', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'MARKETING', 'ADMISSIONS', 'SUPPORT', 'STAFF', 'LEGAL' as AcademicRole]
// Quem cria canais de departamento, ajusta respostas automáticas/FAQ e vê todos os pedidos de "falar com uma pessoa".
export const GESTAO: AcademicRole[] = ['SUPPORT', 'SECRETARY']
// Exportação, retenção e configuração geral: só a gestão superior.
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
// Quem pode encaminhar atendimentos (mesma regra da central de atendimento).
export const ATENDE: AcademicRole[] = ['SUPPORT', 'SECRETARY', 'ADMISSIONS', 'FINANCE', 'COORDINATOR', 'STAFF']

export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role))
export const isGestor = (req: AuthenticatedRequest) => isSuper(req) || GESTAO.includes(req.user?.role as AcademicRole)

export function fail(status: number, msg: string): never { throw Object.assign(new Error(msg), { status }) }
export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)

export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  if (!uniq.length) return {} as Record<string, { nome: string; role: string }>
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true, role: true } })
  return Object.fromEntries(us.map((u) => [u.id, { nome: `${u.firstName} ${u.lastName}`.trim(), role: String(u.role) }]))
}

export async function getConfig(tenantId: string) {
  return prisma.msgConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

export const itensPagina = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, total, page, pageSize })
