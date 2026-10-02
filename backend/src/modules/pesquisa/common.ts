import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest } from '../academico/middleware'
import { dateISO } from '../core/crud'
import { normalizarTexto } from './lib'

export const MOD = 'pesquisa'

export const GESTAO: AcademicRole[] = ['COORDINATOR']
export const DOCENTES: AcademicRole[] = ['COORDINATOR', 'TEACHER']
export const LEITORES: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'LIBRARIAN', 'SECRETARY', 'STAFF']
export const LEITORES_ALUNO: AcademicRole[] = [...LEITORES, 'STUDENT']

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const ehGestor = (req: AuthenticatedRequest) => {
  const r = String(req.user?.role || '').toUpperCase()
  return SUPER.includes(r) || r === 'COORDINATOR'
}
export const ehAluno = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase() === 'STUDENT'

export function httpErr(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

export const optDate = () => dateISO().optional().nullable()
export const optStr = () => z.string().trim().optional().nullable()

export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const u = [...new Set(ids.filter(Boolean) as string[])]
  if (!u.length) return new Map()
  const rows = await prisma.user.findMany({ where: { tenantId, id: { in: u } }, select: { id: true, firstName: true, lastName: true } })
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()]))
}

export async function nomeUsuario(tenantId: string, id?: string | null): Promise<string | null> {
  if (!id) return null
  return (await nomesUsuarios(tenantId, [id])).get(id) ?? null
}

export async function alunoLite(tenantId: string, studentId: string) {
  return prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, nomeCompleto: true, userId: true, ra: true } })
}

// Usuários do tenant ativos que são docentes — para vincular autores por nome.
export async function docentesPorNome(tenantId: string): Promise<Map<string, string>> {
  const rows = await prisma.user.findMany({ where: { tenantId, isActive: true, role: { in: ['TEACHER', 'COORDINATOR'] } }, select: { id: true, firstName: true, lastName: true }, take: 2000 })
  return new Map(rows.map((r) => [normalizarTexto(`${r.firstName} ${r.lastName}`), r.id]))
}

// Próximo código sequencial no formato PREFIXO-AAAA-NNNN (busca o maior existente).
export async function proximoCodigo(model: 'pesProjeto' | 'pesSubmissao' | 'pesEventoTrabalho', tenantId: string, prefixo: string, campo: string, ano = new Date().getFullYear()): Promise<string> {
  const pref = `${prefixo}-${ano}-`
  const ult = await (prisma as any)[model].findFirst({ where: { tenantId, [campo]: { startsWith: pref } }, orderBy: { [campo]: 'desc' }, select: { [campo]: true } })
  const n = ult ? parseInt(String(ult[campo]).slice(pref.length), 10) || 0 : 0
  return `${pref}${String(n + 1).padStart(4, '0')}`
}

export async function comRetentativa<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: any
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e
      ultimo = e
    }
  }
  throw ultimo
}

export const num = (v: any): number => (v == null ? 0 : Number(v))
