import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { academicErrorHandler, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { registerEduJob } from '../core/jobs'
import { BIB, MOD } from './common'
import { POLITICAS_PADRAO } from './logic'
import { getConfig, jobAtrasos, jobMultasCobranca, jobReservasExpiradas, jobVigenciaVirtual } from './service'
import { mountAcervo } from './acervo'
import { mountCirculacao } from './circulacao'
import { mountAdequacao } from './adequacao'
import { mountVirtual } from './virtual'
import { mountRepositorio } from './repositorio'
import { mountRelatorios } from './relatorios'

// Módulo "biblioteca" — acervo físico, circulação, adequação curricular, biblioteca virtual e repositório.
// Montado em /api/edu/biblioteca (autenticado); catálogo/repositório públicos em /api/public/edu/biblioteca/:tenantId/*.
const router = Router()

mountAcervo(router)
mountCirculacao(router)
mountAdequacao(router)
mountVirtual(router)
mountRepositorio(router)
mountRelatorios(router)

const RECURSOS_PADRAO = [
  { tipo: 'PERIODICO' as const, titulo: 'Portal de Periódicos CAPES', provedor: 'CAPES', url: 'https://www.periodicos.capes.gov.br', tipoAcesso: 'ASSINATURA_INSTITUCIONAL' as const, descricao: 'Acesso institucional via CAFe (requer vínculo da IES).' },
  { tipo: 'PERIODICO' as const, titulo: 'SciELO — Scientific Electronic Library Online', provedor: 'SciELO', url: 'https://www.scielo.br', tipoAcesso: 'ACESSO_LIVRE' as const, descricao: 'Periódicos científicos de acesso aberto.' },
  { tipo: 'BASE_DADOS' as const, titulo: 'BDTD — Biblioteca Digital Brasileira de Teses e Dissertações', provedor: 'IBICT', url: 'https://bdtd.ibict.br', tipoAcesso: 'ACESSO_LIVRE' as const, descricao: 'Teses e dissertações das instituições brasileiras.' },
  { tipo: 'BASE_DADOS' as const, titulo: 'PubMed', provedor: 'NCBI/NLM', url: 'https://pubmed.ncbi.nlm.nih.gov', tipoAcesso: 'ACESSO_LIVRE' as const, descricao: 'Literatura biomédica e de ciências da vida.' },
  { tipo: 'PERIODICO' as const, titulo: 'DOAJ — Directory of Open Access Journals', provedor: 'DOAJ', url: 'https://doaj.org', tipoAcesso: 'ACESSO_LIVRE' as const, descricao: 'Diretório de periódicos de acesso aberto.' },
  { tipo: 'EBOOK' as const, titulo: 'Domínio Público', provedor: 'MEC', url: 'http://www.dominiopublico.gov.br', tipoAcesso: 'ACESSO_LIVRE' as const, descricao: 'Obras em domínio público.' },
]

// Dados iniciais idempotentes: políticas por perfil, configuração e catálogo virtual gratuito.
router.post('/bootstrap', requireRole(...BIB), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const cfg = await getConfig(tenantId)
  let politicas = 0
  for (const [perfil, p] of Object.entries(POLITICAS_PADRAO)) {
    const ex = await prisma.bibPolitica.findFirst({ where: { tenantId, perfil: perfil as any } })
    if (!ex) { await prisma.bibPolitica.create({ data: { tenantId, perfil: perfil as any, ...p } }); politicas++ }
  }
  let recursos = 0
  for (const r of RECURSOS_PADRAO) {
    if (!(await prisma.bibRecursoVirtual.findFirst({ where: { tenantId, titulo: r.titulo } }))) { await prisma.bibRecursoVirtual.create({ data: { tenantId, ...r } }); recursos++ }
  }
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'BOOTSTRAP', detalhes: { politicas, recursos } })
  res.json({ configId: cfg.id, politicasCriadas: politicas, recursosVirtuaisCriados: recursos })
}))

// Execução manual dos jobs (mesma rotina do cron /api/cron/edu).
router.post('/jobs/executar', requireRole(...BIB), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    atrasos: await jobAtrasos(), reservas: await jobReservasExpiradas(), multas: await jobMultasCobranca(), virtual: await jobVigenciaVirtual(),
  })
}))

router.use(academicErrorHandler)

registerEduJob('biblioteca:atrasos', jobAtrasos)
registerEduJob('biblioteca:reservas-expiradas', jobReservasExpiradas)
registerEduJob('biblioteca:multas-cobranca', jobMultasCobranca)
registerEduJob('biblioteca:vigencia-virtual', jobVigenciaVirtual)

export default router
export { publicRouter } from './publico'
