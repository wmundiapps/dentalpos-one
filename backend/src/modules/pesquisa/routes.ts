import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "pesquisa" — em construção. Rotas autenticadas (montadas em /api/edu/pesquisa).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/pesquisa).
export const publicRouter = Router()
