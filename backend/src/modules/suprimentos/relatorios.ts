import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { DAY, round2 } from './logic'

const ROLES = ['SUPPLIES', 'FINANCE', 'COORDINATOR'] as const
const periodo = (req: AuthenticatedRequest) => ({
  de: qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(Date.now() - 180 * DAY),
  ate: qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(),
})

export function registerRelatorios(router: Router) {
  // Gasto (compras recebidas) por categoria, curso e fornecedor.
  router.get('/relatorios/gasto', requireRole(...ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req)
    const recs = await prisma.supRecebimento.findMany({ where: { tenantId, dataRecebimento: { gte: de, lte: ate } }, include: { itens: true, pedido: { include: { itens: true } } } })
    const itensDb = await prisma.supItem.findMany({ where: { tenantId }, include: { categoria: true } })
    const cat: Record<string, number> = {}, curso: Record<string, number> = {}, forn: Record<string, number> = {}, lab: Record<string, number> = {}
    let total = 0
    for (const r of recs) {
      for (const ri of r.itens) {
        const pi = r.pedido.itens.find((x) => x.id === ri.pedidoItemId)
        if (!pi) continue
        const v = ri.quantidadeRecebida * pi.precoUnitario
        const c = itensDb.find((i) => i.id === ri.itemId)?.categoria?.nome ?? 'Sem categoria'
        cat[c] = round2((cat[c] ?? 0) + v)
        const k = r.pedido.cursoId ?? 'sem-curso'
        curso[k] = round2((curso[k] ?? 0) + v)
        const l = r.pedido.laboratorioId ?? 'sem-laboratorio'
        lab[l] = round2((lab[l] ?? 0) + v)
        forn[r.pedido.fornecedorId] = round2((forn[r.pedido.fornecedorId] ?? 0) + v)
        total += v
      }
    }
    const fs = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: Object.keys(forn) } }, select: { id: true, razaoSocial: true } })
    const sort = (o: Record<string, number>) => Object.entries(o).map(([chave, valor]) => ({ chave, valor })).sort((a, b) => b.valor - a.valor)
    res.json({ periodo: { de, ate }, total: round2(total), porCategoria: sort(cat), porCurso: sort(curso), porLaboratorio: sort(lab), porFornecedor: sort(forn).map((f) => ({ ...f, fornecedor: fs.find((x) => x.id === f.chave)?.razaoSocial })) })
  }))

  // Prazo médio de entrega (emissão -> recebimento total) e pontualidade por fornecedor.
  router.get('/relatorios/prazo-entrega', requireRole(...ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req)
    const ps = await prisma.supPedido.findMany({ where: { tenantId, status: 'RECEBIDO', emitidoEm: { not: null }, recebidoEm: { gte: de, lte: ate } }, include: { fornecedor: { select: { razaoSocial: true } } } })
    const g = new Map<string, { fornecedor: string; pedidos: number; somaDias: number; noPrazo: number; comPrevisao: number }>()
    let soma = 0
    for (const p of ps) {
      const dias = (p.recebidoEm!.getTime() - p.emitidoEm!.getTime()) / DAY
      soma += dias
      const x = g.get(p.fornecedorId) ?? { fornecedor: p.fornecedor.razaoSocial, pedidos: 0, somaDias: 0, noPrazo: 0, comPrevisao: 0 }
      x.pedidos++; x.somaDias += dias
      if (p.previsaoEntrega) { x.comPrevisao++; if (p.recebidoEm!.getTime() <= p.previsaoEntrega.getTime() + DAY) x.noPrazo++ }
      g.set(p.fornecedorId, x)
    }
    res.json({ periodo: { de, ate }, pedidos: ps.length, prazoMedioDias: ps.length ? round2(soma / ps.length) : null,
      porFornecedor: [...g].map(([fornecedorId, x]) => ({ fornecedorId, fornecedor: x.fornecedor, pedidos: x.pedidos, prazoMedioDias: round2(x.somaDias / x.pedidos), pontualidade: x.comPrevisao ? round2((x.noPrazo / x.comPrevisao) * 100) : null })).sort((a, b) => a.prazoMedioDias - b.prazoMedioDias) })
  }))

  // Economia obtida nas cotações (referência − valor escolhido).
  router.get('/relatorios/economia-cotacoes', requireRole(...ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { de, ate } = periodo(req)
    const cs = await prisma.supCotacao.findMany({ where: { tenantId, status: 'ENCERRADA', encerradaEm: { gte: de, lte: ate } }, orderBy: { encerradaEm: 'desc' } })
    const porMes: Record<string, number> = {}
    let economia = 0, gasto = 0
    for (const c of cs) {
      economia += c.economia ?? 0; gasto += c.valorEscolhido ?? 0
      const m = c.encerradaEm!.toISOString().slice(0, 7)
      porMes[m] = round2((porMes[m] ?? 0) + (c.economia ?? 0))
    }
    res.json({ periodo: { de, ate }, cotacoes: cs.length, valorContratado: round2(gasto), economiaTotal: round2(economia), percentual: gasto + economia > 0 ? round2((economia / (gasto + economia)) * 100) : 0, porMes, cotacoesDetalhe: cs.map((c) => ({ id: c.id, numero: c.numero, valorEscolhido: c.valorEscolhido, economia: c.economia })) })
  }))

  // Painel geral
  router.get('/dashboard', requireRole(...ROLES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const [reqPend, cotAbertas, pedAbertos, pedAtrasados, contratosVencendo, docsVencendo, valorEstoque, itensMin] = await Promise.all([
      prisma.supRequisicao.count({ where: { tenantId, status: 'AGUARDANDO_APROVACAO' } }),
      prisma.supCotacao.count({ where: { tenantId, status: 'ABERTA' } }),
      prisma.supPedido.count({ where: { tenantId, status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO'] } } }),
      prisma.supPedido.count({ where: { tenantId, status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO'] }, previsaoEntrega: { lt: new Date() } } }),
      prisma.supContrato.count({ where: { tenantId, status: { in: ['VIGENTE', 'A_VENCER'] }, vigenciaFim: { lte: new Date(Date.now() + 90 * DAY) } } }),
      prisma.supFornecedorDocumento.count({ where: { tenantId, validade: { lte: new Date(Date.now() + 30 * DAY) } } }),
      prisma.supSaldo.findMany({ where: { tenantId, quantidade: { gt: 0 } }, select: { quantidade: true, custoMedio: true } }),
      prisma.supSaldo.findMany({ where: { tenantId }, select: { itemId: true, quantidade: true, item: { select: { estoqueMinimo: true } } } }),
    ])
    const abaixo = new Set(itensMin.filter((s) => s.item.estoqueMinimo > 0 && s.quantidade <= s.item.estoqueMinimo).map((s) => s.itemId)).size
    res.json({ requisicoesAguardandoAprovacao: reqPend, cotacoesAbertas: cotAbertas, pedidosEmAberto: pedAbertos, pedidosAtrasados: pedAtrasados, contratosVencendo90d: contratosVencendo, documentosFornecedorVencendo30d: docsVencendo, valorEstoque: round2(valorEstoque.reduce((s, x) => s + x.quantidade * x.custoMedio, 0)), itensAbaixoDoMinimo: abaixo })
  }))
}
