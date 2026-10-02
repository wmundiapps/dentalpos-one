import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest } from '../academico/middleware'

export const MOD = 'desempenho'
export const GESTAO: AcademicRole[] = ['COORDINATOR']
export const DOCENTE: AcademicRole[] = ['COORDINATOR', 'TEACHER']
export const LEITURA: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'SECRETARY', 'STAFF', 'SUPPORT']
export const ALUNO: AcademicRole[] = ['STUDENT']

export const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })
export const isStudent = (req: AuthenticatedRequest) => String(req.user?.role).toUpperCase() === 'STUDENT'
export const isTeacher = (req: AuthenticatedRequest) => String(req.user?.role).toUpperCase() === 'TEACHER'

export function requireStudentId(req: AuthenticatedRequest): string {
  const id = req.user?.studentId
  if (!id) throw httpErr(403, 'Usuário não está vinculado a um aluno.')
  return id
}

// Alunos de uma turma (ClassSection) — ids de Student
export async function alunosDaTurma(tenantId: string, classSectionId: string): Promise<string[]> {
  const rows = await prisma.classSectionEnrollment.findMany({
    where: { classSectionId, classSection: { tenantId } },
    select: { enrollment: { select: { studentId: true, status: true } } },
  })
  return [...new Set(rows.filter((r) => r.enrollment.status === 'ATIVA').map((r) => r.enrollment.studentId))]
}
export async function alunosDoCurso(tenantId: string, programId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({ where: { programId, status: 'ATIVA', student: { tenantId } }, select: { studentId: true } })
  return [...new Set(rows.map((r) => r.studentId))]
}

// Resolve alvos de um simulado em ids de alunos
export async function resolverAlunos(tenantId: string, alvos: Array<{ classSectionId?: string | null; programId?: string | null; studentId?: string | null }>) {
  const ids = new Set<string>()
  for (const a of alvos) {
    if (a.studentId) ids.add(a.studentId)
    if (a.classSectionId) (await alunosDaTurma(tenantId, a.classSectionId)).forEach((i) => ids.add(i))
    if (a.programId) (await alunosDoCurso(tenantId, a.programId)).forEach((i) => ids.add(i))
  }
  return [...ids]
}

export async function nomesAlunos(tenantId: string, ids: string[]) {
  if (!ids.length) return new Map<string, { nome: string; ra: string; userId: string }>()
  const rows = await prisma.student.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nomeCompleto: true, ra: true, userId: true } })
  return new Map(rows.map((r) => [r.id, { nome: r.nomeCompleto, ra: r.ra, userId: r.userId }]))
}

export function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}
export const media = (a: number[]) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null)
