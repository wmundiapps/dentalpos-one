import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "regulatorio" — em construção. Rotas autenticadas (montadas em /api/edu/regulatorio).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/regulatorio).
export const publicRouter = Router()
