import { prisma, r2 } from './common'

interface ContratoValor { valorMensal: number; inicio: Date; reajusteMes: number | null; reajustePercentual: number | null }

/** Valor mensal do contrato na competência (AAAA-MM), aplicando o reajuste anual composto: um reajuste a cada passagem do mês-base após o início. */
export function valorVigente(c: ContratoValor, competencia: string): number {
  if (!c.reajustePercentual || !c.reajusteMes) return r2(c.valorMensal)
  const [a, m] = competencia.split('-').map(Number)
  const ia = c.inicio.getUTCFullYear(), im = c.inicio.getUTCMonth() + 1
  let n = 0
  for (let y = ia; y <= a; y++) {
    const t = y * 12 + c.reajusteMes
    if (t > ia * 12 + im && t <= a * 12 + m) n++
  }
  return r2(c.valorMensal * Math.pow(1 + c.reajustePercentual / 100, n))
}

/** O contrato está em vigor na competência? (início <= fim do mês e fim vazio ou >= início do mês) */
export function vigenteEm(c: { inicio: Date; fim: Date | null }, competencia: string) {
  const [a, m] = competencia.split('-').map(Number)
  const ini = new Date(Date.UTC(a, m - 1, 1)), fim = new Date(Date.UTC(a, m, 0, 23, 59, 59))
  return c.inicio <= fim && (!c.fim || c.fim >= ini)
}

/** Receita recorrente mensal (MRR) na competência: soma dos contratos VIGENTES de clientes ATIVOS. */
export async function mrrDaCompetencia(tenantId: string, competencia: string, clienteIds?: string[] | null) {
  const contratos = await prisma.ctbContrato.findMany({
    where: { tenantId, status: 'VIGENTE', ...(clienteIds ? { clienteId: { in: clienteIds } } : {}) },
    select: { clienteId: true, valorMensal: true, inicio: true, fim: true, reajusteMes: true, reajustePercentual: true },
  })
  const ativos = new Set((await prisma.ctbCliente.findMany({ where: { tenantId, status: 'ATIVO', ...(clienteIds ? { id: { in: clienteIds } } : {}) }, select: { id: true } })).map((c) => c.id))
  const por: Record<string, number> = {}
  let total = 0
  for (const c of contratos) {
    if (!ativos.has(c.clienteId) || !vigenteEm(c, competencia)) continue
    const v = valorVigente(c, competencia)
    por[c.clienteId] = r2((por[c.clienteId] ?? 0) + v)
    total += v
  }
  return { mrr: r2(total), porCliente: por, contratos: Object.keys(por).length }
}

export const STATUS_ABERTOS_TAREFA = ['A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE']

/** Próximo número sequencial por tenant (com nova tentativa se houver corrida na restrição única). */
export async function comNumero<T>(model: 'ctbProposta' | 'ctbContrato', tenantId: string, criar: (numero: number) => Promise<T>): Promise<T> {
  for (let i = 0; i < 5; i++) {
    const max = await (prisma as any)[model].aggregate({ where: { tenantId }, _max: { numero: true } })
    try { return await criar((max._max.numero ?? 0) + 1) } catch (e: any) { if (e?.code !== 'P2002' || i === 4) throw e }
  }
  throw new Error('Falha ao numerar o documento.')
}
