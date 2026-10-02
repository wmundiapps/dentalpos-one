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

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
    clinicId?: string
    tenantId: string
    role: AcademicRole
    studentId?: string
    teacherId?: string
  }
}

// Papéis com acesso total à gestão (reitoria/administração).
const SUPER_ROLES: string[] = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

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
    if (SUPER_ROLES.includes(role) || roles.includes(role as AcademicRole)) return next()
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
    }
    next()
  } catch (e) {
    next(e)
  }
}

export function academicErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err)
  const status = err?.status || (err?.code === 'P2002' ? 409 : err?.code === 'P2025' ? 404 : 500)
  if (status >= 500) console.error('[edu]', err)
  const message =
    err?.code === 'P2002' ? 'Registro duplicado.' : err?.code === 'P2025' ? 'Registro não encontrado.' : err?.message || 'Erro interno no módulo acadêmico.'
  res.status(status).json({ error: status >= 500 && !err?.status ? 'Erro interno do servidor.' : message })
}
