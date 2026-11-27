import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { mountAcesso, jobSaidaAutomatica } from './acesso'
import { mountBiometria } from './biometria'
import { mountChamada } from './chamada'
import { mountEmprestimos } from './emprestimos'
import { jobEmprestimos } from './emprestimos'
import { executarJobsPresenca, jobExpurgoBiometria, jobFecharChamadas } from './jobs'
import { diaLocal, presencaComputada } from './logic'
import { GESTAO, LEITURA_GESTAO } from './servico'

// Módulo "presenca" — chamada por reconhecimento facial no dispositivo (com alternativas sem biometria), controle de acesso a
// espaços e empréstimos de itens. Rotas autenticadas em /api/edu/presenca.
const router = Router()

mountBiometria(router)
mountChamada(router)
mountAcesso(router)
mountEmprestimos(router)

// Painel geral do dia (cards da tela inicial).
router.get('/painel', requireRole(...LEITURA_GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { ymd } = diaLocal(new Date())
  const ini = new Date(`${ymd}T00:00:00-03:00`), fim = new Date(ini.getTime() + 86_400_000)
  const agora = new Date()
  const [chamadasHoje, abertas, freqs, dentro, alertas, ativos, atrasados, divergencias] = await Promise.all([
    prisma.preChamada.count({ where: { tenantId, inicioEsperado: { gte: ini, lt: fim } } }),
    prisma.preChamada.count({ where: { tenantId, status: 'ABERTA' } }),
    prisma.preFrequencia.findMany({ where: { tenantId, chamada: { inicioEsperado: { gte: ini, lt: fim } } }, select: { status: true } }),
    prisma.preVisita.count({ where: { tenantId, saidaEm: null } }),
    prisma.preAlerta.count({ where: { tenantId, status: 'ABERTO' } }),
    prisma.preEmprestimo.count({ where: { tenantId, status: 'ATIVO' } }),
    prisma.preEmprestimo.count({ where: { tenantId, status: 'ATIVO', previstaEm: { lt: agora } } }),
    prisma.preFrequencia.count({ where: { tenantId, divergente: true } }),
  ])
  res.json({
    data: ymd, chamadasHoje, chamadasAbertas: abertas,
    presencaHoje: { presentes: freqs.filter((f) => presencaComputada(f.status)).length, faltas: freqs.filter((f) => f.status === 'FALTA').length, atrasos: freqs.filter((f) => f.status.startsWith('ATRASO')).length, total: freqs.length },
    pessoasNosEspacos: dentro, alertasAbertos: alertas, emprestimosAtivos: ativos, emprestimosAtrasados: atrasados, divergenciasPendentes: divergencias,
  })
}))

router.post('/jobs/executar', requireRole(...GESTAO), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => { res.json(await executarJobsPresenca()) }))

router.use(academicErrorHandler)

registerEduJob('presenca:chamadas', jobFecharChamadas)
registerEduJob('presenca:saida-automatica', jobSaidaAutomatica)
registerEduJob('presenca:emprestimos', jobEmprestimos)
registerEduJob('presenca:expurgo-biometria', jobExpurgoBiometria)

export default router
