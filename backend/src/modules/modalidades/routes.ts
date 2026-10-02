import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'

// Módulo "modalidades" — em construção. Rotas autenticadas (montadas em /api/edu/modalidades).
const router = Router()

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS opcionais (sem login; montadas em /api/public/edu/modalidades).
export const publicRouter = Router()
