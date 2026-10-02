import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "jornadas" — em construção. Rotas autenticadas (montadas em /api/edu/jornadas).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/jornadas).
export const publicRouter = Router()
