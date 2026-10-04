import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { mountPatrimonio } from './patrimonio'
import { mountManutencao } from './manutencao'
import { mountMelhorias } from './melhorias'
import { mountEstacionamento } from './estacionamento'
import { mountPatio } from './patio'
import { mountEnergia } from './energia'
import { mountAdequacao } from './adequacao'
import { mountIndicadores } from './indicadores'
import { mountBootstrap } from './bootstrap'
import { registerInfraJobs } from './jobs'

// Módulo "infraestrutura" — montado em /api/edu/infraestrutura.
const router = Router()

mountBootstrap(router)
mountPatrimonio(router)
mountManutencao(router)
mountMelhorias(router)
mountEstacionamento(router)
mountPatio(router)
mountEnergia(router)
mountAdequacao(router)
mountIndicadores(router)
registerInfraJobs()

router.use(academicErrorHandler)

export default router

// Sem rotas públicas: toda a infraestrutura exige autenticação.
export const publicRouter = Router()

// Funções para outros módulos (regulatório, desempenho, suprimentos...).
export { calcularAdequacao } from './adequacao'
export { calcularIndicadores } from './indicadores'
export { abrirChamado, criarOrdemServico } from './manutencao'
export { depreciacaoDoBem } from './patrimonio'
export { depreciacaoLinear } from './calc'
