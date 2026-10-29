// Aprovação de VALOR e FORMA DE PAGAMENTO da compra (alçada) e lançamento automático de contas a pagar em RASCUNHO.
//
// CONTRATO PARA O FINANCEIRO/TESOURARIA (documentado também em README.md):
//   POST /api/edu/suprimentos/compras/:id/gerar-conta-pagar   (:id = CppCompra.id; papéis SUPPLIES/FINANCE/ADMIN...)
//   - só para compra APROVADA; idempotente (reenvio devolve as mesmas contas com jaGeradas=true);
//   - ?regenerar=true recria as parcelas enquanto TODAS estiverem em RASCUNHO;
//   - cria 1 registro AccountPayable (módulo financeiro do Edu, status PENDENTE) por parcela, com descricao iniciada em
//     "[RASCUNHO] " e o elo CppContaPagar{ accountPayableId, situacao: RASCUNHO|CONFERIDA|CANCELADA };
//   - POST /compras/:id/contas-pagar/conferir (FINANCE) tira o prefixo, marca CONFERIDA e libera para pagamento.
//   Quem paga/concilia deve ignorar AccountPayable cujo id conste em CppContaPagar com situacao RASCUNHO.
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, pageParams, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { LEITURA, GESTAO } from './catalogo'
import { alcadasNecessarias, parcelar, proximoNivelPendente, round2, DAY } from './logic'
import { CPP_SUPER, FORMAS_PAGAMENTO, FORMA_LABEL, cppNumero, getPolitica, httpErr, normalizarCondicao, type FormaPagamento } from './cpp'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient
const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const APROVADORES = ['COORDINATOR', 'FINANCE', 'SUPPLIES', 'FACILITIES'] as const
const mod = 'suprimentos'
const PREFIXO = '[RASCUNHO] '
const ATIVAS = ['RASCUNHO', 'CONFERIDA']

const incluir = { niveis: { orderBy: { nivel: 'asc' as const } }, contas: { orderBy: { parcela: 'asc' as const } } }

/** Compra ativa (não reprovada/cancelada) de uma cotação. */
export async function compraAtivaDaCotacao(tenantId: string, cotacaoId: string, db: Tx | typeof prisma = prisma) {
  return db.cppCompra.findFirst({ where: { tenantId, cotacaoId, status: { in: ['AGUARDANDO_APROVACAO', 'APROVADA'] } }, include: incluir })
}

/** Gate do gerar-pedido: com a política ativa, exige compra APROVADA (valor + forma de pagamento) para a cotação. */
export async function exigirCompraAprovada(tenantId: string, cotacaoId: string) {
  const pol = await getPolitica(tenantId)
  const compra = await compraAtivaDaCotacao(tenantId, cotacaoId)
  if (!pol.exigirAprovacaoCompra) return compra?.status === 'APROVADA' ? compra : null
  if (!compra) throw httpErr(409, 'Antes de gerar o pedido, envie a compra para aprovação do valor e da forma de pagamento (POST /compras).', { codigo: 'COMPRA_NAO_APROVADA' })
  if (compra.status !== 'APROVADA') throw httpErr(409, `A compra ${compra.numero} ainda está ${compra.status.replace(/_/g, ' ').toLowerCase()}: aguarde a aprovação pela alçada.`, { codigo: 'COMPRA_NAO_APROVADA' })
  if (compra.pedidoId) throw httpErr(409, 'Já existe pedido para esta compra.')
  return compra
}

/** Depois de criar o pedido: vincula a compra, grava a forma de pagamento e referencia o pedido nas contas em rascunho. */
export async function vincularCompraAoPedido(tx: Tx, compra: { id: string; formaPagamento: string }, pedido: { id: string; numero: string }) {
  await tx.cppCompra.update({ where: { id: compra.id }, data: { pedidoId: pedido.id } })
  await tx.supPedido.update({ where: { id: pedido.id }, data: { formaPagamento: compra.formaPagamento } })
  const contas = await tx.cppContaPagar.findMany({ where: { compraId: compra.id, situacao: { in: ATIVAS } } })
  for (const c of contas) {
    const ap = await tx.accountPayable.findUnique({ where: { id: c.accountPayableId } })
    if (ap && !ap.descricao.includes(pedido.numero)) await tx.accountPayable.update({ where: { id: ap.id }, data: { descricao: ap.descricao.replace(' — ', ` — Pedido ${pedido.numero} — `) } })
  }
  await tx.supPedido.update({ where: { id: pedido.id }, data: { payableIds: contas.map((c) => c.accountPayableId) } })
}

export async function contasDaCompraDoPedido(db: Tx | typeof prisma, tenantId: string, pedidoId: string) {
  const compra = await db.cppCompra.findFirst({ where: { tenantId, pedidoId, status: 'APROVADA' } })
  if (!compra) return { compra: null, contas: [] as Array<{ id: string; accountPayableId: string; situacao: string; valor: number; valorOriginal: number }> }
  const contas = await db.cppContaPagar.findMany({ where: { tenantId, compraId: compra.id, situacao: { in: ATIVAS } }, orderBy: { parcela: 'asc' } })
  return { compra, contas }
}

/** Cancela (status CANCELADO) as contas em rascunho de uma compra. Contas já conferidas são mantidas e retornadas. */
export async function cancelarRascunhos(db: Tx | typeof prisma, tenantId: string, compraId: string) {
  const contas = await db.cppContaPagar.findMany({ where: { tenantId, compraId, situacao: 'RASCUNHO' } })
  for (const c of contas) {
    await db.accountPayable.updateMany({ where: { id: c.accountPayableId, tenantId, status: 'PENDENTE' }, data: { status: 'CANCELADO' } })
    await db.cppContaPagar.update({ where: { id: c.id }, data: { situacao: 'CANCELADA' } })
  }
  return contas.length
}

async function nomeCategoria(db: Tx | typeof prisma, tenantId: string, requisicaoId: string): Promise<string> {
  const it = await db.supRequisicaoItem.findFirst({ where: { requisicaoId, tenantId, itemId: { not: null } } })
  if (!it?.itemId) return 'suprimentos'
  const item = await db.supItem.findFirst({ where: { id: it.itemId, tenantId }, include: { categoria: true } })
  return item?.categoria?.nome ?? 'suprimentos'
}

export async function gerarContasPagar(tenantId: string, compraId: string, userId: string, opt: { regenerar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CppCompra" WHERE "id" = ${compraId} AND "tenantId" = ${tenantId} FOR UPDATE`
    const compra = await tx.cppCompra.findFirst({ where: { id: compraId, tenantId }, include: incluir })
    if (!compra) throw httpErr(404, 'Compra não encontrada.')
    if (compra.status !== 'APROVADA') throw httpErr(409, `A compra ${compra.numero} está ${compra.status}: só compras APROVADAS geram conta a pagar.`)
    const existentes = compra.contas.filter((c) => ATIVAS.includes(c.situacao))
    if (existentes.length && !opt.regenerar) return { compra, contas: existentes, jaGeradas: true }
    if (existentes.length) {
      if (existentes.some((c) => c.situacao === 'CONFERIDA')) throw httpErr(409, 'Há parcelas já conferidas pelo Financeiro: não é possível regerar.')
      await cancelarRascunhos(tx, tenantId, compra.id)
    }
    const [req, forn] = await Promise.all([
      tx.supRequisicao.findFirst({ where: { id: compra.requisicaoId, tenantId } }),
      tx.supFornecedor.findFirst({ where: { id: compra.fornecedorId, tenantId } }),
    ])
    let ccId: string | null = null
    let centroId = req?.centroCustoId ?? null
    if (!centroId && req?.departamentoId) centroId = (await tx.cppDepartamento.findFirst({ where: { id: req.departamentoId, tenantId } }))?.centroCustoId ?? null
    if (centroId) ccId = (await tx.eduCostCenter.findFirst({ where: { id: centroId, tenantId }, select: { id: true } }))?.id ?? null
    const categoria = await nomeCategoria(tx, tenantId, compra.requisicaoId)
    const hoje = new Date()
    const aVista = compra.formaPagamento === 'A_VISTA' || compra.formaPagamento === 'PIX'
    const primeiro = compra.primeiroVencimentoEm ?? new Date(hoje.getTime() + (aVista ? 0 : compra.intervaloParcelasDias) * DAY)
    const linhas: Array<{ valor: number; vencimento: Date; rotulo: string }> = []
    if (compra.entrada > 0 && !aVista) {
      linhas.push({ valor: round2(compra.entrada), vencimento: hoje, rotulo: 'entrada' })
      for (const p of parcelar(round2(compra.valorTotal - compra.entrada), compra.parcelas, primeiro, compra.intervaloParcelasDias)) linhas.push({ valor: p.valor, vencimento: p.vencimento, rotulo: `parcela ${p.numero}` })
    } else {
      for (const p of parcelar(compra.valorTotal, compra.parcelas, primeiro, compra.intervaloParcelasDias)) linhas.push({ valor: p.valor, vencimento: p.vencimento, rotulo: `parcela ${p.numero}` })
    }
    const novas: Array<Awaited<ReturnType<typeof tx.cppContaPagar.create>>> = []
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      const ap = await tx.accountPayable.create({ data: {
        tenantId, costCenterId: ccId, fornecedor: forn?.razaoSocial ?? null, categoria, valor: l.valor, dataVencimento: l.vencimento,
        descricao: `${PREFIXO}Compra ${compra.numero} — ${FORMA_LABEL[compra.formaPagamento as FormaPagamento] ?? compra.formaPagamento} — ${l.rotulo}/${linhas.length}${req ? ` — Req ${req.numero}` : ''}`,
      } })
      novas.push(await tx.cppContaPagar.create({ data: { tenantId, compraId: compra.id, accountPayableId: ap.id, parcela: i + 1, totalParcelas: linhas.length, valor: l.valor, valorOriginal: l.valor, vencimento: l.vencimento, formaPagamento: compra.formaPagamento } }))
    }
    await tx.cppCompra.update({ where: { id: compra.id }, data: { contasGeradasEm: new Date() } })
    if (compra.pedidoId) await tx.supPedido.update({ where: { id: compra.pedidoId }, data: { payableIds: novas.map((n) => n.accountPayableId) } })
    return { compra, contas: novas, jaGeradas: false }
  }, { timeout: 30_000 }).then(async (r) => {
    if (!r.jaGeradas) {
      await audit({ tenantId, userId, modulo: mod, acao: 'GERAR_CONTA_PAGAR_RASCUNHO', refType: 'CppCompra', refId: compraId, detalhes: { parcelas: r.contas.length, total: round2(r.contas.reduce((s, c) => s + c.valor, 0)) } })
      await scheduleReminder({ tenantId, modulo: mod, refType: 'CppCompra', refId: compraId, dedupeKey: `cpp-conferir-ap-${compraId}`, titulo: `Conferir contas a pagar em rascunho da compra ${r.compra.numero}`, dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: 'FINANCE', severity: 'ATENCAO' })
    }
    return r
  })
}

function respostaContas(r: Awaited<ReturnType<typeof gerarContasPagar>>, fornecedor?: string | null) {
  return {
    compraId: r.compra.id, numero: r.compra.numero, fornecedorId: r.compra.fornecedorId, fornecedor: fornecedor ?? null,
    valorTotal: r.compra.valorTotal, formaPagamento: r.compra.formaPagamento, jaGeradas: r.jaGeradas,
    contas: r.contas.map((c) => ({ id: c.id, accountPayableId: c.accountPayableId, parcela: c.parcela, totalParcelas: c.totalParcelas, valor: c.valor, vencimento: c.vencimento, situacao: c.situacao })),
  }
}

export function registerComprasAprovacao(router: Router) {
  const create = z.object({
    cotacaoId: z.string(), formaPagamento: z.enum(FORMAS_PAGAMENTO), parcelas: z.coerce.number().int().min(1).max(36).optional(),
    intervaloParcelasDias: z.coerce.number().int().min(0).max(180).optional(), primeiroVencimentoEm: dateISO().optional().nullable(),
    entrada: z.coerce.number().min(0).optional(), observacao: z.string().optional().nullable(),
  })

  router.post('/compras', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(create, req.body)
    const cot = await prisma.supCotacao.findFirst({ where: { id: d.cotacaoId, tenantId }, include: { propostas: true } })
    if (!cot) throw httpErr(404, 'Cotação não encontrada.')
    if (cot.status !== 'ENCERRADA' || !cot.fornecedorVencedorId || cot.valorEscolhido == null) throw httpErr(409, 'Encerre a cotação (com a escolha do fornecedor) antes de enviar a compra para aprovação.')
    const dup = await compraAtivaDaCotacao(tenantId, cot.id)
    if (dup) throw httpErr(409, `Já existe a compra ${dup.numero} (${dup.status}) para esta cotação.`)
    const forn = await prisma.supFornecedor.findFirst({ where: { id: cot.fornecedorVencedorId, tenantId } })
    if (!forn) throw httpErr(404, 'Fornecedor vencedor não encontrado.')
    const cond = normalizarCondicao(d.formaPagamento, d.parcelas, d.intervaloParcelasDias, forn.prazoPagamentoDias)
    const entrada = d.entrada ?? 0
    if (entrada > 0 && (['A_VISTA', 'PIX'].includes(d.formaPagamento))) throw httpErr(400, 'Entrada não se aplica a pagamento à vista/Pix.')
    if (entrada >= cot.valorEscolhido) throw httpErr(400, 'A entrada deve ser menor que o valor total.')
    const prop = cot.propostas.find((p) => p.fornecedorId === cot.fornecedorVencedorId)
    const frete = prop?.frete ?? 0
    const valorTotal = round2(cot.valorEscolhido)
    const alcadas = await prisma.supAlcada.findMany({ where: { tenantId, ativo: true }, orderBy: { nivel: 'asc' } })
    const niveis: Array<{ nivel: number; papel: string; motivoNivel: string }> = alcadasNecessarias(valorTotal, alcadas).map((a) => ({ nivel: a.nivel, papel: a.papel, motivoNivel: 'ALCADA_VALOR' }))
    // Forma de pagamento que cria obrigação futura passa pelo Financeiro.
    if (!['A_VISTA', 'PIX'].includes(d.formaPagamento) && !niveis.some((n) => n.papel === 'FINANCE')) niveis.push({ nivel: Math.max(...niveis.map((n) => n.nivel)) + 1, papel: 'FINANCE', motivoNivel: 'FORMA_PAGAMENTO' })
    const compra = await prisma.$transaction(async (tx) => {
      const numero = await cppNumero(tx, tenantId, 'CMP')
      return tx.cppCompra.create({ data: {
        tenantId, numero, requisicaoId: cot.requisicaoId, cotacaoId: cot.id, fornecedorId: forn.id, valorItens: round2(valorTotal - frete), frete: round2(frete), valorTotal,
        formaPagamento: d.formaPagamento, parcelas: cond.parcelas, intervaloParcelasDias: cond.intervaloParcelasDias, primeiroVencimentoEm: d.primeiroVencimentoEm ?? null, entrada, observacao: d.observacao ?? null,
        solicitadoPorId: getUserId(req), niveis: { create: niveis.map((n) => ({ tenantId, ...n })) },
      }, include: incluir })
    })
    await scheduleReminder({ tenantId, modulo: mod, refType: 'CppCompra', refId: compra.id, dedupeKey: `cpp-compra-${compra.id}-${niveis[0].nivel}`, titulo: `Aprovar compra ${compra.numero} (R$ ${valorTotal.toFixed(2)} — ${FORMA_LABEL[d.formaPagamento]})`, dueAt: new Date(Date.now() + 2 * DAY), assigneeRole: niveis[0].papel, severity: 'ATENCAO' })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'COMPRA_ENVIADA_APROVACAO', refType: 'CppCompra', refId: compra.id, detalhes: { valorTotal, forma: d.formaPagamento, niveis } })
    res.status(201).json(compra)
  }))

  router.get('/compras', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'fornecedorId', 'requisicaoId', 'cotacaoId', 'formaPagamento']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.pendentesMinhaAprovacao) === 'true') {
      where.status = 'AGUARDANDO_APROVACAO'
      if (!CPP_SUPER.includes(roleOf(req))) where.niveis = { some: { status: 'PENDENTE', papel: roleOf(req) } }
    }
    const [items, total] = await Promise.all([prisma.cppCompra.findMany({ where, include: incluir, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppCompra.count({ where })])
    const fornecedores = await prisma.supFornecedor.findMany({ where: { tenantId, id: { in: [...new Set(items.map((i) => i.fornecedorId))] } }, select: { id: true, razaoSocial: true } })
    res.json({ items: items.map((c) => ({ ...c, fornecedor: fornecedores.find((f) => f.id === c.fornecedorId)?.razaoSocial ?? null })), total, page, pageSize })
  }))

  router.get('/compras/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.cppCompra.findFirst({ where: { id: String(req.params.id), tenantId }, include: incluir })
    if (!c) throw httpErr(404, 'Compra não encontrada.')
    const [forn, requisicao, mapa] = await Promise.all([
      prisma.supFornecedor.findFirst({ where: { id: c.fornecedorId, tenantId }, select: { id: true, razaoSocial: true, cnpj: true, prazoPagamentoDias: true } }),
      prisma.supRequisicao.findFirst({ where: { id: c.requisicaoId, tenantId }, select: { id: true, numero: true, justificativa: true, valorEstimado: true, departamentoId: true } }),
      prisma.cppMapaCotacao.findFirst({ where: { tenantId, cotacaoId: c.cotacaoId } }),
    ])
    res.json({ ...c, fornecedor: forn, requisicao, escolha: mapa ? { justificativa: mapa.justificativa, economia: mapa.economia, propostasRespondidas: mapa.propostasRespondidas, minimoExigido: mapa.minimoExigido, excecaoId: mapa.excecaoId } : null })
  }))

  router.post('/compras/:id/decidir', requireRole(...APROVADORES), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ decisao: z.enum(['APROVADO', 'REPROVADO']), parecer: z.string().optional() }), req.body)
    const c = await prisma.cppCompra.findFirst({ where: { id: String(req.params.id), tenantId }, include: incluir })
    if (!c) throw httpErr(404, 'Compra não encontrada.')
    if (c.status !== 'AGUARDANDO_APROVACAO') throw httpErr(409, 'Compra não está aguardando aprovação.')
    if (c.solicitadoPorId === getUserId(req)) throw httpErr(403, 'Quem enviou a compra não pode aprová-la.')
    const pend = proximoNivelPendente(c.niveis)
    if (!pend) throw httpErr(409, 'Não há aprovação pendente.')
    const role = roleOf(req)
    if (!CPP_SUPER.includes(role) && role !== pend.papel) throw httpErr(403, `Esta etapa (nível ${pend.nivel}) deve ser decidida por ${pend.papel}.`)
    if (d.decisao === 'REPROVADO' && !d.parecer) throw httpErr(400, 'Informe o parecer para reprovar.')
    const claim = await prisma.cppCompraAprovacao.updateMany({ where: { compraId: c.id, nivel: pend.nivel, status: 'PENDENTE' }, data: { status: d.decisao, decididoPorId: getUserId(req), decididoEm: new Date(), parecer: d.parecer } })
    if (claim.count === 0) throw httpErr(409, 'Esta etapa já foi decidida.')
    await completeReminders({ tenantId, refType: 'CppCompra', refId: c.id, userId: getUserId(req) })
    let status = 'AGUARDANDO_APROVACAO'
    if (d.decisao === 'REPROVADO') {
      status = 'REPROVADA'
      await prisma.cppCompraAprovacao.updateMany({ where: { compraId: c.id, status: 'PENDENTE' }, data: { status: 'REPROVADO', parecer: 'Cancelada por reprovação em nível anterior' } })
    } else {
      const resto = await prisma.cppCompraAprovacao.findMany({ where: { compraId: c.id, status: 'PENDENTE' }, orderBy: { nivel: 'asc' } })
      if (resto.length === 0) status = 'APROVADA'
      else await scheduleReminder({ tenantId, modulo: mod, refType: 'CppCompra', refId: c.id, dedupeKey: `cpp-compra-${c.id}-${resto[0].nivel}`, titulo: `Aprovar compra ${c.numero} (nível ${resto[0].nivel})`, dueAt: new Date(Date.now() + 2 * DAY), assigneeRole: resto[0].papel, severity: 'ATENCAO' })
    }
    await prisma.cppCompra.update({ where: { id: c.id }, data: { status, ...(status === 'APROVADA' ? { aprovadaEm: new Date() } : {}), ...(status === 'REPROVADA' ? { motivoReprovacao: d.parecer } : {}) } })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: `COMPRA_${d.decisao}`, refType: 'CppCompra', refId: c.id, detalhes: { nivel: pend.nivel, parecer: d.parecer } })
    let contas: ReturnType<typeof respostaContas> | null = null
    if (status === 'APROVADA') contas = respostaContas(await gerarContasPagar(tenantId, c.id, getUserId(req)))
    if (status !== 'AGUARDANDO_APROVACAO') {
      await notify({ tenantId, userId: c.solicitadoPorId, assunto: `Compra ${c.numero} ${status === 'APROVADA' ? 'aprovada' : 'reprovada'}`, mensagem: `${status === 'APROVADA' ? 'Valor e forma de pagamento aprovados; conta a pagar lançada em rascunho. Gere o pedido.' : 'Compra reprovada.'}${d.parecer ? ' Parecer: ' + d.parecer : ''}`, refType: 'CppCompra', refId: c.id })
    }
    res.json({ ...(await prisma.cppCompra.findFirst({ where: { id: c.id }, include: incluir })), contasPagar: contas })
  }))

  router.post('/compras/:id/cancelar', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.cppCompra.findFirst({ where: { id: String(req.params.id), tenantId }, include: incluir })
    if (!c) throw httpErr(404, 'Compra não encontrada.')
    if (!['AGUARDANDO_APROVACAO', 'APROVADA'].includes(c.status)) throw httpErr(409, `Compra em ${c.status} não pode ser cancelada.`)
    if (c.pedidoId) throw httpErr(409, 'Já existe pedido: cancele o pedido antes.')
    if (c.contas.some((x) => x.situacao === 'CONFERIDA')) throw httpErr(409, 'Há parcelas já conferidas pelo Financeiro.')
    await prisma.$transaction(async (tx) => { await cancelarRascunhos(tx, tenantId, c.id); await tx.cppCompra.update({ where: { id: c.id }, data: { status: 'CANCELADA' } }) })
    await cancelReminders({ tenantId, refType: 'CppCompra', refId: c.id })
    res.json({ ok: true })
  }))

  // ---------- Contrato: contas a pagar (rascunho) ----------
  router.post('/compras/:id/gerar-conta-pagar', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const regenerar = qs(req.query.regenerar) === 'true' || (req.body && (req.body as any).regenerar === true)
    const r = await gerarContasPagar(tenantId, String(req.params.id), getUserId(req), { regenerar })
    const f = await prisma.supFornecedor.findFirst({ where: { id: r.compra.fornecedorId, tenantId }, select: { razaoSocial: true } })
    res.status(r.jaGeradas ? 200 : 201).json(respostaContas(r, f?.razaoSocial))
  }))

  router.get('/compras/:id/contas-pagar', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await prisma.cppCompra.findFirst({ where: { id: String(req.params.id), tenantId }, include: incluir })
    if (!c) throw httpErr(404, 'Compra não encontrada.')
    const aps = await prisma.accountPayable.findMany({ where: { tenantId, id: { in: c.contas.map((x) => x.accountPayableId) } } })
    res.json({ compraId: c.id, numero: c.numero, contas: c.contas.map((x) => ({ ...x, accountPayable: aps.find((a) => a.id === x.accountPayableId) ?? null })) })
  }))

  router.post('/compras/:id/contas-pagar/conferir', requireRole('FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({
      ids: z.array(z.string()).optional(), observacao: z.string().optional(),
      ajustes: z.array(z.object({ id: z.string(), valor: z.coerce.number().positive().optional(), vencimento: dateISO().optional() })).optional(),
    }), req.body ?? {})
    const c = await prisma.cppCompra.findFirst({ where: { id: String(req.params.id), tenantId }, include: incluir })
    if (!c) throw httpErr(404, 'Compra não encontrada.')
    const alvo = c.contas.filter((x) => x.situacao === 'RASCUNHO' && (!d.ids?.length || d.ids.includes(x.id)))
    if (!alvo.length) throw httpErr(409, 'Nenhuma parcela em rascunho para conferir.')
    for (const a of d.ajustes ?? []) {
      if (!alvo.some((x) => x.id === a.id)) throw httpErr(400, `Ajuste para parcela inexistente ou já conferida: ${a.id}`)
      if (a.valor !== undefined && !d.observacao) throw httpErr(400, 'Informe a observação ao ajustar valores.')
    }
    await prisma.$transaction(async (tx) => {
      for (const x of alvo) {
        const aj = d.ajustes?.find((a) => a.id === x.id)
        const valor = aj?.valor !== undefined ? round2(aj.valor) : x.valor
        const venc = aj?.vencimento ?? x.vencimento
        const ap = await tx.accountPayable.findUnique({ where: { id: x.accountPayableId } })
        if (ap) await tx.accountPayable.update({ where: { id: ap.id }, data: { descricao: ap.descricao.replace(PREFIXO, ''), valor, dataVencimento: venc } })
        await tx.cppContaPagar.update({ where: { id: x.id }, data: { situacao: 'CONFERIDA', valor, vencimento: venc, divergencia: valor !== x.valorOriginal || x.divergencia, observacao: d.observacao ?? x.observacao, conferidoPorId: getUserId(req), conferidoEm: new Date() } })
      }
    })
    await completeReminders({ tenantId, refType: 'CppCompra', refId: c.id, userId: getUserId(req) })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'CONTAS_PAGAR_CONFERIDAS', refType: 'CppCompra', refId: c.id, detalhes: { parcelas: alvo.length } })
    res.json(await prisma.cppContaPagar.findMany({ where: { tenantId, compraId: c.id }, orderBy: { parcela: 'asc' } }))
  }))
}
