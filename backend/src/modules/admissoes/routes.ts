import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "admissoes" — em construção. Rotas autenticadas (montadas em /api/edu/admissoes).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/admissoes).
export const publicRouter = Router()
