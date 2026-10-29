import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { registerEduJob } from '../core/jobs'
import { alertasAgro, jobAlertasAgro } from './agronomia'
import { mountAgronomia } from './agronomia'
import { jobLembretesConsultas, mountAgenda } from './agenda'
import { jobLembretesVacina, mountAnimal } from './animal'
import { alertasEstagios, jobAlertasEstagios, mountEstagios } from './estagios'
import { mountPacientes } from './pacientes'
import { DIA, GESTAO, LEITURA, getConfig } from './servico'

// Módulo "campos-pratica" (prefixo Cpr): estágios, clínicas-escola, núcleo de agronomia e núcleo animal.
// Rotas autenticadas em /api/edu/campos-pratica. Ver README.md.
const router = Router()

router.get('/config', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await getConfig(getTenantId(req))) }))
router.put('/config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  await getConfig(tenantId)
  const b = parseBody(z.object({
    diasAlertaConvenio: z.number().int().min(1).max(365), diasAlertaSeguro: z.number().int().min(1).max(365), diasAlertaFimEstagio: z.number().int().min(1).max(365), diasHorasPendentes: z.number().int().min(1).max(60),
    horasMaxDia: z.number().min(1).max(8), horasMaxSemanaPadrao: z.number().min(1).max(40), notaMinimaEstagio: z.number().min(0).max(10), maxFaltasConsecutivas: z.number().int().min(1).max(20),
    antecedenciaLembreteHoras: z.number().int().min(1).max(168), diasAlertaColheita: z.number().int().min(1).max(90), diasLembreteVacina: z.number().int().min(1).max(60),
  }).partial(), req.body)
  res.json(await prisma.cprConfig.update({ where: { tenantId }, data: b }))
}))

mountEstagios(router)
mountPacientes(router)
mountAgenda(router)
mountAgronomia(router)
mountAnimal(router)

// Painel geral do módulo.
router.get('/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const u = req.user!
  const ini = new Date(); ini.setUTCHours(0, 0, 0, 0)
  const fim = new Date(ini.getTime() + DIA)
  const escopoConsulta: any = u.role === 'TEACHER' ? { supervisorUserId: u.id } : u.role === 'STUDENT' ? { alunoStudentId: u.studentId ?? '__' } : {}
  const escopoEst: any = u.role === 'TEACHER' ? { orientadorUserId: u.id } : u.role === 'STUDENT' ? { studentId: u.studentId ?? '__' } : {}
  const gestao = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'COORDINATOR', 'SECRETARY'].includes(u.role)
  const [emAndamento, aguardando, horasPend, hoje, fila, ciclos, internados, vacinasAtrasadas] = await Promise.all([
    prisma.cprEstagio.count({ where: { tenantId, status: 'EM_ANDAMENTO', ...escopoEst } }),
    prisma.cprEstagio.count({ where: { tenantId, status: 'AGUARDANDO_DOCUMENTOS', ...escopoEst } }),
    prisma.cprEstagioHora.count({ where: { tenantId, status: 'PENDENTE', ...(u.role === 'TEACHER' ? { estagioId: { in: (await prisma.cprEstagio.findMany({ where: { tenantId, orientadorUserId: u.id }, select: { id: true } })).map((e) => e.id) } } : {}), ...(u.role === 'STUDENT' ? { estagioId: { in: (await prisma.cprEstagio.findMany({ where: { tenantId, studentId: u.studentId ?? '__' }, select: { id: true } })).map((e) => e.id) } } : {}) } }),
    prisma.cprConsulta.count({ where: { tenantId, ...escopoConsulta, inicio: { gte: ini, lt: fim }, status: { notIn: ['CANCELADO', 'REMARCADO'] } } }),
    u.role === 'STUDENT' ? 0 : prisma.cprFila.count({ where: { tenantId, status: { in: ['AGUARDANDO', 'CHAMADO'] } } }),
    prisma.cprCiclo.count({ where: { tenantId, status: { in: ['PLANEJADO', 'PLANTADO', 'EM_MANEJO'] } } }),
    prisma.cprInternacao.count({ where: { tenantId, status: 'INTERNADO' } }),
    prisma.cprProfilaxia.count({ where: { tenantId, proximaDose: { lt: new Date() } } }),
  ])
  const alertas = gestao ? [...(await alertasEstagios(tenantId)).map((a) => ({ ...a, nucleo: 'ESTAGIOS' })), ...(await alertasAgro(tenantId)).map((a) => ({ ...a, nucleo: 'AGRONOMIA' }))] : []
  res.json({
    estagios: { emAndamento, aguardandoDocumentos: aguardando, horasPendentesValidacao: horasPend },
    clinicas: { atendimentosHoje: hoje, filaEspera: fila },
    agronomia: { ciclosAtivos: ciclos },
    animal: { internados, profilaxiaAtrasada: vacinasAtrasadas },
    alertas: alertas.slice(0, 12), totalAlertas: alertas.length,
  })
}))

/** Executa os jobs do módulo sob demanda (também rodam no /api/cron/edu). */
async function executarJobs() {
  return { estagios: await jobAlertasEstagios(), consultas: await jobLembretesConsultas(), agro: await jobAlertasAgro(), vacinas: await jobLembretesVacina() }
}
router.post('/jobs/executar', requireRole(...GESTAO), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => { res.json(await executarJobs()) }))

router.use(academicErrorHandler)

registerEduJob('campos-pratica:alertas-estagios', jobAlertasEstagios)
registerEduJob('campos-pratica:lembretes-consultas', jobLembretesConsultas)
registerEduJob('campos-pratica:alertas-agro', jobAlertasAgro)
registerEduJob('campos-pratica:lembretes-vacinas', jobLembretesVacina)

export default router
