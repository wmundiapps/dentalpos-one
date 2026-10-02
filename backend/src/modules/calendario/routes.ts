import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerEventos } from './eventos'
import { registerReservas } from './reservas'
import { registerGrade } from './grade'
import { registerGerador } from './gerador'
import { registerProvas } from './provas'
import { registerPrazos } from './prazos'
import { registerAgenda } from './agenda'
import { registerRelatorios } from './relatorios'
import { registerBootstrap } from './bootstrap'
import { registrarJobsCalendario } from './jobs'

// Módulo "calendario" — calendário acadêmico, reservas de espaços, grade horária,
// gerador automático de cronograma, calendário de provas e prazos de notas.
// Rotas autenticadas montadas em /api/edu/calendario.
const router = Router()
export const publicRouter = Router()

registerBootstrap(router)
registerEventos(router)
registerReservas(router)
registerGrade(router)
registerGerador(router)
registerProvas(router)
registerPrazos(router)
registerAgenda(router, publicRouter)
registerRelatorios(router)
registrarJobsCalendario()

router.use(academicErrorHandler)
publicRouter.use(academicErrorHandler)

// Funções para outros módulos (ex.: `notas`)
export { getGradeDeadline, registrarLancamentoConcluido } from './prazos'
export { gerarCronograma } from './scheduler'
export { secoesDoAluno, secoesDoProfessor } from './provas'
export { diasLetivosDoPeriodo, carregarOcupacaoEspaco } from './service'

export default router
