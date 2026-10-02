import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "secretaria" — em construção. Rotas autenticadas (montadas em /api/edu/secretaria).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/secretaria).
export const publicRouter = Router()
