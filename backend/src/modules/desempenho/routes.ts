import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import exames from './exames'
import questoes from './questoes'
import simulados from './simulados'
import atividades from './atividades'
import trilhas from './trilhas'
import painel from './painel'
import './jobs'

// Módulo "desempenho" — ENADE, OAB, ENAMED/Residência e desempenho acadêmico.
// Montado em /api/edu/desempenho (ver README.md deste módulo).
const router = Router()
router.use(exames)
router.use(questoes)
router.use(simulados)
router.use(atividades)
router.use(trilhas)
router.use(painel)
router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS: nenhuma (dados de desempenho são sempre autenticados).
export const publicRouter = Router()

// API para outros módulos
export { priorizarLacunas, estimarConceitoEnade, projecaoOAB, montarSimulado, corrigir, gerarPlanoSemanal } from './logic'
export { analisarGrupo, rankingRisco } from './painel'
export { desempenhoEixos, lacunasGrupo, ultimasTentativas } from './analise'
export { aplicarCatalogo } from './catalogo'
