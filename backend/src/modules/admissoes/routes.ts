import { Router, Response } from 'express'
import { AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { bootstrapAdmissoes } from './bootstrap'
import captacao from './captacao'
import matricula from './matricula'
import processos from './processos'
import relatorios from './relatorios'
import rematricula from './rematricula'
import './jobs'
import { publicRouter as publicRouterImpl } from './publico'

// Módulo "admissoes" — captação, vestibular, matrícula e rematrícula (/api/edu/admissoes).
const router = Router()

router.post('/bootstrap', requireRole('ADMISSIONS', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const r = await bootstrapAdmissoes(tenantId)
  await audit({ tenantId, userId: getUserId(req), modulo: 'admissoes', acao: 'BOOTSTRAP', detalhes: r })
  res.json(r)
}))

router.use(processos)
router.use(captacao)
router.use(matricula)
router.use(rematricula)
router.use(relatorios)

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS (sem login; montadas em /api/public/edu/admissoes).
export const publicRouter = publicRouterImpl
