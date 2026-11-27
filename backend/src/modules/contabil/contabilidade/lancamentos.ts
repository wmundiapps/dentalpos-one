import { prisma, Prisma } from '../nucleo/db'
import { httpError } from '../nucleo/http'
import { proximoNumero } from '../nucleo/sequencia'
import { r2 } from '../nucleo/util'

export interface PartidaIn { conta: string; tipo: 'D' | 'C'; valor: number }
export interface LancamentoIn { data: Date; historico: string; origem?: string; refId?: string | null; partidas: PartidaIn[]; estornoDeId?: string | null }

/** Valida e grava um lançamento em partidas dobradas (soma dos débitos = soma dos créditos). Aceita transação. */
export async function lancar(tenantId: string, empresaId: string, userId: string | null, l: LancamentoIn, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (l.partidas.length < 2) throw httpError(400, 'Um lançamento precisa de pelo menos duas partidas (débito e crédito).')
  for (const p of l.partidas) if (!(p.valor > 0) || !Number.isFinite(p.valor)) throw httpError(400, 'Todas as partidas precisam ter valor maior que zero.')
  const d = r2(l.partidas.filter((p) => p.tipo === 'D').reduce((a, p) => a + p.valor, 0))
  const c = r2(l.partidas.filter((p) => p.tipo === 'C').reduce((a, p) => a + p.valor, 0))
  if (Math.abs(d - c) > 0.005 || d <= 0) throw httpError(400, `Lançamento desbalanceado: débitos ${d.toFixed(2)} ≠ créditos ${c.toFixed(2)}.`, { codigo: 'CTB_DESBALANCEADO' })
  const codigos = [...new Set(l.partidas.map((p) => p.conta))]
  const contas = await db.ctbPlanoConta.findMany({ where: { tenantId, empresaId, codigo: { in: codigos } }, select: { codigo: true, analitica: true, ativo: true } })
  for (const cod of codigos) {
    const ct = contas.find((x) => x.codigo === cod)
    if (!ct) throw httpError(400, `Conta contábil inexistente: ${cod}.`)
    if (!ct.analitica) throw httpError(400, `A conta ${cod} é sintética (de agrupamento): lance apenas em contas analíticas.`)
    if (!ct.ativo) throw httpError(400, `A conta ${cod} está inativa.`)
  }
  const numero = await proximoNumero(tenantId, empresaId, 'lancamento')
  const lanc = await db.ctbLancamento.create({ data: { tenantId, empresaId, numero, data: l.data, historico: l.historico.slice(0, 300), origem: l.origem ?? 'MANUAL', refId: l.refId ?? null, estornoDeId: l.estornoDeId ?? null, criadoPorId: userId } })
  await db.ctbPartida.createMany({ data: l.partidas.map((p) => ({ tenantId, empresaId, lancamentoId: lanc.id, data: l.data, contaCodigo: p.conta, tipo: p.tipo, valor: r2(p.valor) })) })
  return lanc
}

/** Estorna um lançamento (cria o lançamento inverso e marca o original). */
export async function estornar(tenantId: string, empresaId: string, userId: string | null, lancamentoId: string, motivo: string, data: Date) {
  return prisma.$transaction(async (tx) => {
    const orig = await tx.ctbLancamento.findFirst({ where: { id: lancamentoId, tenantId, empresaId } })
    if (!orig) throw httpError(404, 'Lançamento não encontrado.')
    if (orig.estornado) throw httpError(409, 'Este lançamento já foi estornado.')
    if (orig.estornoDeId) throw httpError(409, 'Um lançamento de estorno não pode ser estornado.')
    const partidas = await tx.ctbPartida.findMany({ where: { lancamentoId: orig.id, tenantId } })
    const novo = await lancar(tenantId, empresaId, userId, {
      data, historico: `Estorno do lançamento ${orig.numero}: ${motivo}`, origem: 'ESTORNO', refId: orig.refId, estornoDeId: orig.id,
      partidas: partidas.map((p) => ({ conta: p.contaCodigo, tipo: p.tipo === 'D' ? 'C' : 'D', valor: p.valor })),
    }, tx)
    await tx.ctbLancamento.update({ where: { id: orig.id }, data: { estornado: true } })
    return novo
  })
}
