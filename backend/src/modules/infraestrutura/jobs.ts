import { registerEduJob } from '../core/jobs'
import { jobPlanosPreventivos, jobOsVencidas } from './manutencao'
import { jobProjetosAtrasados } from './melhorias'
import { jobReservas } from './patio'
import { jobEstacionamento } from './estacionamento'
import { jobEnergia } from './energia'

// Jobs periódicos (executados por /api/cron/edu).
export function registerInfraJobs() {
  registerEduJob('infra.planos-preventivos', () => jobPlanosPreventivos())
  registerEduJob('infra.os-vencidas', () => jobOsVencidas())
  registerEduJob('infra.projetos-atrasados', () => jobProjetosAtrasados())
  registerEduJob('infra.reservas', () => jobReservas())
  registerEduJob('infra.estacionamento', () => jobEstacionamento())
  registerEduJob('infra.energia-iluminacao', () => jobEnergia())
}
