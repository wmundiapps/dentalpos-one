import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, pageParams, qs } from '../core/crud'
import { scheduleReminder } from '../core/reminders'
import { audit } from '../core/notify'
import { LEITURA, GESTAO } from './catalogo'
import { consumoDiarioMedio, curvaABC, DAY, quantidadesKit, round2, round3, statusValidade, sugerirReposicao } from './logic'
import { checarEstoqueMinimo, movimentar, movimentarTx, proximoNumero } from './stock'

const mod = 'suprimentos'
const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })
const dataIni = (s?: string) => (s ? new Date(s) : undefined)

// Calcula a lista de sugestões de reposição para o tenant (usada pela rota e pelo job).
export async function calcularReposicao(tenantId: string, almoxarifadoId?: string, diasConsumo = 90) {
  const itens = await prisma.supItem.findMany({ where: { tenantId, ativo: true } })
  if (!itens.length) return []
  const desde = new Date(Date.now() - diasConsumo * DAY)
  const [saldos, saidas, emPedido] = await Promise.all([
    prisma.supSaldo.groupBy({ by: ['itemId'], where: { tenantId, ...(almoxarifadoId ? { almoxarifadoId } : {}) }, _sum: { quantidade: true } }),
    prisma.supMovimentacao.groupBy({ by: ['itemId'], where: { tenantId, tipo: { in: ['SAIDA'] }, createdAt: { gte: desde }, ...(almoxarifadoId ? { almoxarifadoId } : {}) }, _sum: { quantidade: true } }),
    prisma.supPedidoItem.findMany({ where: { tenantId, pedido: { status: { in: ['EMITIDO', 'PARCIALMENTE_RECEBIDO', 'RASCUNHO'] } } }, select: { itemId: true, quantidade: true, quantidadeRecebida: true, pedido: { select: { status: true } } } }),
  ])
  const sMap = new Map(saldos.map((s) => [s.itemId, s._sum.quantidade ?? 0]))
  const cMap = new Map(saidas.map((s) => [s.itemId, consumoDiarioMedio([{ quantidade: s._sum.quantidade ?? 0 }], diasConsumo)]))
  const pMap = new Map<string, number>()
  for (const p of emPedido) if (p.pedido.status !== 'RASCUNHO') pMap.set(p.itemId, (pMap.get(p.itemId) ?? 0) + Math.max(p.quantidade - p.quantidadeRecebida, 0))
  return sugerirReposicao(itens.map((i) => ({
    itemId: i.id, nome: i.nome, saldo: sMap.get(i.id) ?? 0, minimo: i.estoqueMinimo, maximo: i.estoqueMaximo, pontoPedido: i.pontoPedido,
    consumoDiario: cMap.get(i.id) ?? 0, leadTimeDias: i.leadTimeDias, emPedido: pMap.get(i.id) ?? 0,
  })))
}

export function registerEstoque(router: Router) {
  // ---------- Saldos, movimentações e lotes ----------
  router.get('/estoque/saldos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const alm = qs(req.query.almoxarifadoId), it = qs(req.query.itemId)
    if (alm) where.almoxarifadoId = alm
    if (it) where.itemId = it
    const q = qs(req.query.q)
    if (q) where.item = { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }] }
    const [rows, total] = await Promise.all([prisma.supSaldo.findMany({ where, include: { item: true, almoxarifado: { select: { nome: true, codigo: true } } }, orderBy: { updatedAt: 'desc' }, skip, take }), prisma.supSaldo.count({ where })])
    let items = rows.map((r) => ({ ...r, valorTotal: round2(r.quantidade * r.custoMedio), abaixoMinimo: r.item.estoqueMinimo > 0 && r.quantidade <= r.item.estoqueMinimo }))
    if (qs(req.query.abaixoMinimo) === 'true') items = items.filter((i) => i.abaixoMinimo)
    res.json({ items, total, page, pageSize })
  }))

  router.get('/estoque/movimentacoes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['tipo', 'itemId', 'almoxarifadoId', 'cursoId', 'laboratorioId', 'centroCustoId', 'origemTipo', 'origemId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = dataIni(qs(req.query.de)), ate = dataIni(qs(req.query.ate))
    if (de || ate) where.createdAt = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) }
    const [items, total] = await Promise.all([prisma.supMovimentacao.findMany({ where, include: { item: { select: { codigo: true, nome: true, unidade: true } } }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.supMovimentacao.count({ where })])
    res.json({ items, total, page, pageSize })
  }))

  const movSchema = z.object({
    tipo: z.enum(['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'AJUSTE', 'PERDA']),
    itemId: z.string(), almoxarifadoId: z.string(), almoxarifadoDestinoId: z.string().optional(),
    quantidade: z.coerce.number().positive(), sentido: z.union([z.literal(1), z.literal(-1)]).optional(),
    custoUnitario: z.coerce.number().min(0).optional(), loteNumero: z.string().optional(), validade: dateISO().optional(),
    cursoId: z.string().optional(), laboratorioId: z.string().optional(), centroCustoId: z.string().optional(), classSectionId: z.string().optional(),
    motivo: z.string().optional(),
  })
  router.post('/estoque/movimentacoes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(movSchema, req.body)
    if (['AJUSTE', 'PERDA'].includes(d.tipo) && !d.motivo) throw httpErr(400, 'Informe o motivo para ajuste/perda.')
    if (d.tipo === 'AJUSTE' && !d.sentido) throw httpErr(400, 'Informe o sentido do ajuste (1 aumenta, -1 reduz).')
    if (d.tipo === 'ENTRADA' && d.custoUnitario == null) throw httpErr(400, 'Informe o custo unitário da entrada.')
    const mv = await movimentar({ ...d, tenantId, origemTipo: 'MANUAL', userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: `MOV_${d.tipo}`, refType: 'SupItem', refId: d.itemId, detalhes: { quantidade: d.quantidade, motivo: d.motivo } })
    res.status(201).json(mv)
  }))

  router.get('/estoque/lotes', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const dias = qs(req.query.vencendoEmDias)
    const where: any = { tenantId, quantidade: { gt: 0 } }
    if (qs(req.query.almoxarifadoId)) where.almoxarifadoId = qs(req.query.almoxarifadoId)
    if (qs(req.query.itemId)) where.itemId = qs(req.query.itemId)
    if (dias) where.validade = { lte: new Date(Date.now() + parseInt(dias, 10) * DAY) }
    const lotes = await prisma.supLote.findMany({ where, include: { item: { select: { codigo: true, nome: true, unidade: true } } }, orderBy: { validade: 'asc' }, take: 500 })
    res.json(lotes.map((l) => ({ ...l, statusValidade: statusValidade(l.validade) })))
  }))

  // ---------- Reposição e Curva ABC ----------
  router.get('/estoque/reposicao', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(await calcularReposicao(getTenantId(req), qs(req.query.almoxarifadoId), parseInt(qs(req.query.diasConsumo) || '90', 10) || 90))
  }))

  router.post('/estoque/reposicao/gerar-requisicao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string().optional(), centroCustoId: z.string().optional(), itemIds: z.array(z.string()).optional() }), req.body ?? {})
    let sug = await calcularReposicao(tenantId, d.almoxarifadoId)
    if (d.itemIds?.length) sug = sug.filter((s) => d.itemIds!.includes(s.itemId))
    if (!sug.length) throw httpErr(409, 'Nenhum item precisa de reposição.')
    const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: sug.map((s) => s.itemId) } } })
    const r = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'REQ')
      const lin = sug.map((s) => { const it = itens.find((i) => i.id === s.itemId)!; return { tenantId, itemId: it.id, descricao: it.nome, unidade: it.unidade, quantidade: s.quantidadeSugerida, precoEstimado: it.precoReferencia ?? (it.custoMedio > 0 ? it.custoMedio : null) } })
      return tx.supRequisicao.create({ data: { tenantId, numero, tipo: 'COMPRA', solicitanteUserId: getUserId(req), almoxarifadoId: d.almoxarifadoId, centroCustoId: d.centroCustoId, justificativa: 'Reposição automática (ponto de pedido)', urgencia: sug.some((s) => s.prioridade === 'CRITICA') ? 'ALTA' : 'NORMAL', valorEstimado: round2(lin.reduce((s, i) => s + i.quantidade * (i.precoEstimado ?? 0), 0)), itens: { create: lin } }, include: { itens: true } })
    })
    res.status(201).json(r)
  }))

  router.get('/estoque/curva-abc', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const base = qs(req.query.base) === 'ESTOQUE' ? 'ESTOQUE' : 'CONSUMO'
    const dias = parseInt(qs(req.query.dias) || '180', 10) || 180
    const alm = qs(req.query.almoxarifadoId)
    let linhas: Array<{ id: string; valor: number }> = []
    if (base === 'CONSUMO') {
      const g = await prisma.supMovimentacao.groupBy({ by: ['itemId'], where: { tenantId, tipo: 'SAIDA', createdAt: { gte: new Date(Date.now() - dias * DAY) }, ...(alm ? { almoxarifadoId: alm } : {}) }, _sum: { valorTotal: true } })
      linhas = g.map((x) => ({ id: x.itemId, valor: x._sum.valorTotal ?? 0 }))
    } else {
      const s = await prisma.supSaldo.findMany({ where: { tenantId, ...(alm ? { almoxarifadoId: alm } : {}) } })
      const m = new Map<string, number>()
      for (const x of s) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.quantidade * x.custoMedio)
      linhas = [...m].map(([id, valor]) => ({ id, valor }))
    }
    const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: linhas.map((l) => l.id) } }, select: { id: true, codigo: true, nome: true } })
    const abc = curvaABC(linhas.map((l) => ({ ...l, valor: round2(l.valor) }))).map((l) => ({ ...l, ...(itens.find((i) => i.id === l.id) ?? {}) }))
    res.json({ base, dias, totais: { A: abc.filter((x) => x.classe === 'A').length, B: abc.filter((x) => x.classe === 'B').length, C: abc.filter((x) => x.classe === 'C').length }, itens: abc })
  }))

  // ---------- Consumo por curso / laboratório / centro de custo ----------
  router.get('/estoque/consumo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const por = (['cursoId', 'laboratorioId', 'centroCustoId'].includes(qs(req.query.por) ?? '') ? qs(req.query.por) : 'cursoId') as 'cursoId' | 'laboratorioId' | 'centroCustoId'
    const de = dataIni(qs(req.query.de)), ate = dataIni(qs(req.query.ate))
    const g = await prisma.supMovimentacao.groupBy({ by: [por], where: { tenantId, tipo: { in: ['SAIDA', 'PERDA'] }, ...(de || ate ? { createdAt: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}) }, _sum: { valorTotal: true, quantidade: true }, _count: true })
    res.json(g.map((x) => ({ [por]: x[por] ?? null, valorTotal: round2(x._sum.valorTotal ?? 0), quantidade: round3(x._sum.quantidade ?? 0), movimentacoes: x._count })).sort((a, b) => b.valorTotal - a.valorTotal))
  }))

  // ---------- Inventário (geral e rotativo) ----------
  router.post('/inventarios', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string(), tipo: z.enum(['ROTATIVO', 'GERAL']).default('ROTATIVO'), quantidade: z.coerce.number().int().min(1).max(500).default(20), itemIds: z.array(z.string()).optional(), observacao: z.string().optional() }), req.body)
    const alm = await prisma.supAlmoxarifado.findFirst({ where: { id: d.almoxarifadoId, tenantId, ativo: true } })
    if (!alm) throw httpErr(404, 'Almoxarifado não encontrado.')
    const aberto = await prisma.supInventario.findFirst({ where: { tenantId, almoxarifadoId: alm.id, status: { in: ['ABERTO', 'CONTAGEM_FINALIZADA'] } } })
    if (aberto) throw httpErr(409, 'Já existe inventário em andamento neste almoxarifado.')
    let saldos = await prisma.supSaldo.findMany({ where: { tenantId, almoxarifadoId: alm.id, ...(d.itemIds ? { itemId: { in: d.itemIds } } : {}) } })
    if (d.tipo === 'ROTATIVO' && !d.itemIds) {
      const recentes = await prisma.supInventarioItem.findMany({ where: { tenantId, inventario: { almoxarifadoId: alm.id, status: { not: 'CANCELADO' }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }, select: { itemId: true } })
      const ex = new Set(recentes.map((r) => r.itemId))
      saldos = saldos.filter((s) => !ex.has(s.itemId)).sort((a, b) => b.quantidade * b.custoMedio - a.quantidade * a.custoMedio).slice(0, d.quantidade)   // maior valor primeiro (itens A)
    }
    if (!saldos.length) throw httpErr(409, 'Nenhum item elegível para inventariar.')
    const inv = await prisma.supInventario.create({ data: { tenantId, almoxarifadoId: alm.id, tipo: d.tipo, observacao: d.observacao, abertoPorId: getUserId(req), itens: { create: saldos.map((s) => ({ tenantId, itemId: s.itemId, quantidadeSistema: s.quantidade })) } }, include: { itens: true } })
    await scheduleReminder({ tenantId, modulo: mod, refType: 'SupInventario', refId: inv.id, dedupeKey: `sup-inv-${inv.id}`, titulo: `Concluir inventário ${d.tipo.toLowerCase()} — ${alm.nome}`, dueAt: new Date(Date.now() + 5 * DAY), assigneeRole: 'SUPPLIES', severity: 'INFO' })
    res.status(201).json(inv)
  }))
  router.get('/inventarios', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    res.json(await prisma.supInventario.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }))
  }))
  router.get('/inventarios/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const inv = await prisma.supInventario.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { itens: true } })
    if (!inv) return res.status(404).json({ error: 'Inventário não encontrado.' })
    res.json(inv)
  }))
  router.put('/inventarios/:id/contagem', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ itens: z.array(z.object({ itemId: z.string(), quantidadeContada: z.coerce.number().min(0), observacao: z.string().optional() })).min(1) }), req.body)
    const inv = await prisma.supInventario.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    if (inv.status !== 'ABERTO') throw httpErr(409, 'Contagem só pode ser alterada em inventário ABERTO.')
    for (const l of d.itens) {
      const it = await prisma.supInventarioItem.findUnique({ where: { inventarioId_itemId: { inventarioId: inv.id, itemId: l.itemId } } })
      if (!it) throw httpErr(404, `Item ${l.itemId} não faz parte deste inventário.`)
      await prisma.supInventarioItem.update({ where: { id: it.id }, data: { quantidadeContada: l.quantidadeContada, diferenca: round3(l.quantidadeContada - it.quantidadeSistema), observacao: l.observacao } })
    }
    res.json(await prisma.supInventario.findFirst({ where: { id: inv.id }, include: { itens: true } }))
  }))
  router.post('/inventarios/:id/finalizar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.supInventario.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    if (inv.status !== 'ABERTO') throw httpErr(409, 'Inventário não está aberto.')
    const faltam = inv.itens.filter((i) => i.quantidadeContada == null)
    if (faltam.length) throw httpErr(409, `${faltam.length} item(ns) sem contagem.`)
    const up = await prisma.supInventario.update({ where: { id: inv.id }, data: { status: 'CONTAGEM_FINALIZADA', finalizadoEm: new Date() }, include: { itens: true } })
    res.json({ ...up, divergencias: up.itens.filter((i) => Math.abs(i.diferenca ?? 0) > 1e-9).length })
  }))
  // Aplica as diferenças como movimentações AJUSTE (delta sobre o saldo atual, preservando movimentos feitos durante a contagem).
  router.post('/inventarios/:id/ajustar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const inv = await prisma.supInventario.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!inv) throw httpErr(404, 'Inventário não encontrado.')
    if (inv.status !== 'CONTAGEM_FINALIZADA') throw httpErr(409, 'Finalize a contagem antes de ajustar.')
    const afetados: string[] = []
    await prisma.$transaction(async (tx) => {
      for (const i of inv.itens) {
        const dif = i.diferenca ?? 0
        if (Math.abs(dif) > 1e-9) {
          await movimentarTx(tx, { tenantId, tipo: 'AJUSTE', sentido: dif > 0 ? 1 : -1, itemId: i.itemId, almoxarifadoId: inv.almoxarifadoId, quantidade: Math.abs(dif), origemTipo: 'INVENTARIO', origemId: inv.id, motivo: `Ajuste de inventário ${inv.tipo}`, userId: getUserId(req) })
          afetados.push(i.itemId)
        }
        await tx.supInventarioItem.update({ where: { id: i.id }, data: { ajustado: true } })
      }
      await tx.supInventario.update({ where: { id: inv.id }, data: { status: 'AJUSTADO', ajustadoEm: new Date() } })
    }, { timeout: 60_000 })
    await checarEstoqueMinimo(tenantId, afetados)
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'AJUSTAR_INVENTARIO', refType: 'SupInventario', refId: inv.id, detalhes: { ajustes: afetados.length } })
    res.json({ ajustados: afetados.length })
  }))
  router.post('/inventarios/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.supInventario.updateMany({ where: { id: String(req.params.id), tenantId, status: { in: ['ABERTO', 'CONTAGEM_FINALIZADA'] } }, data: { status: 'CANCELADO' } })
    if (!r.count) throw httpErr(409, 'Inventário não pode ser cancelado.')
    res.json({ ok: true })
  }))

  // ---------- Kits de aula prática ----------
  const kitSchema = z.object({
    nome: z.string().min(2), disciplineId: z.string().optional().nullable(), laboratorioId: z.string().optional().nullable(), descricao: z.string().optional().nullable(),
    itens: z.array(z.object({ itemId: z.string(), quantidadeFixa: z.coerce.number().min(0).default(0), quantidadePorAluno: z.coerce.number().min(0).default(0) }).refine((i) => i.quantidadeFixa > 0 || i.quantidadePorAluno > 0, { message: 'Informe quantidade fixa ou por aluno' })).min(1),
  })
  const checkItens = async (tenantId: string, ids: string[]) => {
    const n = await prisma.supItem.count({ where: { tenantId, id: { in: ids } } })
    if (n !== new Set(ids).size) throw httpErr(404, 'Há itens do kit inexistentes no catálogo.')
  }
  router.post('/kits', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(kitSchema, req.body)
    await checkItens(tenantId, d.itens.map((i) => i.itemId))
    if (d.disciplineId && !(await prisma.discipline.findFirst({ where: { id: d.disciplineId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Disciplina não encontrada.')
    const { itens, ...cab } = d
    res.status(201).json(await prisma.supKit.create({ data: { ...cab, tenantId, itens: { create: itens.map((i) => ({ ...i, tenantId })) } }, include: { itens: true } }))
  }))
  router.put('/kits/:id', requireRole(...GESTAO, 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(kitSchema.partial().extend({ ativo: z.boolean().optional() }), req.body)
    const k = await prisma.supKit.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!k) throw httpErr(404, 'Kit não encontrado.')
    const { itens, ...cab } = d
    if (itens) await checkItens(tenantId, itens.map((i) => i.itemId))
    const up = await prisma.$transaction(async (tx) => {
      if (itens) { await tx.supKitItem.deleteMany({ where: { kitId: k.id } }); await tx.supKitItem.createMany({ data: itens.map((i) => ({ ...i, tenantId, kitId: k.id })) }) }
      return tx.supKit.update({ where: { id: k.id }, data: cab, include: { itens: true } })
    })
    res.json(up)
  }))
  router.get('/kits', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['disciplineId', 'laboratorioId', 'ativo']) { const v = qs((req.query as any)[f]); if (v) where[f] = v === 'true' ? true : v === 'false' ? false : v }
    res.json(await prisma.supKit.findMany({ where, include: { itens: true }, orderBy: { nome: 'asc' } }))
  }))
  router.get('/kits/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const k = await prisma.supKit.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { itens: true } })
    if (!k) return res.status(404).json({ error: 'Kit não encontrado.' })
    res.json(k)
  }))
  router.delete('/kits/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await prisma.supKit.updateMany({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, data: { ativo: false } })
    res.status(204).end()
  }))

  async function alunosDaTurma(tenantId: string, classSectionId?: string | null) {
    if (!classSectionId) return null
    const cs = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId }, select: { id: true } })
    if (!cs) throw httpErr(404, 'Turma não encontrada.')
    return prisma.classSectionEnrollment.count({ where: { classSectionId } })
  }

  router.get('/kits/:id/disponibilidade', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const k = await prisma.supKit.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!k) throw httpErr(404, 'Kit não encontrado.')
    const n = parseInt(qs(req.query.numeroAlunos) || '', 10) || (await alunosDaTurma(tenantId, qs(req.query.classSectionId))) || 0
    const alm = qs(req.query.almoxarifadoId)
    const need = quantidadesKit(k.itens, n, parseInt(qs(req.query.aulas) || '1', 10) || 1)
    const saldos = await prisma.supSaldo.groupBy({ by: ['itemId'], where: { tenantId, ...(alm ? { almoxarifadoId: alm } : {}), itemId: { in: need.map((x) => x.itemId) } }, _sum: { quantidade: true } })
    const linhas = need.map((x) => { const disp = saldos.find((s) => s.itemId === x.itemId)?._sum.quantidade ?? 0; return { ...x, disponivel: round3(disp), faltante: round3(Math.max(x.quantidade - disp, 0)) } })
    res.json({ numeroAlunos: n, suficiente: linhas.every((l) => l.faltante === 0), itens: linhas })
  }))

  // Baixa automática do kit por turma/aula.
  router.post('/kits/:id/consumir', requireRole(...GESTAO, 'TEACHER', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string(), classSectionId: z.string().optional(), classSessionId: z.string().optional(), numeroAlunos: z.coerce.number().int().min(0).optional(), multiplicador: z.coerce.number().positive().default(1), cursoId: z.string().optional(), laboratorioId: z.string().optional() }), req.body)
    const k = await prisma.supKit.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true }, include: { itens: true } })
    if (!k) throw httpErr(404, 'Kit não encontrado ou inativo.')
    if (d.classSessionId) {
      const dup = await prisma.supKitConsumo.findFirst({ where: { tenantId, kitId: k.id, classSessionId: d.classSessionId } })
      if (dup) throw httpErr(409, 'O kit já foi baixado para esta aula.')
    }
    const n = d.numeroAlunos ?? (await alunosDaTurma(tenantId, d.classSectionId))
    if (n == null) throw httpErr(400, 'Informe numeroAlunos ou a turma (classSectionId).')
    const need = quantidadesKit(k.itens, n, d.multiplicador)
    const lab = d.laboratorioId ?? k.laboratorioId ?? undefined
    const consumo = await prisma.$transaction(async (tx) => {
      let valor = 0
      for (const x of need) {
        const mv = await movimentarTx(tx, { tenantId, tipo: 'SAIDA', itemId: x.itemId, almoxarifadoId: d.almoxarifadoId, quantidade: x.quantidade, origemTipo: 'KIT_AULA', origemId: k.id, cursoId: d.cursoId, laboratorioId: lab, classSectionId: d.classSectionId, motivo: `Kit ${k.nome} (${n} alunos)`, userId: getUserId(req) })
        valor += mv.reduce((s: number, m: any) => s + m.valorTotal, 0)
      }
      return tx.supKitConsumo.create({ data: { tenantId, kitId: k.id, classSectionId: d.classSectionId, classSessionId: d.classSessionId, cursoId: d.cursoId, laboratorioId: lab, almoxarifadoId: d.almoxarifadoId, numeroAlunos: n, valorTotal: round2(valor), userId: getUserId(req) } })
    }, { timeout: 60_000 })
    await checarEstoqueMinimo(tenantId, need.map((x) => x.itemId))
    res.status(201).json({ consumo, itens: need })
  }))

  // Professor/laboratório pede os insumos do kit (gera requisição de INSUMO em rascunho).
  router.post('/kits/:id/solicitar', requireRole(...GESTAO, 'TEACHER', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ almoxarifadoId: z.string(), classSectionId: z.string().optional(), numeroAlunos: z.coerce.number().int().min(0).optional(), cursoId: z.string().optional(), laboratorioId: z.string().optional(), centroCustoId: z.string().optional(), necessarioEm: dateISO().optional(), multiplicador: z.coerce.number().positive().default(1) }), req.body)
    const k = await prisma.supKit.findFirst({ where: { id: String(req.params.id), tenantId, ativo: true }, include: { itens: true } })
    if (!k) throw httpErr(404, 'Kit não encontrado.')
    const lab = d.laboratorioId ?? k.laboratorioId ?? undefined
    if (!d.cursoId && !lab && !d.centroCustoId) throw httpErr(400, 'Informe curso, laboratório ou centro de custo.')
    const n = d.numeroAlunos ?? (await alunosDaTurma(tenantId, d.classSectionId)) ?? 0
    const need = quantidadesKit(k.itens, n, d.multiplicador)
    const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: need.map((x) => x.itemId) } } })
    const r = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'REQ')
      const lin = need.map((x) => { const it = itens.find((i) => i.id === x.itemId)!; return { tenantId, itemId: it.id, descricao: it.nome, unidade: it.unidade, quantidade: x.quantidade, precoEstimado: it.custoMedio > 0 ? it.custoMedio : it.precoReferencia } })
      return tx.supRequisicao.create({ data: { tenantId, numero, tipo: 'INSUMO', solicitanteUserId: getUserId(req), cursoId: d.cursoId, laboratorioId: lab, centroCustoId: d.centroCustoId, classSectionId: d.classSectionId, almoxarifadoId: d.almoxarifadoId, necessarioEm: d.necessarioEm, justificativa: `Kit de aula prática: ${k.nome} (${n} alunos)`, valorEstimado: round2(lin.reduce((s, i) => s + i.quantidade * (i.precoEstimado ?? 0), 0)), itens: { create: lin } }, include: { itens: true } })
    })
    res.status(201).json(r)
  }))

  router.get('/kits-consumos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: getTenantId(req) }
    for (const f of ['kitId', 'classSectionId', 'cursoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    res.json(await prisma.supKitConsumo.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }))
  }))
}
