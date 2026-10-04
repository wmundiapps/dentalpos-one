import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, academicErrorHandler, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { bootstrapComunicacao } from './bootstrap'
import { jobCampanhas } from './campanhas'
import { despacharPendentes } from './dispatcher'
import { executarReguas } from './regua'
import { ATENDE, GESTAO_COM } from './roles'
import { jobSocial } from './social'
import { publicRouter as publico } from './publico'
import canais from './rotas-canais'
import contatos from './rotas-contatos'
import inbox from './rotas-inbox'
import campanhas from './rotas-campanhas'
import bot from './rotas-bot'
import social from './rotas-social'
import voz from './rotas-voz'

// Módulo "comunicacao" (omnichannel). Autenticado em /api/edu/comunicacao;
// webhooks públicos em /api/public/edu/comunicacao.
const router = Router()

router.post(
  '/bootstrap',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await bootstrapComunicacao(tenantId)
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'BOOTSTRAP', detalhes: r })
    res.json(r)
  }),
)

router.get(
  '/painel',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const desde = new Date(Date.now() - 7 * 86_400_000)
    const [canais, pendentes, falhas, enviadas7d, abertas, campanhasAtivas, postsAprovacao, chamadas7d] = await Promise.all([
      prisma.comCanal.findMany({ where: { tenantId }, select: { id: true, tipo: true, nome: true, ativo: true, configurado: true, ultimoTesteOk: true } }),
      prisma.eduNotification.count({ where: { tenantId, status: 'PENDENTE', canal: { not: 'IN_APP' } } }),
      prisma.eduNotification.count({ where: { tenantId, status: 'FALHA', createdAt: { gte: desde } } }),
      prisma.eduNotification.count({ where: { tenantId, status: { in: ['ENVIADA', 'ENTREGUE', 'LIDA'] }, enviadoEm: { gte: desde } } }),
      prisma.comConversa.count({ where: { tenantId, status: { notIn: ['RESOLVIDA', 'ARQUIVADA'] } } }),
      prisma.comCampanha.count({ where: { tenantId, status: { in: ['AGENDADA', 'EXECUTANDO'] } } }),
      prisma.comSocialPost.count({ where: { tenantId, status: 'EM_APROVACAO' } }),
      prisma.comChamada.count({ where: { tenantId, inicioEm: { gte: desde } } }),
    ])
    res.json({ canais, canaisNaoConfigurados: canais.filter((c) => !c.configurado).length, caixaDeSaida: { pendentes, falhas7d: falhas, enviadas7d }, conversasAbertas: abertas, campanhasAtivas, postsAguardandoAprovacao: postsAprovacao, chamadas7d })
  }),
)

router.use(canais)
router.use(contatos)
router.use(inbox)
router.use(campanhas)
router.use(bot)
router.use(social)
router.use(voz)

router.use(academicErrorHandler)
export default router

export const publicRouter = publico

// ---------------------------------------------------------------- jobs periódicos (cron /api/cron/edu)
registerEduJob('comunicacao.regua-cobranca', () => executarReguas())
registerEduJob('comunicacao.campanhas-agendadas', () => jobCampanhas())
registerEduJob('comunicacao.posts-agendados', () => jobSocial())
// Despacho por último: envia o que as réguas/campanhas/lembretes acabaram de enfileirar.
registerEduJob('comunicacao.despachante', () => despacharPendentes())
