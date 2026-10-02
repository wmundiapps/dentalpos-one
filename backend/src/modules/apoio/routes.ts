import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "apoio" — em construção. Rotas autenticadas (montadas em /api/edu/apoio).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/apoio).
export const publicRouter = Router()
