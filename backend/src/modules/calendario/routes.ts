import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "calendario" — em construção. Rotas autenticadas (montadas em /api/edu/calendario).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/calendario).
export const publicRouter = Router()
