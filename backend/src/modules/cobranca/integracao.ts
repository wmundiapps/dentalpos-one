import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { aposPagamento } from './pagamentos'
import { round2 } from './calculo'

const db = prisma as any

/**
 * Gancho chamado pelo contas a receber (financeiro/receivable.ts) depois de uma baixa feita FORA da Cobrança
 * (tela do financeiro, webhook do gateway). Se o aluno está em cobrança: registra o recebimento, cumpre promessas,
 * encerra o caso quando não resta débito e a régua deixa de correr. Nunca lança (o financeiro não pode falhar por causa disto).
 */
export async function aoReceberTitulo(tenantId: string, receivableId: string): Promise<void> {
  try {
    const t = await db.accountReceivable.findFirst({ where: { id: receivableId, tenantId } })
    if (!t || t.status !== 'PAGO') return
    const caso = await prisma.cobCaso.findFirst({ where: { tenantId, studentId: t.studentId } })
    if (!caso) return
    const ja = await prisma.cobRecebimento.findFirst({ where: { tenantId, receivableId, status: 'ATIVO' } })
    if (!ja) {
      const tr = await db.paymentTransaction.findFirst({ where: { tenantId, accountReceivableId: receivableId }, orderBy: { dataTransacao: 'desc' } })
      const ab = await prisma.cobAlocacao.aggregate({ where: { tenantId, receivableId }, _sum: { principal: true, descontoPrincipal: true } })
      const restante = round2(t.valor - (ab._sum.principal ?? 0) - (ab._sum.descontoPrincipal ?? 0))
      await prisma.cobRecebimento.create({ data: { tenantId, casoId: caso.id, studentId: t.studentId, origem: 'FINANCEIRO', receivableId, valor: tr?.valor ?? restante, principal: restante, forma: tr?.formaPagamento ?? 'PIX', dataPagamento: t.dataPagamento ?? new Date(), transacaoId: tr?.id, observacao: 'Baixa feita pelo contas a receber (fora da cobrança).' } })
    }
    await aposPagamento(tenantId, t.studentId, { receivableId, valor: t.valor, quitado: true, now: t.dataPagamento ?? new Date() })
    await audit({ tenantId, modulo: 'cobranca', acao: 'BAIXA_EXTERNA_CONCILIADA', refType: 'AccountReceivable', refId: receivableId })
  } catch (e) {
    console.error('[cobranca.aoReceberTitulo]', e)
  }
}
