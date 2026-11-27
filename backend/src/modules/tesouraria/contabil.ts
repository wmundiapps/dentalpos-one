import { prisma } from '../../lib/prisma'
import { getOrCreateAccount, registrarBaixaComLancamento, CONTAS_PADRAO } from '../financeiro/accounting.helpers'
import { r2 } from './common'

// Contas adicionais usadas pela tesouraria (criadas sob demanda, como no financeiro base).
export const CONTAS_TES = {
  BOLSAS_DESCONTOS: { codigo: '3.9.1', nome: 'Bolsas e Descontos Concedidos (dedução da receita)', tipo: 'DESPESA' as const },
  PERMUTA_ATIVO: { codigo: '1.2.9', nome: 'Bens e Serviços Recebidos em Permuta', tipo: 'ATIVO' as const },
  RECEITA_PERMUTA: { codigo: '3.1.9', nome: 'Receitas de Permuta', tipo: 'RECEITA' as const },
  TRIBUTOS_RETIDOS: { codigo: '2.1.9', nome: 'Tributos e Contribuições Retidos a Recolher', tipo: 'PASSIVO' as const },
  FOLHA: { codigo: '4.2.1', nome: 'Despesas com Pessoal', tipo: 'DESPESA' as const },
  TERCEIROS: { codigo: '4.2.2', nome: 'Serviços de Terceiros', tipo: 'DESPESA' as const },
}

export const contaPadrao = (tenantId: string, c: { codigo: string; nome: string; tipo: any }) => getOrCreateAccount(tenantId, c.codigo, c.nome, c.tipo)

/** Lançamento de partida dobrada avulso (sem PaymentTransaction), usado por permutas, bolsas e retenções. */
export async function lancarPartidaDobrada(p: { tenantId: string; debitoId: string; creditoId: string; valor: number; historico: string; data?: Date }) {
  if (p.debitoId === p.creditoId) throw Object.assign(new Error('Débito e crédito não podem ser a mesma conta.'), { status: 400 })
  return prisma.accountingEntry.create({ data: { tenantId: p.tenantId, data: p.data ?? new Date(), contaDebitoId: p.debitoId, contaCreditoId: p.creditoId, valor: r2(p.valor), historico: p.historico } })
}

/** Dedução de receita: bolsas e descontos concedidos na mensalidade (D Bolsas/Descontos, C Receita de Mensalidades). */
export async function lancarDeducaoReceita(tenantId: string, valor: number, historico: string, data?: Date) {
  if (valor <= 0) return null
  const [ded, rec] = await Promise.all([
    contaPadrao(tenantId, CONTAS_TES.BOLSAS_DESCONTOS),
    getOrCreateAccount(tenantId, CONTAS_PADRAO.RECEITA_MENSALIDADE.codigo, CONTAS_PADRAO.RECEITA_MENSALIDADE.nome, CONTAS_PADRAO.RECEITA_MENSALIDADE.tipo),
  ])
  return lancarPartidaDobrada({ tenantId, debitoId: ded.id, creditoId: rec.id, valor, historico, data })
}

/** Retenções na fonte: o caixa sai pelo líquido; a diferença fica em obrigações a recolher (D Caixa, C Tributos retidos). */
export async function lancarRetencoes(tenantId: string, valor: number, historico: string, data?: Date) {
  if (valor <= 0) return null
  const [caixa, trib] = await Promise.all([
    getOrCreateAccount(tenantId, CONTAS_PADRAO.CAIXA.codigo, CONTAS_PADRAO.CAIXA.nome, CONTAS_PADRAO.CAIXA.tipo),
    contaPadrao(tenantId, CONTAS_TES.TRIBUTOS_RETIDOS),
  ])
  return lancarPartidaDobrada({ tenantId, debitoId: caixa.id, creditoId: trib.id, valor, historico, data })
}

export { registrarBaixaComLancamento, getOrCreateAccount, CONTAS_PADRAO }
