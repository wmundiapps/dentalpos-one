import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { mountAvaliacoes } from './avaliacoes'
import { mountCadastro } from './cadastro'
import { mountCarreira } from './carreira'
import { mountCiclo } from './ciclo'
import { exigirAutenticado } from './common'
import { jobFerias, mountFerias } from './ferias'
import { mountFolha } from './folha'
import { mountPainel } from './painel'
import { mountPonto } from './ponto'
import { jobSaude, mountSaude } from './saude'
import { mountSocios } from './socios'
import { jobBanco } from './banco'

// Módulo "rh" — RH do EduMaster (colaboradores, ponto/banco de horas, saúde ocupacional, férias, carreira,
// disciplina, admissão/desligamento, avaliação, folha simplificada, pró-labore e terceiros).
// Autenticado em /api/edu/rh. Estudantes nunca acessam; cada rota aplica RH / gestor da equipe / próprio colaborador.
const router = Router()
router.use(exigirAutenticado)

mountPainel(router)
mountCadastro(router)
mountPonto(router)
mountSaude(router)
mountFerias(router)
mountCarreira(router)
mountCiclo(router)
mountAvaliacoes(router)
mountFolha(router)
mountSocios(router)

router.use(academicErrorHandler)
export default router

registerEduJob('rh:ferias', jobFerias)
registerEduJob('rh:saude', jobSaude)
registerEduJob('rh:banco-horas', jobBanco)

export { gerarLancamentosFolha, registrarConsumidorFolha } from './integracao'
export { resumoRhParaReitoria } from './painel'
