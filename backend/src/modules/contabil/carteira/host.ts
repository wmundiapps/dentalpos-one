// Ponto ÚNICO de acoplamento do bloco "Carteira de clientes" com o produto hospedeiro (EduMaster Pro).
// Para portar o bloco para outro sistema, basta reimplementar este arquivo: tenant, usuário, auditoria e acesso ao banco.
import bcrypt from 'bcryptjs'
import type { Request, RequestHandler } from 'express'
import { prisma } from '../../../lib/prisma'
import { AuthenticatedRequest, asyncHandler as _asyncHandler } from '../../academico/middleware'
import { audit as _audit } from '../../core/notify'

export { prisma }
export { requireAuth } from '../../academico/middleware'
export type Req = AuthenticatedRequest
export const asyncHandler: (fn: RequestHandler) => RequestHandler = _asyncHandler as any

/** Tenant e usuário da sessão (o hospedeiro já autenticou e resolveu o tenant). */
export const tenantDe = (req: Request): string => {
  const t = (req as Req).user?.tenantId
  if (!t) throw Object.assign(new Error('Tenant não identificado na sessão.'), { status: 400 })
  return t
}
export const usuarioDe = (req: Request): string => {
  const u = (req as Req).user?.id
  if (!u) throw Object.assign(new Error('Usuário não identificado.'), { status: 401 })
  return u
}
export const papelDe = (req: Request): string => String((req as Req).user?.role || '').toUpperCase()
export const clinicaDe = (req: Request): string | undefined => (req as Req).user?.clinicId

/** Auditoria de ações sensíveis (trilha do hospedeiro). */
export const auditar = (req: Request, acao: string, refType: string, refId: string, detalhes?: unknown) =>
  _audit({ tenantId: tenantDe(req), userId: (req as Req).user?.id, modulo: 'contabil-carteira', acao, refType, refId, detalhes })

/** Nomes das pessoas do tenant (equipe do escritório e logins do portal). */
export async function nomesDeUsuarios(tenantId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map()
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } })
  return new Map(us.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ')]))
}

/** Equipe interna do escritório (usuários do tenant com cargo de contabilidade). */
export const CARGOS_EQUIPE = ['ADMIN', 'OWNER', 'GESTOR_CONTABIL', 'CONTADOR', 'ACCOUNTANT', 'ANALISTA_CONTABIL', 'FINANCE']
export async function equipeDoTenant(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, isActive: true, role: { in: CARGOS_EQUIPE } },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }],
  })
}

/** Cria o login do portal do cliente (cargo CLIENTE_CONTABIL). Devolve a senha provisória (mostrada uma única vez). */
export async function criarLoginPortal(req: Request, d: { email: string; nome: string; senha: string }) {
  const tenantId = tenantDe(req)
  const clinicId = clinicaDe(req)
  if (!clinicId) throw Object.assign(new Error('Instituição da sessão não identificada.'), { status: 400 })
  const email = d.email.trim().toLowerCase()
  const existe = await prisma.user.findFirst({ where: { tenantId, email } })
  if (existe) throw Object.assign(new Error('Já existe um usuário com este e-mail.'), { status: 409 })
  const partes = d.nome.trim().split(/\s+/)
  const hash = await bcrypt.hash(d.senha, 10)
  return prisma.user.create({
    data: { clinicId, tenantId, email, password: hash, firstName: partes[0] || 'Cliente', lastName: partes.slice(1).join(' ') || 'Contábil', role: 'CLIENTE_CONTABIL' },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
}
export async function redefinirSenhaUsuario(tenantId: string, userId: string, senha: string) {
  await prisma.user.updateMany({ where: { id: userId, tenantId, role: 'CLIENTE_CONTABIL' }, data: { password: await bcrypt.hash(senha, 10), isActive: true } })
}
/** LGPD: remove os dados pessoais dos logins do portal (mantém o registro para integridade das trilhas). */
export async function anonimizarUsuarios(tenantId: string, ids: string[]) {
  for (const id of ids) await prisma.user.updateMany({ where: { id, tenantId, role: 'CLIENTE_CONTABIL' }, data: { isActive: false, email: `anonimizado-${id.slice(0, 8)}@anonimizado.invalid`, firstName: 'Anonimizado', lastName: 'LGPD', phone: null, avatar: null } })
}
export const desativarUsuario =(tenantId: string, userId: string) => prisma.user.updateMany({ where: { id: userId, tenantId }, data: { isActive: false } })
