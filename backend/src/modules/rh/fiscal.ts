// ============================================================
// RH — tabelas fiscais (INSS, IRRF, FGTS, encargos) e cálculo SIMPLIFICADO e PARAMETRIZÁVEL.
// *** MODELO A VALIDAR POR CONTADOR ***: as tabelas padrão abaixo são valores de referência (vigências 2025/2026)
// que a instituição deve conferir e ajustar em /api/edu/rh/folha/tabelas (por vigência). Não substituem eSocial/DCTFWeb.
// ============================================================
import { r2 } from './calculo'

export interface Faixa { ate: number | null; aliquota: number; deducao?: number }   // aliquota em % ; ate=null => sem limite
export interface TabelaInss { faixas: Faixa[]; teto: number }
export interface TabelaIrrf {
  faixas: Faixa[]; deducaoDependente: number; descontoSimplificado: number
  redutor?: { isentoAte: number; ate: number; a: number; b: number } | null     // Lei 15.270/2025 (a partir de 2026)
}
export interface Encargos { fgtsPct: number; fgtsAprendizPct: number; patronalInssPct: number; ratPct: number; terceirosPct: number; proLaboreInssPct: number; rpaInssPct: number }

export const INSS_2025: TabelaInss = { teto: 8157.41, faixas: [{ ate: 1518.0, aliquota: 7.5 }, { ate: 2793.88, aliquota: 9 }, { ate: 4190.83, aliquota: 12 }, { ate: 8157.41, aliquota: 14 }] }
export const INSS_2026: TabelaInss = { teto: 8475.55, faixas: [{ ate: 1621.0, aliquota: 7.5 }, { ate: 2902.84, aliquota: 9 }, { ate: 4354.27, aliquota: 12 }, { ate: 8475.55, aliquota: 14 }] }
const IRRF_FAIXAS: Faixa[] = [
  { ate: 2428.8, aliquota: 0, deducao: 0 }, { ate: 2826.65, aliquota: 7.5, deducao: 182.16 }, { ate: 3751.05, aliquota: 15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 22.5, deducao: 675.49 }, { ate: null, aliquota: 27.5, deducao: 908.73 },
]
export const IRRF_2025: TabelaIrrf = { faixas: IRRF_FAIXAS, deducaoDependente: 189.59, descontoSimplificado: 564.8, redutor: null }
export const IRRF_2026: TabelaIrrf = { ...IRRF_2025, redutor: { isentoAte: 5000, ate: 7350, a: 978.62, b: 0.133145 } }
export const ENCARGOS_PADRAO: Encargos = { fgtsPct: 8, fgtsAprendizPct: 2, patronalInssPct: 20, ratPct: 2, terceirosPct: 5.8, proLaboreInssPct: 11, rpaInssPct: 11 }

export interface TabelasVigentes { inss: TabelaInss; irrf: TabelaIrrf; encargos: Encargos; origem: { inss: string; irrf: string; encargos: string }; modeloAValidar: boolean }

export function tabelasPadrao(competencia: string): TabelasVigentes {
  const ano = +competencia.slice(0, 4)
  return {
    inss: ano >= 2026 ? INSS_2026 : INSS_2025, irrf: ano >= 2026 ? IRRF_2026 : IRRF_2025, encargos: ENCARGOS_PADRAO,
    origem: { inss: `padrão ${ano >= 2026 ? 2026 : 2025}`, irrf: `padrão ${ano >= 2026 ? 2026 : 2025}`, encargos: 'padrão' }, modeloAValidar: true,
  }
}

/** INSS progressivo por faixas (cada faixa incide sobre a parcela correspondente), limitado ao teto. */
export function calcInss(base: number, t: TabelaInss): number {
  if (base <= 0) return 0
  let prev = 0, tot = 0
  const b = Math.min(base, t.teto)
  for (const f of t.faixas) {
    const lim = f.ate ?? Infinity
    if (b > prev) tot += (Math.min(b, lim) - prev) * (f.aliquota / 100)
    prev = lim
    if (b <= lim) break
  }
  return r2(tot)
}

export interface IrrfDetalhe { imposto: number; base: number; metodo: 'LEGAL' | 'SIMPLIFICADO' | 'ISENTO'; baseLegal: number; baseSimplificada: number; aliquota: number }
/** IRRF mensal: usa a MENOR base entre deduções legais (INSS + dependentes) e desconto simplificado; aplica redutor (2026) se parametrizado. */
export function calcIrrf(rendimento: number, inss: number, dependentes: number, t: TabelaIrrf, opts: { pensao?: number } = {}): IrrfDetalhe {
  const baseLegal = rendimento - inss - dependentes * t.deducaoDependente - (opts.pensao ?? 0)
  const baseSimpl = rendimento - t.descontoSimplificado
  let base = Math.min(baseLegal, baseSimpl)
  let metodo: IrrfDetalhe['metodo'] = baseSimpl < baseLegal ? 'SIMPLIFICADO' : 'LEGAL'
  base = Math.max(0, base)
  let imposto = 0, aliq = 0
  for (const f of t.faixas) { if (f.ate === null || base <= f.ate) { imposto = Math.max(0, base * (f.aliquota / 100) - (f.deducao ?? 0)); aliq = f.aliquota; break } }
  if (t.redutor) {
    if (rendimento <= t.redutor.isentoAte) imposto = 0
    else if (rendimento <= t.redutor.ate) imposto = Math.max(0, imposto - Math.max(0, t.redutor.a - t.redutor.b * rendimento))
  }
  imposto = r2(imposto)
  if (imposto === 0) metodo = 'ISENTO'
  return { imposto, base: r2(base), metodo, baseLegal: r2(baseLegal), baseSimplificada: r2(baseSimpl), aliquota: aliq }
}

export function calcFgts(base: number, e: Encargos, aprendiz = false): number { return r2(base * ((aprendiz ? e.fgtsAprendizPct : e.fgtsPct) / 100)) }
/** INSS de contribuinte individual (pró-labore/RPA): alíquota fixa sobre o bruto, limitada ao teto do INSS. */
export function calcInssIndividual(bruto: number, aliquotaPct: number, t: TabelaInss, jaRetido = 0): number {
  const max = r2(t.teto * (aliquotaPct / 100))
  return r2(Math.max(0, Math.min(bruto * (aliquotaPct / 100), max - jaRetido)))
}
export function patronal(base: number, e: Encargos): number { return r2(base * ((e.patronalInssPct + e.ratPct + e.terceirosPct) / 100)) }

/** Valida estrutura de tabela enviada pelo usuário (retorna erros). */
export function validarTabela(tipo: string, faixas: any, parametros: any): string[] {
  const erros: string[] = []
  if (tipo === 'INSS' || tipo === 'IRRF') {
    if (!Array.isArray(faixas) || !faixas.length) return ['Informe as faixas.']
    let prev = -1
    faixas.forEach((f: any, i: number) => {
      if (typeof f.aliquota !== 'number' || f.aliquota < 0 || f.aliquota > 100) erros.push(`Faixa ${i + 1}: alíquota inválida.`)
      if (f.ate !== null && f.ate !== undefined) { if (typeof f.ate !== 'number' || f.ate <= prev) erros.push(`Faixa ${i + 1}: limite deve ser crescente.`); else prev = f.ate }
      else if (i !== faixas.length - 1) erros.push(`Faixa ${i + 1}: só a última pode ser sem limite.`)
    })
    if (tipo === 'INSS' && !(parametros?.teto > 0)) erros.push('INSS exige parametros.teto.')
    if (tipo === 'IRRF' && !(parametros?.deducaoDependente >= 0)) erros.push('IRRF exige parametros.deducaoDependente.')
  }
  if (tipo === 'ENCARGOS' || tipo === 'FGTS') {
    for (const k of ['fgtsPct', 'patronalInssPct', 'ratPct', 'terceirosPct']) if (parametros?.[k] !== undefined && !(parametros[k] >= 0 && parametros[k] <= 100)) erros.push(`${k} inválido.`)
  }
  return erros
}
