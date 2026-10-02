import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import regras from './regras'
import diario from './diario'
import aluno from './aluno'
import revisao from './revisao'
import gestao from './gestao'
import portal from './portal'
import './jobs'

// Módulo "notas" — diário de classe, notas, boletim, histórico, revisão e portal do aluno.
// Montado em /api/edu/notas (autenticado). Detalhes em README.md.
const router = Router()

router.use(regras)
router.use(diario)
router.use(aluno)
router.use(revisao)
router.use(gestao)
router.use(portal)

router.use(academicErrorHandler)

export default router

// Sem rotas públicas (dados de notas são sempre autenticados).
export const publicRouter = Router()

export {
  resolverRegra, recalcularTurma, calcularTurma, getBoletimAluno, getHistoricoAluno, calcularCRAluno,
  frequenciaTurma, gravarNota, getPrazoLancamento,
} from './service'
export { calcResultado, calcCR, calcFrequencia, estatisticas, avaliarRisco, notaNecessaria } from './calc'
