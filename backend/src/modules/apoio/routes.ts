import { Router } from 'express'
import { academicErrorHandler } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { mountAcompanhamento, jobMentorias } from './acompanhamento'
import { mountAee } from './aee'
import { mountAtendimentos } from './atendimento'
import { mountBolsas, jobBolsas } from './bolsas'
import { bootstrapApoio, mountBootstrap } from './bootstrap'
import { mountDocente, jobChamados } from './docente'
import { mountEgressos, mountEgressosPublic, jobEgressos } from './egressos'
import { mountEmpregabilidade, jobEstagios } from './empregabilidade'
import { mountMonitoria } from './monitoria'
import { mountOcorrencias, jobOcorrencias } from './ocorrencia'
import { mountOuvidoria, mountOuvidoriaPublic, jobOuvidoria } from './ouvidoria'
import { mountPesquisa, jobPesquisas } from './pesquisa'
import { mountRisco, jobRisco } from './risco'

// Módulo "apoio" — apoio discente/docente, ouvidoria, pesquisas/NPS e egressos.
// Autenticado em /api/edu/apoio; público em /api/public/edu/apoio.
const router = Router()

mountBootstrap(router)
mountAtendimentos(router)
mountAee(router)
mountBolsas(router)
mountMonitoria(router)
mountAcompanhamento(router)
mountEmpregabilidade(router)
mountOcorrencias(router)
mountRisco(router)
mountDocente(router)
mountPesquisa(router)
mountOuvidoria(router)
mountEgressos(router)

router.use(academicErrorHandler)

export default router

// Rotas PÚBLICAS (sem login; /api/public/edu/apoio): ouvidoria por protocolo+senha e pesquisa de egressos por convite.
export const publicRouter = Router()
mountOuvidoriaPublic(publicRouter)
mountEgressosPublic(publicRouter)
publicRouter.use(academicErrorHandler)

// Jobs periódicos (executados por /api/cron/edu).
registerEduJob('apoio:ouvidoria-sla', jobOuvidoria)
registerEduJob('apoio:bolsas', jobBolsas)
registerEduJob('apoio:estagios', jobEstagios)
registerEduJob('apoio:ocorrencias', jobOcorrencias)
registerEduJob('apoio:risco-evasao', jobRisco)
registerEduJob('apoio:pesquisas', jobPesquisas)
registerEduJob('apoio:chamados', jobChamados)
registerEduJob('apoio:mentorias', jobMentorias)
registerEduJob('apoio:egressos-sync', jobEgressos)
registerEduJob('apoio:planos-aee', async () => {
  const { prisma } = await import('../../lib/prisma')
  const r = await prisma.apoPlanoAee.updateMany({ where: { status: 'VIGENTE', vigenciaFim: { lt: new Date() } }, data: { status: 'VENCIDO' } })
  return { vencidos: r.count }
})

export { bootstrapApoio }
