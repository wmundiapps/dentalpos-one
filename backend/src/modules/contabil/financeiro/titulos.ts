import { CONTA, garantirPlano } from '../contabilidade/plano'
import { estornar, lancar } from '../contabilidade/lancamentos'
import { prisma } from '../nucleo/db'
import { httpError } from '../nucleo/http'
import type { CtbCtx } from '../nucleo/rbac'
import { hojeMeioDia, r2 } from '../nucleo/util'

export interface TituloIn {
  tipo: 'PAGAR' | 'RECEBER'; descricao: string; parceiroNome: string; parceiroDoc?: string | null; parceiroEmail?: string | null; parceiroTelefone?: string | null
  valor: number; emissao: Date; vencimento: Date; categoria?: string | null; contaContabilCodigo?: string | null; notaId?: string | null; lancar?: boolean
}

/** Situação calculada: ABERTO vencido vira VENCIDO. */
export const situacaoDe = (t: { status: string; vencimento: Date }, hoje = hojeMeioDia()) => (t.status === 'ABERTO' && t.vencimento < hoje ? 'VENCIDO' : t.status)
export const diasAtrasoDe = (t: { status: string; vencimento: Date }, hoje = hojeMeioDia()) => (t.status === 'ABERTO' && t.vencimento < hoje ? Math.floor((hoje.getTime() - t.vencimento.getTime()) / 86_400_000) : 0)

/** Cria o título e (por padrão) o lançamento contábil de competência: receber = D Clientes / C Receita; pagar = D Despesa / C Fornecedores. */
export async function criarTitulo(ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, empresa: { id: string; atividade: string | null }, i: TituloIn) {
  await garantirPlano(ctx.tenantId, empresa.id)
  const servico = !['COMERCIO', 'INDUSTRIA'].includes(String(empresa.atividade))
  const conta = i.contaContabilCodigo || (i.tipo === 'RECEBER' ? (servico ? CONTA.RECEITA_SERVICOS : CONTA.RECEITA_VENDAS) : CONTA.DESPESA_ADM)
  const ct = await prisma.ctbPlanoConta.findFirst({ where: { tenantId: ctx.tenantId, empresaId: empresa.id, codigo: conta } })
  if (!ct || !ct.analitica) throw httpError(400, `Conta contábil inválida para o título: ${conta}.`)
  if (i.tipo === 'RECEBER' && ct.tipo !== 'RECEITA') throw httpError(400, 'Conta a receber precisa usar uma conta de receita.')
  if (i.tipo === 'PAGAR' && !(['CUSTO', 'DESPESA', 'ATIVO'].includes(ct.tipo) || (ct.tipo === 'RECEITA' && ct.natureza === 'D'))) throw httpError(400, 'Conta a pagar precisa usar uma conta de custo, despesa, ativo ou dedução da receita (impostos sobre vendas).')
  return prisma.$transaction(async (tx) => {
    const t = await tx.ctbTitulo.create({
      data: { tenantId: ctx.tenantId, empresaId: empresa.id, tipo: i.tipo, descricao: i.descricao, parceiroNome: i.parceiroNome, parceiroDoc: i.parceiroDoc ?? null, parceiroEmail: i.parceiroEmail ?? null, parceiroTelefone: i.parceiroTelefone ?? null,
        categoria: i.categoria ?? null, valor: r2(i.valor), emissao: i.emissao, vencimento: i.vencimento, contaContabilCodigo: conta, notaId: i.notaId ?? null, criadoPorId: ctx.userId },
    })
    if (i.lancar !== false) {
      const l = await lancar(ctx.tenantId, empresa.id, ctx.userId, {
        data: i.emissao, historico: `${i.tipo === 'RECEBER' ? 'A receber' : 'A pagar'}: ${i.descricao} — ${i.parceiroNome}`, origem: 'TITULO', refId: t.id,
        partidas: i.tipo === 'RECEBER' ? [{ conta: CONTA.CLIENTES, tipo: 'D', valor: t.valor }, { conta, tipo: 'C', valor: t.valor }] : [{ conta, tipo: 'D', valor: t.valor }, { conta: CONTA.FORNECEDORES, tipo: 'C', valor: t.valor }],
      }, tx)
      return tx.ctbTitulo.update({ where: { id: t.id }, data: { lancamentoId: l.id } })
    }
    return t
  })
}

/** Baixa (pagamento/recebimento). A diferença entre valor e valorPago vai para juros/descontos (contas financeiras). */
export async function baixarTitulo(ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, titulo: { id: string; empresaId: string; tipo: string; valor: number; descricao: string; parceiroNome: string }, o: { pagoEm: Date; valorPago?: number; formaPagamento?: string | null; extratoId?: string | null }) {
  const vp = r2(o.valorPago ?? titulo.valor)
  if (!(vp > 0)) throw httpError(400, 'Valor pago inválido.')
  return prisma.$transaction(async (tx) => {
    const upd = await tx.ctbTitulo.updateMany({ where: { id: titulo.id, tenantId: ctx.tenantId, status: 'ABERTO' }, data: { status: 'PAGO', pagoEm: o.pagoEm, valorPago: vp, formaPagamento: o.formaPagamento ?? null, extratoId: o.extratoId ?? null } })
    if (upd.count !== 1) throw httpError(409, 'Este título não está em aberto (já foi baixado ou cancelado).')
    const receber = titulo.tipo === 'RECEBER'
    const diff = r2(vp - titulo.valor)
    const partidas: Array<{ conta: string; tipo: 'D' | 'C'; valor: number }> = receber
      ? [{ conta: CONTA.BANCO, tipo: 'D', valor: vp }, { conta: CONTA.CLIENTES, tipo: 'C', valor: titulo.valor }]
      : [{ conta: CONTA.FORNECEDORES, tipo: 'D', valor: titulo.valor }, { conta: CONTA.BANCO, tipo: 'C', valor: vp }]
    if (diff > 0) partidas.push(receber ? { conta: CONTA.REC_FINANCEIRA, tipo: 'C', valor: diff } : { conta: CONTA.DESP_FINANCEIRA, tipo: 'D', valor: diff })
    if (diff < 0) partidas.push(receber ? { conta: CONTA.DESP_FINANCEIRA, tipo: 'D', valor: -diff } : { conta: CONTA.REC_FINANCEIRA, tipo: 'C', valor: -diff })
    await lancar(ctx.tenantId, titulo.empresaId, ctx.userId, { data: o.pagoEm, historico: `${receber ? 'Recebimento' : 'Pagamento'}: ${titulo.descricao} — ${titulo.parceiroNome}`, origem: 'BAIXA', refId: titulo.id, partidas }, tx)
    return tx.ctbTitulo.findUniqueOrThrow({ where: { id: titulo.id } })
  })
}

/** Cancela um título em aberto e estorna o lançamento de competência. */
export async function cancelarTitulo(ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, titulo: { id: string; empresaId: string; status: string; lancamentoId: string | null }, motivo: string) {
  if (titulo.status !== 'ABERTO') throw httpError(409, 'Só é possível cancelar título em aberto.')
  return prisma.$transaction(async (tx) => {
    const upd = await tx.ctbTitulo.updateMany({ where: { id: titulo.id, tenantId: ctx.tenantId, status: 'ABERTO' }, data: { status: 'CANCELADO' } })
    if (upd.count !== 1) throw httpError(409, 'Este título não está mais em aberto.')
    if (titulo.lancamentoId) {
      const l = await tx.ctbLancamento.findFirst({ where: { id: titulo.lancamentoId, tenantId: ctx.tenantId } })
      if (l && !l.estornado) await estornarDentro(tx, ctx, titulo.empresaId, l.id, `título cancelado (${motivo})`)
    }
    return tx.ctbTitulo.findUniqueOrThrow({ where: { id: titulo.id } })
  })
}

async function estornarDentro(tx: any, ctx: Pick<CtbCtx, 'tenantId' | 'userId'>, empresaId: string, lancId: string, motivo: string) {
  const orig = await tx.ctbLancamento.findFirst({ where: { id: lancId, tenantId: ctx.tenantId, empresaId } })
  const partidas = await tx.ctbPartida.findMany({ where: { lancamentoId: lancId, tenantId: ctx.tenantId } })
  await lancar(ctx.tenantId, empresaId, ctx.userId, { data: orig.data, historico: `Estorno do lançamento ${orig.numero}: ${motivo}`, origem: 'ESTORNO', refId: orig.refId, estornoDeId: orig.id, partidas: partidas.map((p: any) => ({ conta: p.contaCodigo, tipo: p.tipo === 'D' ? 'C' : 'D', valor: p.valor })) }, tx)
  await tx.ctbLancamento.update({ where: { id: orig.id }, data: { estornado: true } })
}
export { estornar }
