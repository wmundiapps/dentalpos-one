import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "reitoria" — em construção. Rotas autenticadas (montadas em /api/edu/reitoria).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/reitoria).
export const publicRouter = Router()
