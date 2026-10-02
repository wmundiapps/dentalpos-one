import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "desempenho" — em construção. Rotas autenticadas (montadas em /api/edu/desempenho).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/desempenho).
export const publicRouter = Router()
