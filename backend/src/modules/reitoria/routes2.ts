import { Router } from 'express'
import { registerEduJob } from '../core/jobs'
import { jobAgendaLembretes, registerAgenda } from './agenda'
import { registerComparativo } from './comparativo'
import { jobConvenios, registerConvenios } from './convenios'
import { jobDouColeta, registerDou } from './dou'
import { registerInvestimentos } from './investimentos'
import { registerPaineis } from './paineis'
import { registerPessoas } from './pessoas'

// Reitoria parte 2: agenda executiva, monitor do DOU, convênios, investimentos por disciplina,
// avaliação de pessoas, comparativo com outras IES e painéis executivos.
export function registerReitoria2(router: Router) {
  registerAgenda(router)
  registerDou(router)
  registerConvenios(router)
  registerInvestimentos(router)
  registerPessoas(router)
  registerComparativo(router)
  registerPaineis(router)
}

registerEduJob('reitoria:agenda-lembretes', jobAgendaLembretes)
registerEduJob('reitoria:convenios-alertas', jobConvenios)
registerEduJob('reitoria:dou-coleta', jobDouColeta)
