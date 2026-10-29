import { Router, Response, Request } from 'express'
import { academicErrorHandler, asyncHandler } from '../academico/middleware'
import ambientes from './ambientes'
import aluno, { validarCarteirinha } from './aluno'
import professor from './professor'
import ead from './ead'
import processos from './processos'

// Módulo "portal2" — ambientes de ensino, portal do aluno completo, portal do professor e sala virtual EAD.
// Montado em /api/edu/portal2 (autenticado). Detalhes em README.md.
const router = Router()
router.use(ambientes)
router.use(aluno)
router.use(processos)
router.use(professor)
router.use(ead)
router.use(academicErrorHandler)
export default router

// Público: validação da carteirinha digital pelo QR (retorna só dados mínimos).
export const publicRouter = Router()
publicRouter.get('/carteirinha/:codigo', asyncHandler(async (req: Request, res: Response) => {
  const codigo = String(req.params.codigo || '')
  if (!/^[a-f0-9]{24}$/.test(codigo)) return res.status(404).json({ valida: false, motivo: 'Carteirinha não encontrada.' })
  res.json(await validarCarteirinha(codigo))
}))
publicRouter.use(academicErrorHandler)

export { ambienteContext, ambienteProgramIds, wherePrograma, whereTurma, whereAluno } from './ambientes'
