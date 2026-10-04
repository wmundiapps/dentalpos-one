import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { calcularFunil, type StatusCandidato } from './logic'
import { metricasPorCampanha } from './captacao'
import { calcularOcupacao } from './processos'

const router = Router()
const LEITURA = ['ADMISSIONS', 'MARKETING', 'COORDINATOR', 'SECRETARY', 'FINANCE'] as const

const toFunil = (l: Array<{ status: string; etapaMaxima: number }>) => calcularFunil(l.map((c) => ({ status: c.status as StatusCandidato, etapaMaxima: c.etapaMaxima })))

// Funil e conversão por etapa, com recortes por curso (oferta) e por campanha
router.get('/relatorios/funil', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const processoId = qs(req.query.processoId)
  const cands = await prisma.admCandidato.findMany({ where: { tenantId, ...(processoId ? { processoId } : {}) }, select: { status: true, etapaMaxima: true, ofertaId: true, ofertaAlocadaId: true, campanhaId: true, origem: true } })
  const grupo = <K extends string>(chave: (c: (typeof cands)[number]) => K | null | undefined) => {
    const m = new Map<string, typeof cands>()
    for (const c of cands) { const k = chave(c) ?? 'SEM_INFORMACAO'; m.set(k, [...(m.get(k) ?? []), c]) }
    return m
  }
  const ofertas = await prisma.admOferta.findMany({ where: { tenantId, ...(processoId ? { processoId } : {}) }, select: { id: true, nomeCurso: true, turno: true, modalidade: true } })
  const camps = await prisma.admCampanha.findMany({ where: { tenantId }, select: { id: true, nome: true, canal: true } })
  res.json({
    geral: toFunil(cands),
    porCurso: [...grupo((c) => c.ofertaAlocadaId ?? c.ofertaId).entries()].map(([id, l]) => {
      const o = ofertas.find((x) => x.id === id)
      return { ofertaId: id, curso: o?.nomeCurso ?? null, turno: o?.turno, modalidade: o?.modalidade, funil: toFunil(l) }
    }),
    porCampanha: [...grupo((c) => c.campanhaId).entries()].map(([id, l]) => ({ campanhaId: id, campanha: camps.find((x) => x.id === id)?.nome ?? null, canal: camps.find((x) => x.id === id)?.canal ?? null, funil: toFunil(l) })),
    porOrigem: [...grupo((c) => c.origem).entries()].map(([origem, l]) => ({ origem, funil: toFunil(l) })),
  })
}))

router.get('/relatorios/vagas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const processoId = qs(req.query.processoId)
  const processos = await prisma.admProcessoSeletivo.findMany({ where: { tenantId, ...(processoId ? { id: processoId } : { status: { not: 'CANCELADO' } }) }, select: { id: true, nome: true, status: true }, orderBy: { inscricaoInicio: 'desc' }, take: 50 })
  const out: any[] = []
  for (const p of processos) {
    const ofertas = await calcularOcupacao(tenantId, p.id)
    const vagas = ofertas.reduce((s, o) => s + o.vagas, 0)
    const matriculados = ofertas.reduce((s, o) => s + o.matriculados, 0)
    out.push({ processoId: p.id, processo: p.nome, status: p.status, vagasOfertadas: vagas, vagasOcupadas: matriculados, ocupacaoPct: vagas ? Math.round((matriculados / vagas) * 1000) / 10 : null, ofertas })
  }
  res.json(out)
}))

router.get('/relatorios/campanhas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await metricasPorCampanha(getTenantId(req), { processoId: qs(req.query.processoId) }))
}))

// Painel resumido
router.get('/relatorios/painel', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const agora = new Date()
  const [porStatus, processosAbertos, followUpsVencidos, convocacoesPendentes, matriculasPendentes, rematriculasAbertas] = await Promise.all([
    prisma.admCandidato.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    prisma.admProcessoSeletivo.count({ where: { tenantId, status: 'ABERTO' } }),
    prisma.admCandidato.count({ where: { tenantId, proximoContatoEm: { lte: agora }, status: { notIn: ['MATRICULADO', 'DESISTENTE', 'REPROVADO'] } } }),
    prisma.admConvocacao.count({ where: { tenantId, status: 'CONVOCADO' } }),
    prisma.admMatricula.count({ where: { tenantId, status: { in: ['PENDENTE_DOCUMENTOS', 'DOCUMENTOS_OK'] } } }),
    prisma.admRematriculaCampanha.count({ where: { tenantId, status: 'ABERTA' } }),
  ])
  res.json({ candidatosPorStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count])), processosAbertos, followUpsVencidos, convocacoesPendentes, matriculasPendentes, rematriculasAbertas })
}))

export default router
