// Conferência de recebimento: contagem física x pedido x nota fiscal, divergências (quantidade, valor, qualidade),
// aceite parcial, devolução ao fornecedor e entrada no estoque do almoxarifado.
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, dateISO, pageParams, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { brandHeaderHtml, escapeHtml as esc, getBranding } from '../core/branding'
import { LEITURA, GESTAO } from './catalogo'
import { round2, round3, DAY } from './logic'
import { checarEstoqueMinimo, movimentarTx } from './stock'
import { CPP_SUPER, cppNumero, getPolitica, httpErr } from './cpp'

const mod = 'suprimentos'
const roleOf = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
const EPS = 1e-9

export type Divergencia = 'QUANTIDADE_NOTA' | 'EXCESSO' | 'FALTA' | 'VALOR' | 'QUALIDADE'

/** Função pura: divergências de um item conferido. */
export function calcularDivergencias(i: { pendente: number; contada: number; nota?: number | null; precoPedido: number; precoNota?: number | null; qualidadeOk: boolean }, tolPct: number): Divergencia[] {
  const d: Divergencia[] = []
  if (i.nota != null && Math.abs(i.nota - i.contada) > EPS) d.push('QUANTIDADE_NOTA')
  if (i.contada > i.pendente + EPS) d.push('EXCESSO')
  if (i.contada < Math.min(i.nota ?? i.pendente, i.pendente) - EPS) d.push('FALTA')
  if (i.precoNota != null && i.precoPedido > 0 && (Math.abs(i.precoNota - i.precoPedido) / i.precoPedido) * 100 > tolPct + EPS) d.push('VALOR')
  else if (i.precoNota != null && i.precoPedido === 0 && i.precoNota > 0) d.push('VALOR')
  if (!i.qualidadeOk) d.push('QUALIDADE')
  return d
}

const itemIn = z.object({
  pedidoItemId: z.string(), quantidadeContada: z.coerce.number().min(0), quantidadeNota: z.coerce.number().min(0).optional().nullable(),
  precoNota: z.coerce.number().min(0).optional().nullable(), qualidadeOk: z.boolean().optional(), qualidadeObs: z.string().optional().nullable(),
  loteNumero: z.string().optional().nullable(), validade: dateISO().optional().nullable(),
})
const incluir = { itens: { orderBy: { id: 'asc' as const } } }

async function carregar(tenantId: string, id: string) {
  const c = await prisma.cppConferencia.findFirst({ where: { id, tenantId }, include: incluir })
  if (!c) throw httpErr(404, 'Conferência não encontrada.')
  return c
}

async function resumoPedido(tenantId: string, pedidoId: string) {
  const p = await prisma.supPedido.findFirst({ where: { id: pedidoId, tenantId }, include: { itens: true, fornecedor: { select: { id: true, razaoSocial: true } } } })
  if (!p) return null
  const itens = await prisma.supItem.findMany({ where: { tenantId, id: { in: p.itens.map((i) => i.itemId) } }, select: { id: true, codigo: true, nome: true, unidade: true, controlaLote: true, controlaValidade: true } })
  return { id: p.id, numero: p.numero, status: p.status, fornecedor: p.fornecedor, almoxarifadoId: p.almoxarifadoId, valorTotal: p.valorTotal, frete: p.frete, itens: p.itens.map((i) => ({ ...i, item: itens.find((x) => x.id === i.itemId) ?? null })) }
}

function validarDecisao(i: { contada: number; pendente: number; decisao?: string | null; aceita?: number | null; destino?: string | null; motivo?: string | null; qualidadeOk: boolean }) {
  const aceitavel = Math.min(i.contada, i.pendente)
  if (i.decisao === 'ACEITAR') return { aceita: aceitavel, rejeitada: round3(i.contada - aceitavel) }
  if (i.decisao === 'RECUSAR') return { aceita: 0, rejeitada: i.contada }
  if (i.decisao === 'ACEITE_PARCIAL') {
    const a = i.aceita ?? -1
    if (!(a > 0 && a < i.contada - EPS)) throw httpErr(400, 'Aceite parcial: informe quantidadeAceita maior que zero e menor que a contada.')
    if (a > i.pendente + EPS) throw httpErr(400, 'Quantidade aceita excede o pendente do pedido.')
    return { aceita: round3(a), rejeitada: round3(i.contada - a) }
  }
  throw httpErr(400, 'Decisão inválida (ACEITAR, ACEITE_PARCIAL ou RECUSAR).')
}

/** Reduz as contas a pagar em rascunho quando o recebimento final ficou abaixo do valor aprovado (e sinaliza o Financeiro). */
async function ajustarContasAposRecebimento(tenantId: string, pedidoId: string, userId: string) {
  const compra = await prisma.cppCompra.findFirst({ where: { tenantId, pedidoId, status: 'APROVADA' }, include: { contas: true } })
  const ped = await prisma.supPedido.findFirst({ where: { id: pedidoId, tenantId }, include: { recebimentos: true } })
  if (!compra || !ped || ped.status !== 'RECEBIDO') return { ajustadas: 0, diferenca: 0 }
  const recebido = round2(ped.recebimentos.reduce((s, r) => s + r.valor, 0))
  const dif = round2(recebido - compra.valorTotal)
  if (Math.abs(dif) < 0.01) return { ajustadas: 0, diferenca: 0 }
  const ativas = compra.contas.filter((c) => c.situacao !== 'CANCELADA')
  let ajustadas = 0
  if (dif < 0 && ativas.length && ativas.every((c) => c.situacao === 'RASCUNHO')) {
    const fator = recebido / compra.valorTotal
    let acumulado = 0
    for (let i = 0; i < ativas.length; i++) {
      const c = ativas[i]
      const novo = i === ativas.length - 1 ? round2(recebido - acumulado) : round2(c.valor * fator)
      acumulado += novo
      await prisma.accountPayable.updateMany({ where: { id: c.accountPayableId, tenantId }, data: { valor: novo } })
      await prisma.cppContaPagar.update({ where: { id: c.id }, data: { valor: novo, divergencia: true, observacao: `Ajustada pela conferência: recebido ${recebido.toFixed(2)} de ${compra.valorTotal.toFixed(2)} aprovados.` } })
      ajustadas++
    }
  } else {
    await prisma.cppContaPagar.updateMany({ where: { compraId: compra.id, situacao: { not: 'CANCELADA' } }, data: { divergencia: true } })
  }
  await scheduleReminder({ tenantId, modulo: mod, refType: 'CppCompra', refId: compra.id, dedupeKey: `cpp-divergencia-ap-${compra.id}`, titulo: `Divergência entre recebido e aprovado na compra ${compra.numero} (${dif < 0 ? 'a menor' : 'a maior'}: R$ ${Math.abs(dif).toFixed(2)})`, descricao: dif < 0 ? 'Solicite nota de crédito/ajuste ao fornecedor.' : 'Valor recebido superior ao aprovado: reavalie a aprovação.', dueAt: new Date(Date.now() + 3 * DAY), assigneeRole: 'FINANCE', severity: 'ATENCAO' })
  await audit({ tenantId, userId, modulo: mod, acao: 'CONTAS_AJUSTADAS_CONFERENCIA', refType: 'CppCompra', refId: compra.id, detalhes: { recebido, aprovado: compra.valorTotal, ajustadas } })
  return { ajustadas, diferenca: dif }
}

export function registerConferencia(router: Router) {
  // ---------- Abrir conferência ----------
  router.post('/conferencias', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({
      pedidoId: z.string(), notaFiscal: z.string().optional().nullable(), chaveNfe: z.string().regex(/^\d{44}$/, 'Chave da NF-e deve ter 44 dígitos').optional().nullable(),
      dataNota: dateISO().optional().nullable(), valorNota: z.coerce.number().min(0).optional().nullable(), freteNota: z.coerce.number().min(0).optional().nullable(),
      observacao: z.string().optional().nullable(), itens: z.array(itemIn).min(1),
    }), req.body)
    const p = await prisma.supPedido.findFirst({ where: { id: d.pedidoId, tenantId }, include: { itens: true } })
    if (!p) throw httpErr(404, 'Pedido não encontrado.')
    if (!['EMITIDO', 'PARCIALMENTE_RECEBIDO'].includes(p.status)) throw httpErr(409, `Pedido em ${p.status} não aceita conferência.`)
    const aberta = await prisma.cppConferencia.findFirst({ where: { tenantId, pedidoId: p.id, status: 'EM_CONFERENCIA' } })
    if (aberta) throw httpErr(409, `Já existe a conferência ${aberta.numero} em andamento para este pedido.`)
    if (new Set(d.itens.map((i) => i.pedidoItemId)).size !== d.itens.length) throw httpErr(400, 'Item de pedido repetido na conferência.')
    if (d.notaFiscal) {
      const dupMesmoPedido = await prisma.cppConferencia.findFirst({ where: { tenantId, pedidoId: p.id, notaFiscal: d.notaFiscal, status: 'CONCLUIDA' } })
      if (dupMesmoPedido) throw httpErr(409, `A nota ${d.notaFiscal} já foi conferida neste pedido.`)
    }
    const pol = await getPolitica(tenantId)
    const linhas = d.itens.map((i) => {
      const pi = p.itens.find((x) => x.id === i.pedidoItemId)
      if (!pi) throw httpErr(400, `Item de pedido ${i.pedidoItemId} inválido.`)
      const pendente = round3(pi.quantidade - pi.quantidadeRecebida)
      const qualidadeOk = i.qualidadeOk ?? true
      if (!qualidadeOk && !i.qualidadeObs) throw httpErr(400, 'Descreva o problema de qualidade (qualidadeObs).')
      const div = calcularDivergencias({ pendente, contada: i.quantidadeContada, nota: i.quantidadeNota, precoPedido: pi.precoUnitario, precoNota: i.precoNota, qualidadeOk }, pol.toleranciaPrecoPct)
      return { tenantId, pedidoItemId: pi.id, itemId: pi.itemId, quantidadePendente: pendente, quantidadeNota: i.quantidadeNota ?? null, quantidadeContada: i.quantidadeContada, precoPedido: pi.precoUnitario, precoNota: i.precoNota ?? null, qualidadeOk, qualidadeObs: i.qualidadeObs ?? null, divergencias: div, loteNumero: i.loteNumero ?? null, validade: i.validade ?? null,
        ...(div.length === 0 ? { decisao: 'ACEITAR', quantidadeAceita: i.quantidadeContada } : {}) }
    })
    // Divergência de valor total da nota (soma dos itens da nota + frete x valor informado).
    let divNota = false
    if (d.valorNota != null) {
      const soma = linhas.reduce((s, l) => s + (l.quantidadeNota ?? l.quantidadeContada) * (l.precoNota ?? l.precoPedido), 0) + (d.freteNota ?? 0)
      divNota = Math.abs(soma - d.valorNota) > 0.05
    }
    const conf = await prisma.$transaction(async (tx) => {
      const numero = await cppNumero(tx, tenantId, 'CF')
      const { itens: _i, ...cab } = d
      return tx.cppConferencia.create({ data: { ...cab, tenantId, numero, pedidoId: p.id, conferenteId: getUserId(req), temDivergencia: divNota || linhas.some((l) => l.divergencias.length > 0), itens: { create: linhas } }, include: incluir })
    })
    await audit({ tenantId, userId: getUserId(req), modulo: mod, acao: 'CONFERENCIA_ABERTA', refType: 'CppConferencia', refId: conf.id, detalhes: { pedido: p.numero, divergencias: conf.temDivergencia } })
    res.status(201).json({ ...conf, divergenciaValorNota: divNota })
  }))

  router.get('/conferencias', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'pedidoId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    if (qs(req.query.divergentes) === 'true') where.temDivergencia = true
    const [items, total] = await Promise.all([prisma.cppConferencia.findMany({ where, include: incluir, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppConferencia.count({ where })])
    const peds = await prisma.supPedido.findMany({ where: { tenantId, id: { in: [...new Set(items.map((i) => i.pedidoId))] } }, select: { id: true, numero: true, fornecedor: { select: { razaoSocial: true } } } })
    res.json({ items: items.map((c) => ({ ...c, pedido: peds.find((p) => p.id === c.pedidoId) ?? null })), total, page, pageSize })
  }))

  router.get('/conferencias/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregar(tenantId, String(req.params.id))
    const [pedido, devolucoes] = await Promise.all([resumoPedido(tenantId, c.pedidoId), prisma.cppDevolucaoFornecedor.findMany({ where: { tenantId, conferenciaId: c.id } })])
    res.json({ ...c, pedido, devolucoes })
  }))

  // ---------- Ajustar item ----------
  router.put('/conferencias/:id/itens/:itemId', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({
      quantidadeContada: z.coerce.number().min(0).optional(), quantidadeNota: z.coerce.number().min(0).optional().nullable(), precoNota: z.coerce.number().min(0).optional().nullable(),
      qualidadeOk: z.boolean().optional(), qualidadeObs: z.string().optional().nullable(), loteNumero: z.string().optional().nullable(), validade: dateISO().optional().nullable(),
      decisao: z.enum(['ACEITAR', 'ACEITE_PARCIAL', 'RECUSAR']).optional(), quantidadeAceita: z.coerce.number().min(0).optional(),
      destinoRejeitado: z.enum(['DEVOLVER', 'DESCARTAR', 'AGUARDAR_REPOSICAO']).optional(), motivo: z.string().optional(), aceitarPrecoNota: z.boolean().optional(),
    }), req.body)
    const c = await carregar(tenantId, String(req.params.id))
    if (c.status !== 'EM_CONFERENCIA') throw httpErr(409, 'Conferência não está em andamento.')
    const it = c.itens.find((x) => x.id === String(req.params.itemId))
    if (!it) throw httpErr(404, 'Item da conferência não encontrado.')
    if (d.aceitarPrecoNota && !['FINANCE', ...CPP_SUPER].includes(roleOf(req))) throw httpErr(403, 'Somente Financeiro/Direção podem aceitar preço da nota diferente do pedido.')
    const pol = await getPolitica(tenantId)
    const m = { ...it, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as typeof it & Record<string, any>
    if (m.qualidadeOk === false && !m.qualidadeObs) throw httpErr(400, 'Descreva o problema de qualidade (qualidadeObs).')
    const div = calcularDivergencias({ pendente: it.quantidadePendente, contada: m.quantidadeContada, nota: m.quantidadeNota, precoPedido: it.precoPedido, precoNota: m.precoNota, qualidadeOk: m.qualidadeOk }, pol.toleranciaPrecoPct)
    const data: any = { quantidadeContada: m.quantidadeContada, quantidadeNota: m.quantidadeNota, precoNota: m.precoNota, qualidadeOk: m.qualidadeOk, qualidadeObs: m.qualidadeObs, loteNumero: m.loteNumero, validade: m.validade, divergencias: div, aceitarPrecoNota: m.aceitarPrecoNota ?? it.aceitarPrecoNota, destinoRejeitado: d.destinoRejeitado ?? it.destinoRejeitado, motivo: d.motivo ?? it.motivo }
    if (d.decisao) {
      const r = validarDecisao({ contada: m.quantidadeContada, pendente: it.quantidadePendente, decisao: d.decisao, aceita: d.quantidadeAceita, destino: data.destinoRejeitado, motivo: data.motivo, qualidadeOk: m.qualidadeOk })
      Object.assign(data, { decisao: d.decisao, quantidadeAceita: r.aceita, quantidadeRejeitada: r.rejeitada })
    } else if (div.length === 0) Object.assign(data, { decisao: 'ACEITAR', quantidadeAceita: m.quantidadeContada, quantidadeRejeitada: 0 })
    else if (d.quantidadeContada !== undefined) Object.assign(data, { decisao: null, quantidadeAceita: 0, quantidadeRejeitada: 0 })
    await prisma.cppConferenciaItem.update({ where: { id: it.id }, data })
    const todos = await prisma.cppConferenciaItem.findMany({ where: { conferenciaId: c.id } })
    await prisma.cppConferencia.update({ where: { id: c.id }, data: { temDivergencia: todos.some((x) => x.divergencias.length > 0) } })
    res.json(await carregar(tenantId, c.id))
  }))

  // ---------- Finalizar: recebimento + entrada no estoque + devoluções ----------
  router.post('/conferencias/:id/finalizar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const userId = getUserId(req)
    const d = parseBody(z.object({
      justificativa: z.string().optional(),
      decisoes: z.array(z.object({ itemId: z.string(), decisao: z.enum(['ACEITAR', 'ACEITE_PARCIAL', 'RECUSAR']), quantidadeAceita: z.coerce.number().min(0).optional(), destinoRejeitado: z.enum(['DEVOLVER', 'DESCARTAR', 'AGUARDAR_REPOSICAO']).optional(), aceitarPrecoNota: z.boolean().optional(), motivo: z.string().optional() })).optional(),
    }), req.body ?? {})
    const conf0 = await carregar(tenantId, String(req.params.id))
    if (conf0.status !== 'EM_CONFERENCIA') throw httpErr(409, 'Conferência não está em andamento.')
    const finalRoles = ['FINANCE', ...CPP_SUPER]
    // Resolve decisões de cada item (usa as já gravadas + as enviadas agora).
    const resolvidos = conf0.itens.map((it) => {
      const nova = d.decisoes?.find((x) => x.itemId === it.id)
      const decisao = nova?.decisao ?? it.decisao
      const destino = nova?.destinoRejeitado ?? it.destinoRejeitado
      const motivo = nova?.motivo ?? it.motivo
      const aceitarPreco = nova?.aceitarPrecoNota ?? it.aceitarPrecoNota
      if (aceitarPreco && !finalRoles.includes(roleOf(req))) throw httpErr(403, 'Somente Financeiro/Direção podem aceitar preço da nota diferente do pedido.')
      if (!decisao) throw httpErr(400, `Item ${it.id}: há divergência (${it.divergencias.join(', ')}) sem decisão (ACEITAR, ACEITE_PARCIAL ou RECUSAR).`, { codigo: 'DECISAO_PENDENTE', itemId: it.id })
      const r = validarDecisao({ contada: it.quantidadeContada, pendente: it.quantidadePendente, decisao, aceita: nova?.quantidadeAceita ?? (decisao === 'ACEITE_PARCIAL' ? it.quantidadeAceita : undefined), destino, motivo, qualidadeOk: it.qualidadeOk })
      if (r.rejeitada > EPS && !destino) throw httpErr(400, `Item ${it.id}: informe o destino do rejeitado (DEVOLVER, DESCARTAR ou AGUARDAR_REPOSICAO).`)
      if ((r.rejeitada > EPS || it.divergencias.length > 0) && !(motivo ?? '').trim() && !(d.justificativa ?? '').trim() && it.divergencias.some((x) => x !== 'FALTA')) throw httpErr(400, `Item ${it.id}: informe o motivo/justificativa da decisão sobre a divergência.`)
      if (it.divergencias.includes('VALOR') && !aceitarPreco && it.precoNota != null) { /* custo fica no preço do pedido; divergência registrada */ }
      return { it, decisao, destino, motivo, aceitarPreco, ...r }
    })
    const temAceite = resolvidos.some((r) => r.aceita > EPS)
    const out = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupPedido" WHERE "id" = ${conf0.pedidoId} AND "tenantId" = ${tenantId} FOR UPDATE`
      const claim = await tx.cppConferencia.updateMany({ where: { id: conf0.id, status: 'EM_CONFERENCIA' }, data: { status: 'CONCLUIDA' } })
      if (claim.count === 0) throw httpErr(409, 'Conferência já finalizada.')
      const p = await tx.supPedido.findFirst({ where: { id: conf0.pedidoId, tenantId }, include: { itens: true } })
      if (!p) throw httpErr(404, 'Pedido não encontrado.')
      if (!['EMITIDO', 'PARCIALMENTE_RECEBIDO'].includes(p.status)) throw httpErr(409, `Pedido em ${p.status} não aceita recebimento.`)
      const rec = await tx.supRecebimento.create({ data: { tenantId, pedidoId: p.id, notaFiscal: conf0.notaFiscal, observacao: `Conferência ${conf0.numero}${d.justificativa ? ' — ' + d.justificativa : ''}`, recebidoPorId: userId } })
      const fretePct = p.valorItens > 0 ? p.frete / p.valorItens : 0
      let valorItensPedido = 0
      let valorEfetivo = 0
      const movimentados: string[] = []
      const lotes: Array<{ itemId: string; numero: string; validade: Date }> = []
      const devolucoes: any[] = []
      for (const r of resolvidos) {
        const pi = p.itens.find((x) => x.id === r.it.pedidoItemId)!
        const pendente = round3(pi.quantidade - pi.quantidadeRecebida)
        if (r.aceita > pendente + EPS) throw httpErr(409, `Quantidade aceita (${r.aceita}) excede o pendente atual (${pendente}) do pedido.`)
        await tx.supRecebimentoItem.create({ data: { tenantId, recebimentoId: rec.id, pedidoItemId: pi.id, itemId: pi.itemId, quantidadeRecebida: r.aceita, quantidadeRejeitada: r.rejeitada, motivoRejeicao: r.rejeitada > EPS ? (r.motivo || r.it.qualidadeObs || d.justificativa || 'Rejeitado na conferência') : null, loteNumero: r.it.loteNumero, validade: r.it.validade } })
        const precoEfetivo = r.aceitarPreco && r.it.precoNota != null ? r.it.precoNota : pi.precoUnitario
        if (r.aceita > EPS) {
          await movimentarTx(tx, { tenantId, tipo: 'ENTRADA', itemId: pi.itemId, almoxarifadoId: p.almoxarifadoId, quantidade: r.aceita, custoUnitario: round2(precoEfetivo * (1 + fretePct)), loteNumero: r.it.loteNumero ?? undefined, validade: r.it.validade, origemTipo: 'RECEBIMENTO', origemId: rec.id, cursoId: p.cursoId ?? undefined, laboratorioId: p.laboratorioId ?? undefined, centroCustoId: p.centroCustoId ?? undefined, motivo: `Conferência ${conf0.numero} — Pedido ${p.numero}${conf0.notaFiscal ? ' NF ' + conf0.notaFiscal : ''}`, userId })
          movimentados.push(pi.itemId)
          if (r.it.loteNumero && r.it.validade) lotes.push({ itemId: pi.itemId, numero: r.it.loteNumero, validade: r.it.validade })
          await tx.supPedidoItem.update({ where: { id: pi.id }, data: { quantidadeRecebida: { increment: r.aceita } } })
          if (pi.requisicaoItemId) await tx.supRequisicaoItem.updateMany({ where: { id: pi.requisicaoItemId }, data: { quantidadeAtendida: { increment: r.aceita } } })
          valorItensPedido += r.aceita * pi.precoUnitario
          valorEfetivo += r.aceita * precoEfetivo
        }
        if (r.rejeitada > EPS && (r.destino === 'DEVOLVER' || r.destino === 'AGUARDAR_REPOSICAO')) {
          const num = await cppNumero(tx, tenantId, 'DEV')
          devolucoes.push(await tx.cppDevolucaoFornecedor.create({ data: { tenantId, numero: num, conferenciaId: conf0.id, pedidoId: p.id, fornecedorId: p.fornecedorId, itemId: pi.itemId, quantidade: r.rejeitada, valor: round2(r.rejeitada * pi.precoUnitario), motivo: `${r.destino === 'AGUARDAR_REPOSICAO' ? '[Reposição] ' : ''}${r.motivo || r.it.qualidadeObs || d.justificativa || 'Rejeitado na conferência'}`, origem: 'CONFERENCIA', solicitadoPorId: userId } }))
        }
        await tx.cppConferenciaItem.update({ where: { id: r.it.id }, data: { decisao: r.decisao, quantidadeAceita: r.aceita, quantidadeRejeitada: r.rejeitada, destinoRejeitado: r.destino, motivo: r.motivo, aceitarPrecoNota: r.aceitarPreco } })
      }
      const valorRec = round2(valorEfetivo + (p.valorItens > 0 ? p.frete * (valorItensPedido / p.valorItens) : 0))
      await tx.supRecebimento.update({ where: { id: rec.id }, data: { valor: valorRec } })
      const atual = await tx.supPedidoItem.findMany({ where: { pedidoId: p.id } })
      const completo = atual.every((i) => i.quantidadeRecebida >= i.quantidade - EPS)
      const novoStatus = completo ? 'RECEBIDO' : 'PARCIALMENTE_RECEBIDO'
      await tx.supPedido.update({ where: { id: p.id }, data: { status: novoStatus, recebidoEm: completo ? new Date() : null } })
      if (completo && p.requisicaoId) await tx.supRequisicao.update({ where: { id: p.requisicaoId }, data: { status: 'ATENDIDA' } })
      await tx.cppConferencia.update({ where: { id: conf0.id }, data: { status: 'CONCLUIDA', recebimentoId: rec.id, valorConferido: valorRec, justificativa: d.justificativa ?? null, finalizadaPorId: userId, finalizadaEm: new Date() } })
      return { recebimentoId: rec.id, valor: valorRec, statusPedido: novoStatus, completo, movimentados, lotes, devolucoes, pedido: p }
    }, { timeout: 60_000 })
    if (out.completo) await completeReminders({ tenantId, refType: 'SupPedido', refId: out.pedido.id, userId })
    for (const l of out.lotes) {
      const item = await prisma.supItem.findFirst({ where: { id: l.itemId, tenantId }, select: { nome: true } })
      await scheduleReminder({ tenantId, modulo: mod, refType: 'SupLote', refId: `${out.pedido.almoxarifadoId}:${l.itemId}:${l.numero}`, dedupeKey: `sup-lote-${out.pedido.almoxarifadoId}-${l.itemId}-${l.numero}`, titulo: `Lote ${l.numero} de ${item?.nome ?? 'item'} vence em ${l.validade.toLocaleDateString('pt-BR')}`, dueAt: l.validade, antecedenciaDias: 30, assigneeRole: 'SUPPLIES', severity: 'ATENCAO' })
    }
    for (const dv of out.devolucoes) await scheduleReminder({ tenantId, modulo: mod, refType: 'CppDevolucaoFornecedor', refId: dv.id, dedupeKey: `cpp-dev-${dv.id}`, titulo: `Devolver ao fornecedor (${dv.numero}) — ${dv.quantidade} un.`, dueAt: new Date(Date.now() + 5 * DAY), assigneeRole: 'SUPPLIES', severity: 'ATENCAO' })
    await checarEstoqueMinimo(tenantId, out.movimentados)
    const ajuste = await ajustarContasAposRecebimento(tenantId, out.pedido.id, userId)
    await audit({ tenantId, userId, modulo: mod, acao: 'CONFERENCIA_FINALIZADA', refType: 'CppConferencia', refId: conf0.id, detalhes: { valor: out.valor, status: out.statusPedido, devolucoes: out.devolucoes.length, temAceite, ajuste } })
    res.status(201).json({ conferenciaId: conf0.id, recebimentoId: out.recebimentoId, valor: out.valor, statusPedido: out.statusPedido, devolucoes: out.devolucoes, ajusteContasPagar: ajuste })
  }))

  router.post('/conferencias/:id/cancelar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregar(tenantId, String(req.params.id))
    if (c.status !== 'EM_CONFERENCIA') throw httpErr(409, 'Somente conferências em andamento podem ser canceladas.')
    await prisma.cppConferencia.update({ where: { id: c.id }, data: { status: 'CANCELADA' } })
    res.json({ ok: true })
  }))

  router.get('/conferencias/:id/relatorio', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await carregar(tenantId, String(req.params.id))
    const pedido = await resumoPedido(tenantId, c.pedidoId)
    const b = await getBranding(tenantId)
    const nome = (id: string) => pedido?.itens.find((i) => i.id === id)?.item?.nome ?? id
    const rows = c.itens.map((i) => `<tr><td>${esc(nome(i.pedidoItemId))}</td><td align="right">${i.quantidadePendente}</td><td align="right">${i.quantidadeNota ?? '—'}</td><td align="right">${i.quantidadeContada}</td><td align="right">${i.quantidadeAceita}</td><td align="right">${i.quantidadeRejeitada}</td><td align="right">${i.precoPedido.toFixed(2)}</td><td align="right">${i.precoNota != null ? i.precoNota.toFixed(2) : '—'}</td><td>${esc(i.divergencias.join(', ') || '—')}</td><td>${esc(i.decisao ?? '—')}</td></tr>`).join('')
    res.type('html').send(`<!doctype html><meta charset="utf-8"><body style="max-width:1000px;margin:auto;font:13px sans-serif">${brandHeaderHtml(b, { titulo: `Conferência de recebimento — ${c.numero}`, subtitulo: `Pedido ${pedido?.numero ?? ''} · ${pedido?.fornecedor?.razaoSocial ?? ''} · NF ${c.notaFiscal ?? '—'}` })}
<div style="padding:16px 28px"><p>Situação: <b>${esc(c.status)}</b> · Divergências: <b>${c.temDivergencia ? 'SIM' : 'não'}</b> · Valor conferido: <b>${c.valorConferido != null ? c.valorConferido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</b></p>
<table border="1" cellpadding="5" style="width:100%;border-collapse:collapse"><tr style="background:#f1f5f9"><th>Item</th><th>Pendente</th><th>Nota</th><th>Contada</th><th>Aceita</th><th>Rejeitada</th><th>Preço pedido</th><th>Preço nota</th><th>Divergências</th><th>Decisão</th></tr>${rows}</table>
${c.justificativa ? `<p><b>Justificativa:</b> ${esc(c.justificativa)}</p>` : ''}<div style="display:flex;gap:40px;margin-top:60px"><div style="flex:1;border-top:1px solid #000;text-align:center">Conferente</div><div style="flex:1;border-top:1px solid #000;text-align:center">Responsável pela aprovação</div></div></div></body>`)
  }))

  // ---------- Devoluções ao fornecedor ----------
  router.get('/devolucoes-fornecedor', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['status', 'pedidoId', 'fornecedorId', 'conferenciaId']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const [items, total] = await Promise.all([prisma.cppDevolucaoFornecedor.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.cppDevolucaoFornecedor.count({ where })])
    const [forn, its] = await Promise.all([
      prisma.supFornecedor.findMany({ where: { tenantId, id: { in: [...new Set(items.map((i) => i.fornecedorId))] } }, select: { id: true, razaoSocial: true } }),
      prisma.supItem.findMany({ where: { tenantId, id: { in: [...new Set(items.map((i) => i.itemId))] } }, select: { id: true, nome: true, codigo: true } }),
    ])
    res.json({ items: items.map((i) => ({ ...i, fornecedor: forn.find((f) => f.id === i.fornecedorId)?.razaoSocial ?? null, item: its.find((x) => x.id === i.itemId) ?? null })), total, page, pageSize })
  }))

  // Devolução de material já em estoque (defeito percebido depois): baixa do estoque + registro para o fornecedor.
  router.post('/devolucoes-fornecedor', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ pedidoId: z.string(), pedidoItemId: z.string(), quantidade: z.coerce.number().positive(), motivo: z.string().min(5), loteNumero: z.string().optional() }), req.body)
    const out = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupPedido" WHERE "id" = ${d.pedidoId} AND "tenantId" = ${tenantId} FOR UPDATE`
      const p = await tx.supPedido.findFirst({ where: { id: d.pedidoId, tenantId }, include: { itens: true } })
      if (!p) throw httpErr(404, 'Pedido não encontrado.')
      const pi = p.itens.find((x) => x.id === d.pedidoItemId)
      if (!pi) throw httpErr(404, 'Item do pedido não encontrado.')
      const jaDevolvido = (await tx.cppDevolucaoFornecedor.aggregate({ where: { tenantId, pedidoId: p.id, itemId: pi.itemId, origem: 'POS_ENTRADA', status: { not: 'CANCELADA' } }, _sum: { quantidade: true } }))._sum.quantidade ?? 0
      if (d.quantidade > pi.quantidadeRecebida - jaDevolvido + EPS) throw httpErr(409, `Quantidade acima do recebido ainda não devolvido (${round3(pi.quantidadeRecebida - jaDevolvido)}).`)
      const movs = await movimentarTx(tx, { tenantId, tipo: 'SAIDA', itemId: pi.itemId, almoxarifadoId: p.almoxarifadoId, quantidade: d.quantidade, loteNumero: d.loteNumero, origemTipo: 'DEVOLUCAO_FORNECEDOR', origemId: p.id, motivo: `Devolução ao fornecedor — ${d.motivo}`, userId: getUserId(req) })
      const numero = await cppNumero(tx, tenantId, 'DEV')
      const dev = await tx.cppDevolucaoFornecedor.create({ data: { tenantId, numero, pedidoId: p.id, fornecedorId: p.fornecedorId, itemId: pi.itemId, quantidade: d.quantidade, valor: round2(d.quantidade * pi.precoUnitario), motivo: d.motivo, origem: 'POS_ENTRADA', movimentacaoId: movs[0]?.id, solicitadoPorId: getUserId(req) } })
      return { dev, itemId: pi.itemId }
    })
    await checarEstoqueMinimo(tenantId, [out.itemId])
    res.status(201).json(out.dev)
  }))

  router.post('/devolucoes-fornecedor/:id/status', requireRole(...GESTAO, 'FINANCE'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ status: z.enum(['ENVIADA', 'CREDITADA', 'CANCELADA']), notaDevolucao: z.string().optional() }), req.body)
    const dv = await prisma.cppDevolucaoFornecedor.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!dv) throw httpErr(404, 'Devolução não encontrada.')
    const permitido: Record<string, string[]> = { SOLICITADA: ['ENVIADA', 'CANCELADA'], ENVIADA: ['CREDITADA', 'CANCELADA'], CREDITADA: [], CANCELADA: [] }
    if (!permitido[dv.status].includes(d.status)) throw httpErr(409, `Devolução em ${dv.status} não pode ir para ${d.status}.`)
    if (d.status === 'ENVIADA' && !d.notaDevolucao && !dv.notaDevolucao) throw httpErr(400, 'Informe a nota fiscal de devolução.')
    const up = await prisma.cppDevolucaoFornecedor.update({ where: { id: dv.id }, data: { status: d.status, notaDevolucao: d.notaDevolucao ?? dv.notaDevolucao, atualizadoPorId: getUserId(req) } })
    if (d.status !== 'ENVIADA') await completeReminders({ tenantId, refType: 'CppDevolucaoFornecedor', refId: dv.id })
    res.json(up)
  }))
}

