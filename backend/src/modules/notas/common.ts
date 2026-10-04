import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { carregarCtx, TurmaCtx } from './service'

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const MGMT = [...SUPER, 'COORDINATOR', 'SECRETARY']

export const role = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(role(req))
export const isMgmt = (req: AuthenticatedRequest) => MGMT.includes(role(req))
export const isCoord = (req: AuthenticatedRequest) => isSuper(req) || role(req) === 'COORDINATOR'

export const httpErr = (status: number, msg: string, extra?: object) => Object.assign(new Error(msg), { status, ...extra })

// Carrega a turma e confere acesso: gestão vê/edita tudo; professor só as suas; aluno nunca (usa rotas /meu).
export async function turmaDoUsuario(req: AuthenticatedRequest, classSectionId: string): Promise<TurmaCtx> {
  const tenantId = getTenantId(req)
  const ctx = await carregarCtx(tenantId, classSectionId)
  if (!ctx) throw httpErr(404, 'Turma não encontrada.')
  if (!isMgmt(req)) {
    if (role(req) !== 'TEACHER' || ctx.section.professorUserId !== getUserId(req)) throw httpErr(403, 'Esta turma não é sua.')
  }
  return ctx
}

// Aluno: só o próprio. Professor: só alunos das suas turmas. Gestão: todos.
export async function assertAcessoAluno(req: AuthenticatedRequest, studentId: string) {
  const tenantId = getTenantId(req)
  const r = role(req)
  if (r === 'STUDENT') {
    if (!req.user?.studentId || req.user.studentId !== studentId) throw httpErr(403, 'Você só pode consultar os seus próprios dados.')
    return
  }
  if (isMgmt(req)) return
  if (r === 'TEACHER') {
    const n = await prisma.classSectionEnrollment.count({
      where: { enrollment: { studentId }, classSection: { tenantId, professorUserId: getUserId(req) } },
    })
    if (!n) throw httpErr(403, 'Aluno fora das suas turmas.')
    return
  }
  throw httpErr(403, 'Sem permissão para esta ação.')
}

export function minhaStudentId(req: AuthenticatedRequest): string {
  if (!req.user?.studentId) throw httpErr(403, 'Usuário não vinculado a um aluno.')
  return req.user.studentId
}

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()}W${Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)}`
}
