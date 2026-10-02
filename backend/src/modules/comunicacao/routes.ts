import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "comunicacao" — em construção. Rotas autenticadas (montadas em /api/edu/comunicacao).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/comunicacao).
export const publicRouter = Router()
