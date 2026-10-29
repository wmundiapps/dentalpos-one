import { prisma } from '../../lib/prisma'
import { ENCARGOS_PADRAO, TabelasVigentes, calcInss, calcIrrf, tabelasPadrao } from './fiscal'

/** Tabelas vigentes na competência: usa a vigência cadastrada mais recente (<= 1º dia do mês) ou o padrão do código. */
export async function tabelasVigentes(tenantId: string, competencia: string): Promise<TabelasVigentes> {
  const ref = new Date(`${competencia}-01T00:00:00Z`)
  const base = tabelasPadrao(competencia)
  const rows = await prisma.rheTabelaFiscal.findMany({ where: { tenantId, vigenciaInicio: { lte: ref } }, orderBy: { vigenciaInicio: 'desc' } })
  const pick = (tipo: string) => rows.find((r) => r.tipo === tipo)
  const inss = pick('INSS'), irrf = pick('IRRF'), enc = pick('ENCARGOS') ?? pick('FGTS')
  const out: TabelasVigentes = { ...base, origem: { ...base.origem } }
  let validada = true
  if (inss?.faixas) { out.inss = { faixas: inss.faixas as any, teto: Number((inss.parametros as any)?.teto ?? (inss.faixas as any[]).slice(-1)[0].ate) }; out.origem.inss = `cadastro ${inss.vigenciaInicio.toISOString().slice(0, 10)}`; validada = validada && !inss.modeloAValidar }
  else validada = false
  if (irrf?.faixas) { const p: any = irrf.parametros ?? {}; out.irrf = { faixas: irrf.faixas as any, deducaoDependente: Number(p.deducaoDependente ?? 189.59), descontoSimplificado: Number(p.descontoSimplificado ?? 564.8), redutor: p.redutor ?? null }; out.origem.irrf = `cadastro ${irrf.vigenciaInicio.toISOString().slice(0, 10)}`; validada = validada && !irrf.modeloAValidar }
  else validada = false
  if (enc?.parametros) { out.encargos = { ...ENCARGOS_PADRAO, ...(enc.parametros as any) }; out.origem.encargos = `cadastro ${enc.vigenciaInicio.toISOString().slice(0, 10)}`; validada = validada && !enc.modeloAValidar }
  else validada = false
  out.modeloAValidar = !validada
  return out
}
export const inssFn = (t: TabelasVigentes) => (base: number) => calcInss(base, t.inss)
export const irrfFn = (t: TabelasVigentes, dep = 0) => (bruto: number, inss: number) => calcIrrf(bruto, inss, dep, t.irrf).imposto
