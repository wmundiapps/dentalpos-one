import { Response, Router } from 'express'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler } from '../academico/middleware'
import { registerEduJob } from '../core/jobs'
import { scheduleReminder } from '../core/reminders'
import { ehGestorLgpd, exigirGestorLgpd, MODULO, tid } from './base'
import { mountConsentimentos, mountConsentimentosPublic, menoresSemResponsavel } from './consentimentos'
import { mountDpo, mountDpoPublic } from './dpo'
import { jobIncidentes, mountIncidentes } from './incidentes'
import { estadoPrazo } from './prazos'
import { jobRetencao, mountRetencao, semearPoliticas } from './retencao'
import { mountRopa, semearRopa } from './ropa'
import { mountSensiveis } from './sensiveis'
import { mountSolicitacoes, mountSolicitacoesPublic } from './solicitacoes'

// Módulo LGPD - autenticado em /api/edu/lgpd; público (Portal do Titular) em /api/public/edu/lgpd.
// Visão geral e limites: ver README.md deste diretório e docs/LGPD-*.md.
const router = Router()

router.get('/acesso', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ gestor: await ehGestorLgpd(req) })
}))

mountSolicitacoes(router)
mountConsentimentos(router)
mountRopa(router)
mountRetencao(router)
mountIncidentes(router)
mountDpo(router)
mountSensiveis(router)

// Inicializa os modelos (ROPA e políticas de retenção) para a instituição - idempotente.
router.post('/bootstrap', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  res.json({ ropa: await semearRopa(tenantId), politicasCriadas: await semearPoliticas(tenantId) })
}))

router.get('/menores/pendencias', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await menoresSemResponsavel(tid(req))
  res.json({ items, total: items.length, aviso: 'Alunos menores de 18 anos sem responsável legal registrado: obtenha o consentimento do responsável para finalidades baseadas em consentimento (art. 14, §1º).' })
}))

router.get('/painel', exigirGestorLgpd, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = tid(req)
  const abertas = await prisma.lgpSolicitacao.findMany({ where: { tenantId, status: { in: ['ABERTA', 'EM_ANALISE', 'AGUARDANDO_TITULAR'] } }, select: { createdAt: true, prazoEm: true, prorrogadoEm: true } })
  const est = abertas.map((s) => estadoPrazo(s.createdAt, s.prorrogadoEm ?? s.prazoEm, true).estado)
  const [consAtivos, consRevog, ropa, ropaRev, sens, men, incAbertos, incPend, dpo, ultimaRet] = await Promise.all([
    prisma.lgpConsentimento.count({ where: { tenantId, status: 'ATIVO' } }),
    prisma.lgpConsentimento.count({ where: { tenantId, status: 'REVOGADO' } }),
    prisma.lgpAtividadeTratamento.count({ where: { tenantId, status: { not: 'DESCONTINUADA' } } }),
    prisma.lgpAtividadeTratamento.count({ where: { tenantId, status: 'EM_REVISAO' } }),
    prisma.lgpAtividadeTratamento.count({ where: { tenantId, status: { not: 'DESCONTINUADA' }, dadosSensiveis: true } }),
    prisma.lgpAtividadeTratamento.count({ where: { tenantId, status: { not: 'DESCONTINUADA' }, dadosMenores: true } }),
    prisma.lgpIncidente.count({ where: { tenantId, status: { not: 'ENCERRADO' } } }),
    prisma.lgpIncidente.count({ where: { tenantId, status: { not: 'ENCERRADO' }, riscoRelevante: true, OR: [{ comunicadoAnpdEm: null }, { comunicadoTitularesEm: null }] } }),
    prisma.lgpDpo.findFirst({ where: { tenantId, ativo: true }, select: { nome: true, email: true } }),
    prisma.lgpRetencaoExecucao.findFirst({ where: { tenantId }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true, dryRun: true, alvo: true, afetados: true } }),
  ])
  res.json({
    solicitacoes: { abertas: abertas.length, vencidas: est.filter((e) => e === 'VENCIDA').length, vencendo: est.filter((e) => e === 'VENCENDO').length },
    consentimentos: { ativos: consAtivos, revogados: consRevog },
    ropa: { total: ropa, emRevisao: ropaRev, sensiveis: sens, menores: men },
    incidentes: { abertos: incAbertos, comComunicacaoPendente: incPend },
    dpo, ultimaRetencao: ultimaRet,
    modoRetencao: process.env.LGPD_RETENCAO_EXECUTAR === 'true' ? 'EXECUCAO' : 'DRY_RUN',
  })
}))

router.use(academicErrorHandler)
export default router

// Rotas PÚBLICAS (sem login): Portal do Titular, textos e consentimentos, encarregado e dados da política de privacidade.
export const publicRouter = Router()
mountConsentimentosPublic(publicRouter)
mountSolicitacoesPublic(publicRouter)
mountDpoPublic(publicRouter)
publicRouter.use(academicErrorHandler)

// ------------------------------------------------------------------ jobs (executados por /api/cron/edu)
async function jobPrazosSolicitacoes() {
  const abertas = await prisma.lgpSolicitacao.findMany({ where: { status: { in: ['ABERTA', 'EM_ANALISE', 'AGUARDANDO_TITULAR'] } }, take: 2000 })
  let alertas = 0
  const ontem = new Date(Date.now() - 20 * 3_600_000)
  for (const s of abertas) {
    const p = estadoPrazo(s.createdAt, s.prorrogadoEm ?? s.prazoEm, true)
    if (p.estado === 'NO_PRAZO') continue
    if (s.alertadoEm && s.alertadoEm > ontem) continue
    const dpo = await prisma.lgpDpo.findFirst({ where: { tenantId: s.tenantId, ativo: true } })
    await scheduleReminder({
      tenantId: s.tenantId, modulo: MODULO, titulo: `${p.estado === 'VENCIDA' ? 'PRAZO VENCIDO' : 'Prazo vencendo'}: solicitação LGPD ${s.protocolo}`, dueAt: s.prorrogadoEm ?? s.prazoEm, remindAt: new Date(),
      assigneeUserId: s.atribuidoAId ?? dpo?.userId ?? undefined, assigneeRole: s.atribuidoAId || dpo?.userId ? undefined : 'ADMIN', refType: 'LgpSolicitacao', refId: s.id, severity: p.estado === 'VENCIDA' ? 'CRITICO' : 'ATENCAO', dedupeKey: `lgpd-sol-${s.id}`,
    })
    await prisma.lgpSolicitacao.update({ where: { id: s.id }, data: { alertadoEm: new Date() } })
    alertas++
  }
  return { abertas: abertas.length, alertas }
}

registerEduJob('lgpd:prazos-solicitacoes', jobPrazosSolicitacoes)
registerEduJob('lgpd:prazos-incidentes', jobIncidentes)
registerEduJob('lgpd:retencao', jobRetencao)
