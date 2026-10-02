import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "governanca" — em construção. Rotas autenticadas (montadas em /api/edu/governanca).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/governanca).
export const publicRouter = Router()
