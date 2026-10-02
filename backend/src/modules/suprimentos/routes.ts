import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "suprimentos" — em construção. Rotas autenticadas (montadas em /api/edu/suprimentos).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/suprimentos).
export const publicRouter = Router()
