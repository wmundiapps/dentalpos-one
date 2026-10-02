import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "biblioteca" — em construção. Rotas autenticadas (montadas em /api/edu/biblioteca).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/biblioteca).
export const publicRouter = Router()
