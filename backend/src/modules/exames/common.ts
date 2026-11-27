import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest } from '../academico/middleware'

export const MOD = 'exames'
// ADMIN/OWNER/RECTOR/BOARD passam sempre (SUPER_ROLES do requireRole).
export const GESTAO: AcademicRole[] = ['COORDINATOR']
export const DOCENTE: AcademicRole[] = ['COORDINATOR', 'TEACHER']
export const ALUNO: AcademicRole[] = ['STUDENT']
export const TODOS: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'STUDENT', 'SECRETARY', 'STAFF', 'SUPPORT']

export const AVISO_AUTORAL =
  'Questões autorais, elaboradas pela instituição ou por IA e inspiradas em padrões públicos de provas anteriores. Não são questões de provas reais e a IA não garante o conteúdo da prova oficial: use como treino, não como previsão.'

export const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })
export const isStudent = (req: AuthenticatedRequest) => String(req.user?.role).toUpperCase() === 'STUDENT'

export function requireStudentId(req: AuthenticatedRequest): string {
  const id = req.user?.studentId
  if (!id) throw httpErr(403, 'Usuário não está vinculado a um aluno.')
  return id
}

export async function getConfig(tenantId: string) {
  return prisma.exaConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

/** Uma questão só chega ao aluno se estiver PUBLICADA e (aprovada pelo docente OU a revisão obrigatória estiver desligada e não rejeitada). */
export function questaoLiberada(q: { status: string }, meta: { revisao: string } | null | undefined, cfg: { revisaoDocenteObrigatoria: boolean }) {
  if (q.status !== 'PUBLICADO') return false
  const rev = meta?.revisao ?? 'PENDENTE'
  if (rev === 'REJEITADA') return false
  return rev === 'APROVADA' || !cfg.revisaoDocenteObrigatoria
}

export async function cursosDoAluno(tenantId: string, studentId: string) {
  const r = await prisma.enrollment.findMany({ where: { studentId, status: 'ATIVA', student: { tenantId } }, select: { programId: true } })
  return [...new Set(r.map((x) => x.programId))]
}
export async function alunosDoCurso(tenantId: string, programId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({ where: { programId, status: 'ATIVA', student: { tenantId } }, select: { studentId: true } })
  return [...new Set(rows.map((r) => r.studentId))]
}
export async function alunosDaTurma(tenantId: string, classSectionId: string): Promise<string[]> {
  const rows = await prisma.classSectionEnrollment.findMany({
    where: { classSectionId, classSection: { tenantId } },
    select: { enrollment: { select: { studentId: true, status: true } } },
  })
  return [...new Set(rows.filter((r) => r.enrollment.status === 'ATIVA').map((r) => r.enrollment.studentId))]
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
