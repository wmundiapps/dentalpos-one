import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "notas" — em construção. Rotas autenticadas (montadas em /api/edu/notas).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/notas).
export const publicRouter = Router()
