import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { custoPorM2, disponibilidadePct, mttrHoras, situacaoSla } from './calc'
import { LEITURA, money, parseDateQ } from './util'

export async function calcularIndicadores(tenantId: string, de: Date, ate: Date) {
  const [bensAtivos, osPeriodo, osAbertas, chamados, spaces] = await Promise.all([
    prisma.infBem.count({ where: { tenantId, status: { not: 'BAIXADO' } } }),
    prisma.infOrdemServico.findMany({ where: { tenantId, status: { not: 'CANCELADA' }, abertaEm: { lte: ate }, OR: [{ concluidaEm: null }, { concluidaEm: { gte: de } }] } }),
    prisma.infOrdemServico.findMany({ where: { tenantId, status: { in: ['ABERTA', 'AGENDADA', 'EM_EXECUCAO', 'AGUARDANDO_PECA'] } } }),
    prisma.infChamado.findMany({ where: { tenantId, createdAt: { gte: de, lte: ate } } }),
    prisma.eduSpace.findMany({ where: { tenantId, ativo: true }, select: { id: true, nome: true, areaM2: true } }),
  ])
  const agora = new Date()
  const concluidasPeriodo = osPeriodo.filter((o) => o.concluidaEm && o.concluidaEm >= de && o.concluidaEm <= ate)
  const custo = (os: any[]) => os.reduce((s, o) => s + o.custoMaoObra + o.custoPecas, 0)
  const custoTotal = custo(concluidasPeriodo)
  const areaTotal = spaces.reduce((s, x) => s + (x.areaM2 ?? 0), 0)

  const porPrioridade: Record<string, number> = {}
  for (const o of osAbertas) porPrioridade[o.prioridade] = (porPrioridade[o.prioridade] ?? 0) + 1
  const vencidas = osAbertas.filter((o) => o.prazoSla < agora)
  const idadeMediaDias = osAbertas.length ? money(osAbertas.reduce((s, o) => s + (agora.getTime() - o.abertaEm.getTime()), 0) / osAbertas.length / 86_400_000) : 0
  const slaAvaliadas = concluidasPeriodo.map((o) => situacaoSla(o.abertaEm, o.prazoSla, o.concluidaEm))
  const slaCumpridoPct = slaAvaliadas.length ? money((slaAvaliadas.filter((s) => s === 'CUMPRIDO').length / slaAvaliadas.length) * 100) : null

  const preventivas = osPeriodo.filter((o) => o.tipo === 'PREVENTIVA').length
  const corretivasPorBem: Record<string, number> = {}
  for (const o of osPeriodo) if (o.tipo === 'CORRETIVA' && o.bemId) corretivasPorBem[o.bemId] = (corretivasPorBem[o.bemId] ?? 0) + 1
  const topIds = Object.entries(corretivasPorBem).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topBens = topIds.length ? await prisma.infBem.findMany({ where: { tenantId, id: { in: topIds.map((t) => t[0]) } }, select: { id: true, tombamento: true, descricao: true } }) : []

  // custo/m² por espaço (somente espaços com área)
  const custoPorEspaco: Record<string, number> = {}
  for (const o of concluidasPeriodo) if (o.spaceId) custoPorEspaco[o.spaceId] = (custoPorEspaco[o.spaceId] ?? 0) + o.custoMaoObra + o.custoPecas
  const espacosCusto = spaces.filter((s) => s.areaM2 && custoPorEspaco[s.id]).map((s) => ({ spaceId: s.id, nome: s.nome, areaM2: s.areaM2, custo: money(custoPorEspaco[s.id]), custoPorM2: custoPorM2(custoPorEspaco[s.id], s.areaM2!) })).sort((a, b) => (b.custoPorM2 ?? 0) - (a.custoPorM2 ?? 0)).slice(0, 10)

  const resolvidos = chamados.filter((c) => c.resolvidoEm)
  const notas = chamados.filter((c) => c.avaliacaoNota != null).map((c) => c.avaliacaoNota as number)
  return {
    periodo: { de, ate },
    disponibilidadeAtivosPct: disponibilidadePct(osPeriodo.map((o) => ({ abertaEm: o.abertaEm, concluidaEm: o.concluidaEm, tipo: o.tipo, status: o.status, bemParado: o.bemParado, bemId: o.bemId })), de, ate, bensAtivos),
    mttrHoras: mttrHoras(concluidasPeriodo.map((o) => ({ abertaEm: o.abertaEm, concluidaEm: o.concluidaEm, tipo: o.tipo, status: o.status }))),
    backlog: { osAbertas: osAbertas.length, porPrioridade, vencidasSla: vencidas.length, idadeMediaDias },
    slaCumpridoPct,
    custoManutencao: { total: money(custoTotal), maoDeObra: money(concluidasPeriodo.reduce((s, o) => s + o.custoMaoObra, 0)), pecas: money(concluidasPeriodo.reduce((s, o) => s + o.custoPecas, 0)), areaTotalM2: money(areaTotal), custoPorM2: custoPorM2(custoTotal, areaTotal), espacosMaisCaros: espacosCusto },
    preventivaPct: osPeriodo.length ? money((preventivas / osPeriodo.length) * 100) : null,
    reincidencia: topBens.map((b) => ({ ...b, corretivas: corretivasPorBem[b.id] })).sort((a, b) => b.corretivas - a.corretivas),
    chamados: { abertosNoPeriodo: chamados.length, resolvidos: resolvidos.length, tempoMedioResolucaoHoras: resolvidos.length ? money(resolvidos.reduce((s, c) => s + (c.resolvidoEm!.getTime() - c.createdAt.getTime()), 0) / resolvidos.length / 3_600_000) : null, satisfacaoMedia: notas.length ? money(notas.reduce((a, b) => a + b, 0) / notas.length) : null },
    bensAtivos,
  }
}

export function mountIndicadores(router: Router) {
  router.get(
    '/indicadores',
    requireRole(...LEITURA),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const ate = parseDateQ(req.query.ate, new Date())
      const de = parseDateQ(req.query.de, new Date(ate.getTime() - 90 * 86_400_000))
      if (de >= ate) return res.status(400).json({ error: 'Período inválido (de >= ate).' })
      res.json(await calcularIndicadores(getTenantId(req), de, ate))
    }),
  )
}
