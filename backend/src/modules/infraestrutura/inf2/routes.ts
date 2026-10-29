import { Router } from 'express'
import { mountAgenda, registerAgendaJob } from './agenda'
import { mountSolicitacoes, registerSolicitacoesJob } from './solicitacoes'
import { mountFrota, registerFrotaJob } from './frota'
import { mountAnexos } from './anexos'
import { mountIndicadoresPessoas } from './indicadoresPessoas'
import { mountSegurancaPatrimonial } from '../seguranca-patrimonial/routes'

// Infraestrutura 2 (prefixo Inf2): agenda, solicitações/OS, frota, segurança patrimonial e indicadores de pessoas para o RH.
export function mountInfra2(router: Router) {
  mountAnexos(router)
  mountAgenda(router)
  mountSolicitacoes(router)
  mountFrota(router)
  mountSegurancaPatrimonial(router)
  mountIndicadoresPessoas(router)
  registerAgendaJob(); registerSolicitacoesJob(); registerFrotaJob()
}
export { indicadoresPessoaInfra, indicadoresInfraLote } from './indicadoresPessoas'
export { custoVeiculo, coletarAlertas } from './frota'
