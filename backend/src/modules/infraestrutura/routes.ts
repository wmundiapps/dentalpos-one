import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "infraestrutura" — em construção. Rotas autenticadas (montadas em /api/edu/infraestrutura).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/infraestrutura).
export const publicRouter = Router()
