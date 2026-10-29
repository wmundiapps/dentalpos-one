import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerAlunos } from './alunos'
import { registerMatrizes } from './matrizes'
import { registerSalas } from './salas'
import { registerLigas } from './ligas'
import { registerDesenvolvimento } from './desenvolvimento'

// Acadêmico avançado: secretaria de alunos, matrizes/fluxograma, salas e horários, ligas/extramuros/horas complementares
// (montado em /api/edu/academico, ao lado das rotas básicas do núcleo) e desenvolvimento do aluno (/api/edu/desenvolvimento).
export const academico2Router = Router()
registerAlunos(academico2Router)
registerMatrizes(academico2Router)
registerSalas(academico2Router)
registerLigas(academico2Router)
academico2Router.use(academicErrorHandler)

export const desenvolvimentoRouter = Router()
registerDesenvolvimento(desenvolvimentoRouter)
desenvolvimentoRouter.use(academicErrorHandler)
