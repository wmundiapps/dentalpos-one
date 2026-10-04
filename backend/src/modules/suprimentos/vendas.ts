import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, dateISO, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { getBranding, brandHeaderHtml, escapeHtml } from '../core/branding'
import { fechamentoCaixa, parcelar, round2, totalVenda, validarDevolucao, DAY } from './logic'
import { checarEstoqueMinimo, movimentarTx, proximoNumero } from './stock'

const mod = 'suprimentos'
const OPERADORES = ['SUPPLIES', 'FINANCE', 'STAFF', 'SECRETARY'] as const
const httpErr = (status: number, msg: string) => Object.assign(new Error(msg), { status })
const CANAIS = ['LOJA', 'PAPELARIA', 'UNIFORMES', 'LIVRARIA', 'CURSOS_LIVRES', 'CANTINA'] as const

export function registerVendas(router: Router) {
  // ---------- Produtos ----------
  const prodSchema = z.object({ itemId: z.string(), almoxarifadoId: z.string(), canal: z.enum(CANAIS).default('LOJA'), nome: z.string().min(2), preco: z.coerce.number().min(0), permiteLancarAluno: z.boolean().optional(), ativo: z.boolean().optional() })
  mountCrud(router, {
    model: 'supProduto', path: '/produtos', read: [...OPERADORES, 'COORDINATOR'], write: ['SUPPLIES'], create: prodSchema,
    search: ['nome'], filters: ['canal', 'ativo'], orderBy: { nome: 'asc' }, modulo: mod, removeMode: 'soft',
    beforeCreate: async (d, req) => {
      const t = getTenantId(req)
      if (!(await prisma.supItem.findFirst({ where: { id: d.itemId, tenantId: t } }))) throw httpErr(404, 'Item de estoque não encontrado.')
      if (!(await prisma.supAlmoxarifado.findFirst({ where: { id: d.almoxarifadoId, tenantId: t } }))) throw httpErr(404, 'Almoxarifado não encontrado.')
      return d
    },
  })

  // Produtos com saldo (PDV)
  router.get('/produtos-pdv', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, ativo: true }
    if (qs(req.query.canal)) where.canal = qs(req.query.canal)
    if (qs(req.query.q)) where.nome = { contains: qs(req.query.q), mode: 'insensitive' }
    const ps = await prisma.supProduto.findMany({ where, orderBy: { nome: 'asc' }, take: 300 })
    const saldos = await prisma.supSaldo.findMany({ where: { tenantId, OR: ps.map((p) => ({ itemId: p.itemId, almoxarifadoId: p.almoxarifadoId })) } })
    res.json(ps.map((p) => ({ ...p, estoque: saldos.find((s) => s.itemId === p.itemId && s.almoxarifadoId === p.almoxarifadoId)?.quantidade ?? 0 })))
  }))

  // ---------- Caixa diário ----------
  router.post('/caixa/abrir', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ valorAbertura: z.coerce.number().min(0).default(0), canal: z.enum(CANAIS).default('LOJA') }), req.body ?? {})
    const aberto = await prisma.supCaixa.findFirst({ where: { tenantId, operadorUserId: getUserId(req), status: 'ABERTO' } })
    if (aberto) throw httpErr(409, 'Você já possui um caixa aberto.')
    res.status(201).json(await prisma.supCaixa.create({ data: { tenantId, operadorUserId: getUserId(req), canal: d.canal, valorAbertura: d.valorAbertura } }))
  }))

  async function resumoCaixa(tenantId: string, caixaId: string) {
    const c = await prisma.supCaixa.findFirst({ where: { id: caixaId, tenantId }, include: { movimentos: true } })
    if (!c) throw httpErr(404, 'Caixa não encontrado.')
    const vendas = await prisma.supVenda.findMany({ where: { tenantId, caixaId, status: { not: 'CANCELADA' } }, include: { devolucoes: true } })
    const porForma: Record<string, number> = {}
    let aLancar = 0
    for (const v of vendas) {
      if (v.tipo === 'LANCADA_ALUNO') aLancar += v.total - v.totalDevolvido
      else {
        const f = v.formaPagamento ?? 'DINHEIRO'
        porForma[f] = round2((porForma[f] ?? 0) + v.total - v.totalDevolvido)
      }
    }
    const vendasDinheiro = vendas.filter((v) => v.tipo === 'A_VISTA' && (v.formaPagamento ?? 'DINHEIRO') === 'DINHEIRO').reduce((s, v) => s + v.total, 0)
    const devolucoesDinheiro = vendas.filter((v) => v.tipo === 'A_VISTA' && (v.formaPagamento ?? 'DINHEIRO') === 'DINHEIRO').reduce((s, v) => s + v.totalDevolvido, 0)
    const suprimentos = c.movimentos.filter((m) => m.tipo === 'SUPRIMENTO').reduce((s, m) => s + m.valor, 0)
    const sangrias = c.movimentos.filter((m) => m.tipo === 'SANGRIA').reduce((s, m) => s + m.valor, 0)
    const f = fechamentoCaixa({ abertura: c.valorAbertura, vendasDinheiro, devolucoesDinheiro, suprimentos, sangrias, contado: c.valorContado ?? undefined })
    return { caixa: c, vendas: vendas.length, totalVendido: round2(vendas.reduce((s, v) => s + v.total - v.totalDevolvido, 0)), porFormaPagamento: porForma, lancadoAlunos: round2(aLancar), suprimentos, sangrias, dinheiroEsperado: f.esperado, diferenca: f.diferenca }
  }

  router.get('/caixa/atual', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.supCaixa.findFirst({ where: { tenantId, operadorUserId: getUserId(req), status: 'ABERTO' } })
    if (!c) return res.status(404).json({ error: 'Nenhum caixa aberto.' })
    res.json(await resumoCaixa(tenantId, c.id))
  }))
  router.get('/caixa', requireRole('SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where: any = { tenantId: getTenantId(req) }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    res.json(await prisma.supCaixa.findMany({ where, orderBy: { abertoEm: 'desc' }, take: 100 }))
  }))
  router.get('/caixa/:id/resumo', requireRole('SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => { res.json(await resumoCaixa(getTenantId(req), String(req.params.id))) }))
  router.post('/caixa/:id/movimento', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ tipo: z.enum(['SANGRIA', 'SUPRIMENTO']), valor: z.coerce.number().positive(), motivo: z.string().optional() }), req.body)
    const c = await prisma.supCaixa.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ABERTO' } })
    if (!c) throw httpErr(404, 'Caixa aberto não encontrado.')
    if (c.operadorUserId !== getUserId(req) && !['SUPPLIES', 'FINANCE'].includes(String(req.user?.role))) throw httpErr(403, 'Caixa de outro operador.')
    if (d.tipo === 'SANGRIA') { const r = await resumoCaixa(tenantId, c.id); if (d.valor > r.dinheiroEsperado + 1e-9) throw httpErr(409, 'Sangria maior que o dinheiro em caixa.') }
    res.status(201).json(await prisma.supCaixaMov.create({ data: { tenantId, caixaId: c.id, ...d } }))
  }))
  router.post('/caixa/:id/fechar', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ valorContado: z.coerce.number().min(0), observacao: z.string().optional() }), req.body)
    const c = await prisma.supCaixa.findFirst({ where: { id: String(req.params.id), tenantId, status: 'ABERTO' } })
    if (!c) throw httpErr(404, 'Caixa aberto não encontrado.')
    if (c.operadorUserId !== getUserId(req) && !['SUPPLIES', 'FINANCE'].includes(String(req.user?.role))) throw httpErr(403, 'Caixa de outro operador.')
    const antes = await resumoCaixa(tenantId, c.id)
    const diferenca = round2(d.valorContado - antes.dinheiroEsperado)
    if (Math.abs(diferenca) > 0.009 && !d.observacao) throw httpErr(400, `Diferença de caixa de R$ ${diferenca.toFixed(2)}: informe a observação.`)
    await prisma.supCaixa.update({ where: { id: c.id }, data: { status: 'FECHADO', fechadoEm: new Date(), valorContado: d.valorContado, valorEsperado: antes.dinheiroEsperado, diferenca, observacao: d.observacao } })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'FECHAR_CAIXA', refType: 'SupCaixa', refId: c.id, detalhes: { diferenca } })
    res.json({ ...(await resumoCaixa(tenantId, c.id)), diferenca })
  }))

  // ---------- Vendas ----------
  const vendaSchema = z.object({
    caixaId: z.string().optional(), tipo: z.enum(['A_VISTA', 'LANCADA_ALUNO']).default('A_VISTA'), studentId: z.string().optional(), clienteNome: z.string().optional(),
    formaPagamento: z.enum(['DINHEIRO', 'PIX', 'CARTAO']).optional(), desconto: z.coerce.number().min(0).default(0), parcelas: z.coerce.number().int().min(1).max(12).default(1),
    primeiroVencimentoEm: dateISO().optional(),
    itens: z.array(z.object({ produtoId: z.string(), quantidade: z.coerce.number().positive() })).min(1),
  })
  router.post('/vendas', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(vendaSchema, req.body)
    const caixa = d.caixaId
      ? await prisma.supCaixa.findFirst({ where: { id: d.caixaId, tenantId, status: 'ABERTO' } })
      : await prisma.supCaixa.findFirst({ where: { tenantId, operadorUserId: getUserId(req), status: 'ABERTO' } })
    if (!caixa) throw httpErr(409, 'Abra o caixa antes de vender.')
    if (d.tipo === 'A_VISTA' && !d.formaPagamento) throw httpErr(400, 'Informe a forma de pagamento.')
    if (d.tipo === 'LANCADA_ALUNO') {
      if (!d.studentId) throw httpErr(400, 'Venda lançada ao aluno exige studentId.')
      const st = await prisma.student.findFirst({ where: { id: d.studentId, tenantId }, select: { id: true, status: true } })
      if (!st) throw httpErr(404, 'Aluno não encontrado.')
    }
    const prods = await prisma.supProduto.findMany({ where: { tenantId, id: { in: d.itens.map((i) => i.produtoId) }, ativo: true } })
    if (prods.length !== new Set(d.itens.map((i) => i.produtoId)).size) throw httpErr(404, 'Há produtos inexistentes ou inativos.')
    if (d.tipo === 'LANCADA_ALUNO' && prods.some((p) => !p.permiteLancarAluno)) throw httpErr(409, 'Há produto que não pode ser lançado ao aluno.')
    const linhas = d.itens.map((i) => { const p = prods.find((x) => x.id === i.produtoId)!; return { p, quantidade: i.quantidade, precoUnitario: p.preco } })
    const t = totalVenda(linhas, d.desconto)
    if (d.desconto > t.subtotal) throw httpErr(400, 'Desconto maior que o subtotal.')
    const userId = getUserId(req)
    const out = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumero(tx, tenantId, 'VD')
      const venda = await tx.supVenda.create({ data: { tenantId, numero, caixaId: caixa.id, tipo: d.tipo, studentId: d.studentId, clienteNome: d.clienteNome, formaPagamento: d.tipo === 'A_VISTA' ? d.formaPagamento : null, subtotal: t.subtotal, desconto: t.desconto, total: t.total, parcelas: d.tipo === 'LANCADA_ALUNO' ? d.parcelas : 1, vendedorUserId: userId } })
      for (const l of linhas) {
        const mv = await movimentarTx(tx, { tenantId, tipo: 'SAIDA', itemId: l.p.itemId, almoxarifadoId: l.p.almoxarifadoId, quantidade: l.quantidade, origemTipo: 'VENDA', origemId: venda.id, motivo: `Venda ${numero}`, userId })
        const custo = mv.length ? mv.reduce((s: number, m: any) => s + m.valorTotal, 0) / l.quantidade : 0
        await tx.supVendaItem.create({ data: { tenantId, vendaId: venda.id, produtoId: l.p.id, itemId: l.p.itemId, almoxarifadoId: l.p.almoxarifadoId, descricao: l.p.nome, quantidade: l.quantidade, precoUnitario: l.precoUnitario, custoUnitario: round2(custo) } })
      }
      const receivableIds: string[] = []
      if (d.tipo === 'LANCADA_ALUNO' && t.total > 0) {
        const parcelas = parcelar(t.total, d.parcelas, d.primeiroVencimentoEm ?? new Date(Date.now() + 30 * DAY), 30)
        for (const pc of parcelas) {
          const ar = await tx.accountReceivable.create({ data: { tenantId, studentId: d.studentId!, descricao: `Venda ${numero} (${linhas.map((l) => l.p.nome).join(', ').slice(0, 80)}) — parcela ${pc.numero}/${parcelas.length}`, numeroParcela: pc.numero, valor: pc.valor, dataVencimento: pc.vencimento } })
          receivableIds.push(ar.id)
        }
        await tx.supVenda.update({ where: { id: venda.id }, data: { receivableIds } })
      }
      return tx.supVenda.findFirst({ where: { id: venda.id }, include: { itens: true } })
    }, { timeout: 30_000 })
    await checarEstoqueMinimo(tenantId, prods.map((p) => p.itemId))
    res.status(201).json(out)
  }))

  router.get('/vendas', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'tipo', 'studentId', 'caixaId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.createdAt = { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) }
    const [items, total] = await Promise.all([prisma.supVenda.findMany({ where, include: { itens: true }, orderBy: { createdAt: 'desc' }, skip, take }), prisma.supVenda.count({ where })])
    res.json({ items, total, page, pageSize })
  }))
  router.get('/vendas/:id', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const v = await prisma.supVenda.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { itens: true, devolucoes: true } })
    if (!v) return res.status(404).json({ error: 'Venda não encontrada.' })
    res.json(v)
  }))

  router.post('/vendas/:id/devolucao', requireRole('SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ motivo: z.string().min(3), itens: z.array(z.object({ vendaItemId: z.string(), quantidade: z.coerce.number().positive() })).min(1) }), req.body)
    const userId = getUserId(req)
    const out = await prisma.$transaction(async (tx) => {
      // Trava a venda: duas devoluções simultâneas não podem devolver além do vendido.
      await tx.$queryRaw`SELECT "id" FROM "SupVenda" WHERE "id" = ${String(req.params.id)} AND "tenantId" = ${tenantId} FOR UPDATE`
      const v = await tx.supVenda.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
      if (!v) throw httpErr(404, 'Venda não encontrada.')
      if (['DEVOLVIDA', 'CANCELADA'].includes(v.status)) throw httpErr(409, 'Venda já devolvida/cancelada.')
      const bruto = validarDevolucao(v.itens, d.itens)
      // abate o desconto proporcionalmente
      const valor = v.subtotal > 0 ? round2(bruto * (v.total / v.subtotal)) : 0
      for (const l of d.itens) {
        const vi = v.itens.find((x) => x.id === l.vendaItemId)!
        await movimentarTx(tx, { tenantId, tipo: 'DEVOLUCAO', itemId: vi.itemId, almoxarifadoId: vi.almoxarifadoId, quantidade: l.quantidade, custoUnitario: vi.custoUnitario, origemTipo: 'VENDA', origemId: v.id, motivo: `Devolução venda ${v.numero}: ${d.motivo}`, userId })
        await tx.supVendaItem.update({ where: { id: vi.id }, data: { quantidadeDevolvida: { increment: l.quantidade } } })
      }
      const itensAtual = await tx.supVendaItem.findMany({ where: { vendaId: v.id } })
      const total = itensAtual.every((i) => i.quantidadeDevolvida >= i.quantidade - 1e-9)
      const novoTotalDevolvido = round2(total ? v.total : Math.min(v.total, v.totalDevolvido + valor))
      await tx.supVenda.update({ where: { id: v.id }, data: { status: total ? 'DEVOLVIDA' : 'PARCIALMENTE_DEVOLVIDA', totalDevolvido: novoTotalDevolvido } })
      const dev = await tx.supDevolucao.create({ data: { tenantId, vendaId: v.id, valor: round2(novoTotalDevolvido - v.totalDevolvido), motivo: d.motivo, itens: d.itens as any, userId } })
      // Venda lançada ao aluno: abate/cancela recebíveis ainda pendentes (da última parcela para a primeira)
      let aEstornar = dev.valor
      let semAbater = 0
      if (v.tipo === 'LANCADA_ALUNO' && v.receivableIds.length) {
        const ars = await tx.accountReceivable.findMany({ where: { id: { in: v.receivableIds } }, orderBy: { dataVencimento: 'desc' } })
        for (const ar of ars) {
          if (aEstornar <= 0) break
          if (ar.status === 'PAGO' || ar.status === 'CANCELADO') continue
          const abate = Math.min(ar.valor, aEstornar)
          const resto = round2(ar.valor - abate)
          await tx.accountReceivable.update({ where: { id: ar.id }, data: resto <= 0 ? { status: 'CANCELADO', valor: ar.valor } : { valor: resto } })
          aEstornar = round2(aEstornar - abate)
        }
        semAbater = aEstornar
      }
      return { devolucao: dev, valorDevolvido: dev.valor, completa: total, aReembolsarAoAluno: semAbater, itens: v.itens.map((i) => i.itemId) }
    }, { timeout: 30_000 })
    await audit({ tenantId, userId, modulo: mod, acao: 'DEVOLUCAO_VENDA', refType: 'SupVenda', refId: String(req.params.id), detalhes: { valor: out.valorDevolvido } })
    res.status(201).json(out)
  }))

  // Recibo imprimível com marca da instituição
  router.get('/vendas/:id/recibo', requireRole(...OPERADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const v = await prisma.supVenda.findFirst({ where: { id: String(req.params.id), tenantId }, include: { itens: true } })
    if (!v) return res.status(404).json({ error: 'Venda não encontrada.' })
    const b = await getBranding(tenantId)
    const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const aluno = v.studentId ? await prisma.student.findFirst({ where: { id: v.studentId, tenantId }, select: { nomeCompleto: true, ra: true } }) : null
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Recibo ${escapeHtml(v.numero)}</title><body style="font-family:Arial,sans-serif;max-width:720px;margin:auto">
${brandHeaderHtml(b, { titulo: 'Recibo de venda', subtitulo: `Nº ${v.numero} — ${v.createdAt.toLocaleString('pt-BR')}` })}
<div style="padding:16px 28px;font-size:13px">
${aluno ? `<p><b>Aluno:</b> ${escapeHtml(aluno.nomeCompleto)} (RA ${escapeHtml(aluno.ra)})</p>` : v.clienteNome ? `<p><b>Cliente:</b> ${escapeHtml(v.clienteNome)}</p>` : ''}
<table style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th align="left">Item</th><th>Qtd</th><th align="right">Unit.</th><th align="right">Total</th></tr>
${v.itens.map((i) => `<tr><td>${escapeHtml(i.descricao)}</td><td align="center">${i.quantidade}</td><td align="right">${brl(i.precoUnitario)}</td><td align="right">${brl(i.quantidade * i.precoUnitario)}</td></tr>`).join('')}
</table>
<p align="right">Subtotal: ${brl(v.subtotal)} · Desconto: ${brl(v.desconto)}<br/><b style="font-size:16px">Total: ${brl(v.total)}</b></p>
<p>${v.tipo === 'A_VISTA' ? 'Pagamento: ' + escapeHtml(v.formaPagamento ?? '') : `Lançado no financeiro do aluno em ${v.parcelas}x`}</p></div></body></html>`
    res.type('html').send(html)
  }))

  // Relatório de vendas
  router.get('/vendas-relatorio', requireRole('SUPPLIES', 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(Date.now() - 30 * DAY)
    const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date()
    const vendas = await prisma.supVenda.findMany({ where: { tenantId, status: { not: 'CANCELADA' }, createdAt: { gte: de, lte: ate } }, include: { itens: true } })
    const prodCanal = new Map((await prisma.supProduto.findMany({ where: { tenantId }, select: { id: true, canal: true } })).map((p) => [p.id, p.canal]))
    const dia: Record<string, number> = {}, forma: Record<string, number> = {}, canal: Record<string, number> = {}, prod: Record<string, { descricao: string; quantidade: number; receita: number }> = {}
    let receita = 0, custo = 0, devolvido = 0
    for (const v of vendas) {
      const liquido = v.total - v.totalDevolvido
      receita += liquido; devolvido += v.totalDevolvido
      const k = v.createdAt.toISOString().slice(0, 10)
      dia[k] = round2((dia[k] ?? 0) + liquido)
      const f = v.tipo === 'LANCADA_ALUNO' ? 'LANCADA_ALUNO' : v.formaPagamento ?? 'DINHEIRO'
      forma[f] = round2((forma[f] ?? 0) + liquido)
      for (const i of v.itens) {
        const qtd = i.quantidade - i.quantidadeDevolvida
        custo += qtd * i.custoUnitario
        const c = prodCanal.get(i.produtoId) ?? 'LOJA'
        canal[c] = round2((canal[c] ?? 0) + qtd * i.precoUnitario * (v.subtotal > 0 ? v.total / v.subtotal : 1))
        const pr = (prod[i.produtoId] ??= { descricao: i.descricao, quantidade: 0, receita: 0 })
        pr.quantidade += qtd; pr.receita = round2(pr.receita + qtd * i.precoUnitario)
      }
    }
    res.json({ periodo: { de, ate }, vendas: vendas.length, receita: round2(receita), devolvido: round2(devolvido), custoMercadoria: round2(custo), margem: round2(receita - custo), ticketMedio: vendas.length ? round2(receita / vendas.length) : 0, porDia: dia, porFormaPagamento: forma, porCanal: canal, maisVendidos: Object.entries(prod).map(([produtoId, v]) => ({ produtoId, ...v })).sort((a, b) => b.receita - a.receita).slice(0, 20) })
  }))
}
