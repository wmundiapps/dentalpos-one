import { prisma } from '../../lib/prisma'

/** Conta pagadora padrão do tenant (a marcada como padrão de pagamento, senão a primeira conta bancária ativa). */
export async function contaPadraoPagamento(tenantId: string): Promise<string | null> {
  const padrao = await prisma.tesContaBancaria.findFirst({ where: { tenantId, ativa: true, tipo: 'BANCO', padraoPagamento: true }, select: { id: true } })
  if (padrao) return padrao.id
  const qualquer = await prisma.tesContaBancaria.findFirst({ where: { tenantId, ativa: true, tipo: 'BANCO' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  return qualquer?.id ?? null
}
