import { prisma } from '../nucleo/db'
import { httpError } from '../nucleo/http'
import { fimCompetencia, inicioCompetencia, r2 } from '../nucleo/util'
import type { MesHistorico } from '../regime/calculo'

/** Empresa do tenant (isolamento): 404 se não existir ou for de outro tenant. */
export async function empresaDoTenant(tenantId: string, id: string) {
  const e = id ? await prisma.ctbEmpresa.findFirst({ where: { id, tenantId } }) : null
  if (!e) throw httpError(404, 'Empresa não encontrada.')
  return e
}

export interface MesCompleto extends MesHistorico { irrf: number; fonte: 'MANUAL' | 'LANCAMENTOS' | 'NOTAS' | 'VAZIO' }

/**
 * Números mensais da empresa para as competências pedidas. Prioridade: histórico informado (CtbHistoricoMensal) >
 * lançamentos contábeis (receita 3.1.*, despesas 4.* e 5.1/5.2.1, folha 5.1.1, compras 4.1.1) > notas fiscais de saída (só receita).
 */
export async function mesesDaEmpresa(tenantId: string, empresaId: string, comps: string[]): Promise<MesCompleto[]> {
  if (!comps.length) return []
  const sorted = [...comps].sort()
  const de = inicioCompetencia(sorted[0]), ate = fimCompetencia(sorted[sorted.length - 1])
  const [manuais, partidas, notas, irrfNotas] = await Promise.all([
    prisma.ctbHistoricoMensal.findMany({ where: { tenantId, empresaId, competencia: { in: comps } } }),
    prisma.ctbPartida.findMany({ where: { tenantId, empresaId, data: { gte: de, lte: ate } }, select: { contaCodigo: true, tipo: true, valor: true, data: true } }),
    prisma.ctbNota.findMany({ where: { tenantId, empresaId, direcao: 'SAIDA', status: 'EMITIDA', competencia: { in: comps } }, select: { competencia: true, valorTotal: true } }),
    prisma.ctbNota.findMany({ where: { tenantId, empresaId, direcao: 'ENTRADA', status: { not: 'CANCELADA' }, competencia: { in: comps } }, select: { competencia: true, impostos: true } }),
  ])
  const manual = new Map(manuais.map((m) => [m.competencia, m]))
  const out: MesCompleto[] = []
  for (const c of comps) {
    const man = manual.get(c)
    const irrfN = irrfNotas.filter((n) => n.competencia === c).reduce((a, n) => a + (Number((n.impostos as any)?.irrf) || 0), 0)
    if (man) { out.push({ competencia: c, receita: man.receitaBruta, despesas: man.despesas, folha: man.folha, compras: man.comprasInsumos, irrf: man.irrfRetido || irrfN, fonte: 'MANUAL' }); continue }
    let receita = 0, despesas = 0, folha = 0, compras = 0, temLanc = false
    for (const p of partidas) {
      if (p.data.toISOString().slice(0, 7) !== c) continue
      temLanc = true
      const s = p.tipo === 'D' ? p.valor : -p.valor
      const k = p.contaCodigo
      if (k.startsWith('3.1')) receita -= s
      else if (k.startsWith('4.') || k.startsWith('5.1') || k.startsWith('5.2.1')) despesas += s
      if (k.startsWith('5.1.1')) folha += s
      if (k.startsWith('4.1.1')) compras += s
    }
    let fonte: MesCompleto['fonte'] = temLanc ? 'LANCAMENTOS' : 'VAZIO'
    if (receita <= 0) { const rn = notas.filter((n) => n.competencia === c).reduce((a, n) => a + n.valorTotal, 0); if (rn > 0) { receita = rn; fonte = temLanc ? fonte : 'NOTAS' } }
    out.push({ competencia: c, receita: r2(Math.max(0, receita)), despesas: r2(Math.max(0, despesas)), folha: r2(Math.max(0, folha)), compras: r2(Math.max(0, compras)), irrf: irrfN, fonte })
  }
  return out
}
