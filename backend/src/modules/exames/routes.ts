import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import banco from './banco'
import simulados from './simulados'
import estudo from './estudo'
import coordenacao from './coordenacao'

// Módulo "exames" — preparatório para ENADE, ENAMED, OAB (e residência/concursos) com apoio de IA.
// Montado em /api/edu/exames. Reaproveita o módulo "desempenho" (exames, eixos, questões, edições, inscrições).
const router = Router()
router.use(banco)
router.use(simulados)
router.use(estudo)
router.use(coordenacao)
router.use(academicErrorHandler)

export default router

export { prontidaoEnade } from './coordenacao'
