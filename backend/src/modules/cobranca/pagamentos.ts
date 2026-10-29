import { prisma } from '../../lib/prisma'
import { registrarBaixaComLancamento } from '../financeiro/accounting.helpers'
import { audit } from '../core/notify'
import { carregarPoliticas, infoAlunos, montarCarteira, politicaPara, sincronizarCasos } from './carteira'
import { calcularQuitacao, round2, saldoDoTitulo } from './calculo'
import { httpErr } from './util'

const db = prisma as any
export type Forma = 'PIX' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'TRANSFERENCIA'
export const FORMAS: Forma[] = ['PIX', 'BOLETO', 'CARTAO', 'DINHEIRO', 'TRANSFERENCIA']

export interface PagamentoInput {
  tenantId: string
  receivableId: string
  valor?: number // omitido = quita pelo saldo (já considerando desconto de quitação se pedido)
  forma: Forma
  dataPagamento?: Date
  quitacao?: boolean // aplica o desconto de quitação da política
  usuarioId?: string
  observacao?: string
  origem?: string
}

/** Calcula o que falta pagar de um título (com ou sem desconto de quitação) sem gravar nada. */
export async function calcularPagamento(tenantId: string, receivableId: string, opts: { data?: Date; quitacao?: boolean } = {}) {
  const data = opts.data ?? new Date()
  const t = await db.accountReceivable.findFirst({ where: { id: receivableId, tenantId } })
  if (!t) throw httpErr(404, 'Título não encontrado.')
  const [pols, info, aloc] = await Promise.all([carregarPoliticas(tenantId), infoAlunos(tenantId, [t.studentId], data), prisma.cobAlocacao.findMany({ where: { tenantId, receivableId } })])
  const ia = info.get(t.studentId)
  const pol = politicaPara(pols, ia?.segmento ?? 'GRADUACAO')
  const s = saldoDoTitulo(t.valor, t.dataVencimento, data, pol, aloc)
  let desconto = { descontoEncargos: 0, descontoPrincipal: 0, desconto: 0, total: s.saldo }
  let descontoBloqueadoPorBolsa = false
  if (opts.quitacao) {
    descontoBloqueadoPorBolsa = !!(pol.bloqueiaDescontoComBolsa && ia?.temBolsa && pol.descontoQuitacaoPrincipalPct > 0)
    desconto = calcularQuitacao(s.principalRestante, s.encargosDevidos, pol, !descontoBloqueadoPorBolsa)
  }
  return { titulo: t, politica: pol, saldo: s, desconto, totalAPagar: desconto.total, descontoBloqueadoPorBolsa, temBolsa: !!ia?.temBolsa }
}

/**
 * Baixa (total ou parcial) de um título do contas a receber, com lançamento contábil e atualização do caso.
 *  - parcial: abate primeiro os encargos, depois o principal; o título continua em aberto;
 *  - total: o título vira PAGO (claim atômico: só uma requisição baixa), gera PaymentTransaction + AccountingEntry;
 *  - com `quitacao`, o desconto da política (encargos/principal, respeitando bolsa e alçada) é registrado como abatimento.
 */
export async function registrarPagamentoTitulo(inp: PagamentoInput) {
  const data = inp.dataPagamento ?? new Date()
  if (!FORMAS.includes(inp.forma)) throw httpErr(400, 'Forma de pagamento inválida.')
  const calc = await calcularPagamento(inp.tenantId, inp.receivableId, { data, quitacao: inp.quitacao })
  const t = calc.titulo
  if (t.status === 'PAGO') throw httpErr(409, 'Este título já está pago.')
  if (t.status === 'CANCELADO') throw httpErr(409, 'Este título está cancelado.')
  const cobertura = await prisma.cobAcordoTitulo.findFirst({ where: { tenantId: inp.tenantId, receivableId: t.id, acordoId: { in: (await prisma.cobAcordo.findMany({ where: { tenantId: inp.tenantId, status: 'ATIVO' }, select: { id: true } })).map((a) => a.id) } } })
  if (cobertura) throw httpErr(409, 'Este título está coberto por um acordo ativo: pague as parcelas do acordo.')
  const devido = calc.totalAPagar
  const valor = round2(inp.valor ?? devido)
  if (!(valor > 0)) throw httpErr(422, 'Valor inválido.')
  if (valor > devido + 0.01) throw httpErr(422, `Valor maior que o devido (${devido.toFixed(2)}). Não há pagamento a maior.`)
  const total = valor >= devido - 0.01
  if (inp.quitacao && !total) throw httpErr(422, `Desconto de quitação exige pagamento integral de ${devido.toFixed(2)}.`)

  // split: encargos primeiro, depois principal
  const encPagos = Math.min(valor, calc.saldo.encargosDevidos - (inp.quitacao ? calc.desconto.descontoEncargos : 0))
  const encargos = Math.max(0, round2(encPagos))
  const principal = round2(valor - encargos)
  const caso = await prisma.cobCaso.findFirst({ where: { tenantId: inp.tenantId, studentId: t.studentId } })

  const res = await prisma.$transaction(async (tx) => {
    const x = tx as any
    await tx.$queryRaw`SELECT id FROM "AccountReceivable" WHERE id = ${t.id} AND "tenantId" = ${inp.tenantId} FOR UPDATE`
    const fresh = await x.accountReceivable.findFirst({ where: { id: t.id, tenantId: inp.tenantId } })
    if (!fresh || !['PENDENTE', 'ATRASADO'].includes(fresh.status)) throw httpErr(409, 'Este título já foi baixado.')
    const soma = await tx.cobAlocacao.aggregate({ where: { tenantId: inp.tenantId, receivableId: t.id }, _sum: { principal: true, descontoPrincipal: true } })
    if (round2((soma._sum.principal ?? 0) + (soma._sum.descontoPrincipal ?? 0)) !== round2(t.valor - calc.saldo.principalRestante)) throw httpErr(409, 'O saldo do título mudou durante a operação. Tente novamente.')
    const rec = await tx.cobRecebimento.create({
      data: { tenantId: inp.tenantId, casoId: caso?.id, studentId: t.studentId, origem: inp.origem ?? 'BAIXA_TITULO', receivableId: t.id, valor, principal, encargos, desconto: calc.desconto.desconto, forma: inp.forma, dataPagamento: data, registradoPorId: inp.usuarioId, observacao: inp.observacao },
    })
    await tx.cobAlocacao.create({
      data: {
        tenantId: inp.tenantId, receivableId: t.id, recebimentoId: rec.id, origem: inp.quitacao && calc.desconto.desconto > 0 ? 'DESCONTO' : 'PAGAMENTO', principal, encargos,
        descontoPrincipal: inp.quitacao ? calc.desconto.descontoPrincipal : 0, descontoEncargos: inp.quitacao ? calc.desconto.descontoEncargos : 0,
      },
    })
    let upd = fresh
    if (total) {
      const claim = await x.accountReceivable.updateMany({ where: { id: t.id, tenantId: inp.tenantId, status: { in: ['PENDENTE', 'ATRASADO'] } }, data: { status: 'PAGO', dataPagamento: data } })
      if (claim.count === 0) throw httpErr(409, 'Este título já foi baixado.')
      upd = await x.accountReceivable.findFirst({ where: { id: t.id } })
    }
    return { rec, upd }
  })

  // lançamento contábil (transação própria); em caso de falha desfaz a baixa
  let transacaoId: string | undefined
  try {
    const b = await registrarBaixaComLancamento({ tenantId: inp.tenantId, tipo: 'RECEITA', valor, formaPagamento: inp.forma, historico: `Recebimento cobrança — ${t.descricao}${total ? '' : ' (parcial)'}`, accountReceivableId: t.id, dataTransacao: data })
    transacaoId = b.transacao.id
    await prisma.cobRecebimento.update({ where: { id: res.rec.id }, data: { transacaoId } })
  } catch (e) {
    await prisma.cobAlocacao.deleteMany({ where: { recebimentoId: res.rec.id } })
    await prisma.cobRecebimento.delete({ where: { id: res.rec.id } })
    if (total) await db.accountReceivable.updateMany({ where: { id: t.id, tenantId: inp.tenantId }, data: { status: t.status, dataPagamento: null } })
    throw e
  }

  await aposPagamento(inp.tenantId, t.studentId, { receivableId: t.id, valor, quitado: total, now: data })
  await audit({ tenantId: inp.tenantId, userId: inp.usuarioId, modulo: 'cobranca', acao: total ? 'BAIXA_TITULO' : 'PAGAMENTO_PARCIAL', refType: 'AccountReceivable', refId: t.id, detalhes: { valor, principal, encargos, desconto: calc.desconto.desconto, quitacao: !!inp.quitacao } })
  const restante = total ? 0 : round2(devido - valor)
  return { recebimento: { ...res.rec, transacaoId }, titulo: res.upd, quitado: total, desconto: calc.desconto, saldoRestante: restante, descontoBloqueadoPorBolsa: calc.descontoBloqueadoPorBolsa }
}

/** Promessas cumpridas e caso atualizado depois de qualquer pagamento. */
export async function aposPagamento(tenantId: string, studentId: string, p: { receivableId?: string; valor: number; quitado: boolean; now?: Date }) {
  const now = p.now ?? new Date()
  const proms = await prisma.cobPromessa.findMany({ where: { tenantId, studentId, status: 'ABERTA' } })
  for (const pr of proms) {
    if ((pr.receivableId && pr.receivableId === p.receivableId && p.quitado) || p.valor + 0.01 >= pr.valor) {
      await prisma.cobPromessa.update({ where: { id: pr.id }, data: { status: 'CUMPRIDA', resolvidaEm: now } })
    }
  }
  const cart = await montarCarteira(tenantId, now, { studentId })
  const r = await sincronizarCasos(tenantId, cart, now)
  await encerrarEncaminhamentosQuitados(tenantId, studentId, cart.linhas.length === 0 || !cart.linhas.some((l) => l.titulosVencidos > 0 || l.emAcordoValor > 0))
  return r
}

/** Débito quitado: pendências de escalonamento são canceladas e restrições já enviadas ganham o aviso de baixa. */
export async function encerrarEncaminhamentosQuitados(tenantId: string, studentId: string, quitado: boolean) {
  if (!quitado) return
  await prisma.cobEncaminhamento.updateMany({ where: { tenantId, studentId, status: { in: ['AGUARDANDO_APROVACAO', 'GERADO'] } }, data: { status: 'CANCELADO', retornoMotivo: 'Débito quitado antes do envio.' } })
  await prisma.cobEncaminhamento.updateMany({ where: { tenantId, studentId, status: { in: ['ENVIADO', 'ACEITO'] }, tipo: { in: ['NEGATIVACAO', 'PROTESTO', 'JURIDICO'] } }, data: { retornoMotivo: 'DÉBITO QUITADO: solicitar baixa da restrição/encerramento da execução.' } })
}
