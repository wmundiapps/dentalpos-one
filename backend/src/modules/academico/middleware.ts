import { Request, Response, NextFunction, RequestHandler } from 'express'
import { prisma } from '../../lib/prisma'

// Middleware compartilhado por TODOS os módulos EduMaster Pro.
// A autenticação (JWT) e o tenant já foram resolvidos antes, em routes/index.ts
// (authMiddleware + tenantMiddleware). Aqui só se faz a ponte de papéis e o
// contexto acadêmico (aluno/professor vinculado ao usuário logado).

export type AcademicRole =
  | 'ADMIN'
  | 'OWNER'
  | 'RECTOR'
  | 'COORDINATOR'
  | 'TEACHER'
  | 'STUDENT'
  | 'FINANCE'
  | 'BOARD'
  | 'SECRETARY'
  | 'LIBRARIAN'
  | 'FACILITIES'
  | 'SUPPLIES'
  | 'MARKETING'
  | 'ADMISSIONS'
  | 'SUPPORT'
  | 'STAFF'
  | 'GESTOR_CONTABIL'
  | 'CONTADOR'
  | 'ANALISTA_CONTABIL'
  | 'CLIENTE_CONTABIL'
  | 'HR'
  | 'GESTOR_POLO'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
    clinicId?: string
    tenantId: string
    role: AcademicRole
    studentId?: string
    teacherId?: string
    /** Polos (ModPolo) sob gestão deste usuário quando role === 'GESTOR_POLO' (ver eduContext). */
    poloIds?: string[]
  }
}

// Papéis com acesso total à gestão (reitoria/administração).
const SUPER_ROLES: string[] = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

// robsonravel@wmundi.com: proprietário da WMundi, acesso total sempre, independente do cargo
// atribuído na conta (mesmo tratamento dado aos SUPER_ROLES acima).
const OWNER_ACCOUNT_EMAIL = 'robsonravel@wmundi.com'

export function asyncHandler(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  next()
}

export function requireRole(...roles: AcademicRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const role = String(req.user.role || '').toUpperCase()
    if (String(req.user.email || '').toLowerCase() === OWNER_ACCOUNT_EMAIL) return next()
    if (SUPER_ROLES.includes(role) || roles.includes(role as AcademicRole)) return next()
    // Acesso por cargo (modules/acesso): concessão PERMITIR do módulo atual libera rotas de gestão. Não vale para rotas só de
    // STUDENT/TEACHER (checam o dono do dado) nem para rotas só da administração (roles vazio).
    if ((req as any).acessoConcedido && roles.some((r) => r !== 'STUDENT' && r !== 'TEACHER')) return next()
    return res.status(403).json({ error: 'Sem permissão para esta ação.' })
  }
}

export function getTenantId(req: AuthenticatedRequest): string {
  if (!req.user?.tenantId) {
    throw Object.assign(new Error('Tenant não identificado na sessão.'), { status: 400 })
  }
  return req.user.tenantId
}

export function getUserId(req: AuthenticatedRequest): string {
  if (!req.user?.id) throw Object.assign(new Error('Usuário não identificado.'), { status: 401 })
  return req.user.id
}

// Resolve studentId do usuário logado (Student.userId) uma vez por requisição.
export async function eduContext(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    if (req.user) {
      req.user.role = String(req.user.role || 'STAFF').toUpperCase() as AcademicRole
      if (req.user.role === 'STUDENT' && !req.user.studentId) {
        const s = await prisma.student.findFirst({
          where: { tenantId: req.user.tenantId, userId: req.user.id },
          select: { id: true },
        })
        if (s) req.user.studentId = s.id
      }
      if (req.user.role === 'GESTOR_POLO' && !req.user.poloIds) {
        const polos = await (prisma as any).modPolo.findMany({
          where: { tenantId: req.user.tenantId, responsavelUserId: req.user.id },
          select: { id: true },
        })
        req.user.poloIds = polos.map((p: { id: string }) => p.id)
      }
    }
    next()
  } catch (e) {
    next(e)
  }
}

export function academicErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)
  const name = String(err?.name || '')
  let status: number = err?.status || 0
  let message: string = err?.message || ''
  if (!status) {
    if (err?.code === 'P2002') { status = 409; message = 'Registro duplicado.' }
    else if (err?.code === 'P2025') { status = 404; message = 'Registro não encontrado.' }
    else if (err?.code === 'P2003') { status = 409; message = 'Operação bloqueada: há registros vinculados ou a referência informada não existe.' }
    else if (err?.code === 'P2000' || err?.code === 'P2006' || err?.code === 'P2007' || name === 'PrismaClientValidationError') { status = 400; message = 'Dados inválidos para esta operação.' }
    else if (err?.type === 'entity.parse.failed') { status = 400; message = 'JSON inválido.' }
  }
  status = status || 500
  if (status >= 500) console.error('[edu]', err)
  res.status(status).json({ error: status >= 500 && !err?.status ? 'Erro interno do servidor.' : message || 'Erro.', ...(status < 500 && typeof err?.codigo === 'string' ? { codigo: err.codigo } : {}) })
}
