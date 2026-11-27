import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest } from '../academico/middleware'
import { registrarAcessoSensivel } from '../lgpd/sensiveis'
import { validarUrlExterna } from '../seguranca/url'

export const MOD = 'campos-pratica'

// Perfis. ADMIN/OWNER/RECTOR/BOARD passam sempre em requireRole.
export const GESTAO: AcademicRole[] = ['COORDINATOR']
export const SECRETARIA: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
/** Leitura ampla (cada rota ainda restringe o escopo por usuário). */
export const LEITURA: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'STAFF', 'TEACHER', 'STUDENT']
/** Recepção das clínicas: agenda e cadastro, sem conteúdo clínico. */
export const RECEPCAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'STAFF']
export const SUPERVISAO: AcademicRole[] = ['COORDINATOR', 'TEACHER']
export const OPERACAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'STAFF', 'TEACHER']
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

export const ehSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role))
export const ehGestor = (req: AuthenticatedRequest) => ehSuper(req) || req.user?.role === 'COORDINATOR'
export const ehRecepcao = (req: AuthenticatedRequest) => ehGestor(req) || req.user?.role === 'SECRETARY' || req.user?.role === 'STAFF'

export const DIA = 86_400_000
export const HORA = 3_600_000

export function httpErr(status: number, message: string, codigo?: string) {
  return Object.assign(new Error(message), { status, ...(codigo ? { codigo } : {}) })
}

export async function getConfig(tenantId: string) {
  return (await prisma.cprConfig.findUnique({ where: { tenantId } })) ?? (await prisma.cprConfig.create({ data: { tenantId } }))
}

export const dt = z.preprocess((v) => (typeof v === 'string' || v instanceof Date ? new Date(v as any) : v), z.date())
export const zId = z.string().trim().min(1).max(80)
export const urlOpc = z.string().trim().max(500).optional().refine((v) => !v || validarUrlExterna(v, { permitirHttp: false }).ok, 'URL inválida (use https e endereço público)')

/** Garante que o registro existe no tenant (ids de outros módulos não têm FK). */
export async function exigir<T>(q: Promise<T | null>, msg: string, status = 404): Promise<T> {
  const r = await q
  if (!r) throw httpErr(status, msg)
  return r
}
export const exigirUser = (tenantId: string, id: string, msg = 'Usuário não encontrado.') => exigir(prisma.user.findFirst({ where: { id, tenantId }, select: { id: true, firstName: true, lastName: true, role: true } }), msg, 400)
export const exigirPrograma = (tenantId: string, id: string) => exigir(prisma.academicProgram.findFirst({ where: { id, tenantId }, select: { id: true, nome: true } }), 'Curso não encontrado.', 400)
export const exigirAluno = (tenantId: string, id: string) => exigir(prisma.student.findFirst({ where: { id, tenantId }, select: { id: true, nomeCompleto: true, userId: true, ra: true } }), 'Aluno não encontrado.', 400)

export async function alunoMatriculadoNoCurso(studentId: string, programId: string) {
  const e = await prisma.enrollment.findFirst({ where: { studentId, programId, status: 'ATIVA' }, select: { id: true } })
  return !!e
}

export const nomeUser = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}`.trim() : null)

export async function mapaUsuarios(tenantId: string, ids: Array<string | null | undefined>) {
  const lista = [...new Set(ids.filter(Boolean) as string[])]
  const us = lista.length ? await prisma.user.findMany({ where: { tenantId, id: { in: lista } }, select: { id: true, firstName: true, lastName: true } }) : []
  return new Map(us.map((u) => [u.id, nomeUser(u) as string]))
}
export async function mapaAlunos(tenantId: string, ids: Array<string | null | undefined>) {
  const lista = [...new Set(ids.filter(Boolean) as string[])]
  const ss = lista.length ? await prisma.student.findMany({ where: { tenantId, id: { in: lista } }, select: { id: true, nomeCompleto: true } }) : []
  return new Map(ss.map((s) => [s.id, s.nomeCompleto]))
}
export async function mapaProgramas(tenantId: string, ids: Array<string | null | undefined>) {
  const lista = [...new Set(ids.filter(Boolean) as string[])]
  const ps = lista.length ? await prisma.academicProgram.findMany({ where: { tenantId, id: { in: lista } }, select: { id: true, nome: true } }) : []
  return new Map(ps.map((p) => [p.id, p.nome]))
}

/** Log de acesso a dado sensível: tabela do módulo + trilha central da LGPD. */
export async function logAcesso(req: AuthenticatedRequest, a: { recurso: string; recursoId?: string; pacienteId?: string | null; acao?: string; motivo?: string }) {
  if (!req.user) return
  try {
    await prisma.cprAcessoLog.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, papel: String(req.user.role), recurso: a.recurso, recursoId: a.recursoId, pacienteId: a.pacienteId ?? undefined, acao: a.acao ?? 'LEITURA', motivo: a.motivo?.slice(0, 300) } })
  } catch (e) { console.warn('[campos-pratica] log de acesso falhou', (e as any)?.code) }
  await registrarAcessoSensivel(req, { recurso: `campos-pratica/${a.recurso}`, recursoId: a.recursoId, categoria: 'SAUDE', acao: a.acao === 'ESCRITA' ? 'ESCRITA' : 'LEITURA', titularTipo: a.pacienteId ? 'PACIENTE_CAMPOS_PRATICA' : undefined, titularId: a.pacienteId ?? undefined, motivo: a.motivo })
}

export function dia(d: Date) { return d.toISOString().slice(0, 10) }
export function inicioSemana(d: Date) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const w = (x.getUTCDay() + 6) % 7; return new Date(x.getTime() - w * DIA) }
export const sobrepoe = (a1: Date, a2: Date, b1: Date, b2: Date) => a1 < b2 && b1 < a2

export function enviarJson(res: Response, data: unknown, status = 200) { res.status(status).json(data) }
