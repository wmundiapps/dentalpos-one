import { prisma } from './host2'

// Tabelas fiscais PARAMETRIZADAS e VERSIONADAS por vigência (INSS, IRRF mensal, IRPF anual, salário mínimo, FGTS).
// Os valores padrão abaixo são REFERENCIAIS e podem estar desatualizados: sempre confira nas normas oficiais (Receita Federal, Portarias
// do MPS/MF) e cadastre a nova vigência em POST /api/edu/contabil/parametros (tabela CtbParam, por tenant). O cálculo escolhe a versão
// cuja vigência inicia antes (ou na) data de referência. Tudo é ESTIMATIVA a conferir pelo contador.

export interface FaixaInss { ate: number; aliquota: number }
export interface TabelaInss { faixas: FaixaInss[]; teto: number }
export interface FaixaIr { ate: number | null; aliquota: number; deducao: number }
export interface Redutor { isencaoAte: number; reducaoAte: number; a: number; b: number }
export interface TabelaIrrf { faixas: FaixaIr[]; dedDependente: number; descontoSimplificado: number; redutor?: Redutor | null }
export interface TabelaIrpfAnual {
  faixas: FaixaIr[]; dedDependente: number; limiteEducacao: number; simplificadoPercentual: number; simplificadoLimite: number; redutor?: Redutor | null; limitePgblPercentual: number
}

interface Versao<T> { vigenciaInicio: string; fonte: string; dados: T }

export const PADRAO_INSS: Versao<TabelaInss>[] = [
  { vigenciaInicio: '2025-01-01', fonte: 'Portaria Interministerial MPS/MF 6/2025 (referência; conferir)', dados: { teto: 8157.41, faixas: [{ ate: 1518, aliquota: 0.075 }, { ate: 2793.88, aliquota: 0.09 }, { ate: 4190.83, aliquota: 0.12 }, { ate: 8157.41, aliquota: 0.14 }] } },
  { vigenciaInicio: '2026-01-01', fonte: 'Portaria MPS/MF de reajuste 2026 (referência; conferir)', dados: { teto: 8475.55, faixas: [{ ate: 1621, aliquota: 0.075 }, { ate: 2902.84, aliquota: 0.09 }, { ate: 4354.27, aliquota: 0.12 }, { ate: 8475.55, aliquota: 0.14 }] } },
]

const FAIXAS_IRRF_2024: FaixaIr[] = [
  { ate: 2259.2, aliquota: 0, deducao: 0 }, { ate: 2826.65, aliquota: 0.075, deducao: 169.44 }, { ate: 3751.05, aliquota: 0.15, deducao: 381.44 }, { ate: 4664.68, aliquota: 0.225, deducao: 662.77 }, { ate: null, aliquota: 0.275, deducao: 896 },
]
const FAIXAS_IRRF_2025: FaixaIr[] = [
  { ate: 2428.8, aliquota: 0, deducao: 0 }, { ate: 2826.65, aliquota: 0.075, deducao: 182.16 }, { ate: 3751.05, aliquota: 0.15, deducao: 394.16 }, { ate: 4664.68, aliquota: 0.225, deducao: 675.49 }, { ate: null, aliquota: 0.275, deducao: 908.73 },
]
export const PADRAO_IRRF: Versao<TabelaIrrf>[] = [
  { vigenciaInicio: '2024-02-01', fonte: 'Lei 14.848/2024 (referência; conferir)', dados: { faixas: FAIXAS_IRRF_2024, dedDependente: 189.59, descontoSimplificado: 564.8, redutor: null } },
  { vigenciaInicio: '2025-05-01', fonte: 'MP 1.294/2025 (referência; conferir)', dados: { faixas: FAIXAS_IRRF_2025, dedDependente: 189.59, descontoSimplificado: 607.2, redutor: null } },
  { vigenciaInicio: '2026-01-01', fonte: 'Lei 15.270/2025 — isenção até R$ 5 mil/mês com redutor até R$ 7.350 (referência; conferir)', dados: { faixas: FAIXAS_IRRF_2025, dedDependente: 189.59, descontoSimplificado: 607.2, redutor: { isencaoAte: 5000, reducaoAte: 7350, a: 978.62, b: 0.133145 } } },
]

const anual = (f: FaixaIr[]): FaixaIr[] => f.map((x) => ({ ate: x.ate == null ? null : Math.round(x.ate * 12 * 100) / 100, aliquota: x.aliquota, deducao: Math.round(x.deducao * 12 * 100) / 100 }))
export const PADRAO_IRPF: Versao<TabelaIrpfAnual>[] = [
  { vigenciaInicio: '2025-01-01', fonte: 'Tabela anual do exercício 2026 / ano-calendário 2025 (referência; conferir)', dados: { faixas: anual(FAIXAS_IRRF_2024), dedDependente: 2275.08, limiteEducacao: 3561.5, simplificadoPercentual: 0.2, simplificadoLimite: 16754.34, redutor: null, limitePgblPercentual: 0.12 } },
  { vigenciaInicio: '2026-01-01', fonte: 'Tabela anual do exercício 2027 / ano-calendário 2026 com redutor da Lei 15.270/2025 (referência; conferir)', dados: { faixas: anual(FAIXAS_IRRF_2025), dedDependente: 2275.08, limiteEducacao: 3561.5, simplificadoPercentual: 0.2, simplificadoLimite: 16754.34, redutor: { isencaoAte: 60000, reducaoAte: 88200, a: 11743.44, b: 0.133145 }, limitePgblPercentual: 0.12 } },
]

export const PADRAO_SALARIO_MINIMO: Versao<{ valor: number }>[] = [
  { vigenciaInicio: '2025-01-01', fonte: 'Decreto 12.342/2024 (referência)', dados: { valor: 1518 } },
  { vigenciaInicio: '2026-01-01', fonte: 'Decreto de reajuste 2026 (referência; conferir)', dados: { valor: 1621 } },
]
export const PADRAO_FGTS: Versao<{ aliquota: number; multaSemJustaCausa: number; multaAcordo: number }>[] = [
  { vigenciaInicio: '2000-01-01', fonte: 'Lei 8.036/1990 e LC 110/2001 (referência)', dados: { aliquota: 0.08, multaSemJustaCausa: 0.4, multaAcordo: 0.2 } },
]

export const CHAVES = ['INSS', 'IRRF', 'IRPF_ANUAL', 'SALARIO_MINIMO', 'FGTS'] as const
export type ChaveParam = (typeof CHAVES)[number]
const PADROES: Record<ChaveParam, Versao<any>[]> = { INSS: PADRAO_INSS, IRRF: PADRAO_IRRF, IRPF_ANUAL: PADRAO_IRPF, SALARIO_MINIMO: PADRAO_SALARIO_MINIMO, FGTS: PADRAO_FGTS }

export interface VersaoResolvida<T> { vigenciaInicio: string; fonte: string; origem: 'PADRAO' | 'TENANT'; dados: T }

/** Escolhe a versão vigente em `ref` entre os padrões e as vigências cadastradas pelo tenant (a do tenant vence em caso de mesma data). */
export async function versaoVigente<T = any>(tenantId: string, chave: ChaveParam, ref: Date): Promise<VersaoResolvida<T>> {
  const doTenant = await prisma.ctbParam.findMany({ where: { tenantId, chave, ativo: true, vigenciaInicio: { lte: ref } }, orderBy: { vigenciaInicio: 'desc' }, take: 1 })
  const padrao = [...PADROES[chave]].filter((v) => new Date(v.vigenciaInicio + 'T12:00:00Z') <= ref).sort((a, b) => (a.vigenciaInicio < b.vigenciaInicio ? 1 : -1))[0]
  const t = doTenant[0]
  if (t && (!padrao || t.vigenciaInicio.toISOString().slice(0, 10) >= padrao.vigenciaInicio)) return { vigenciaInicio: t.vigenciaInicio.toISOString().slice(0, 10), fonte: t.fonte || 'Cadastrada pelo escritório', origem: 'TENANT', dados: t.dados as any }
  if (!padrao) return { vigenciaInicio: PADROES[chave][0].vigenciaInicio, fonte: PADROES[chave][0].fonte, origem: 'PADRAO', dados: PADROES[chave][0].dados }
  return { ...padrao, origem: 'PADRAO' }
}

export interface TabelasFolha { inss: TabelaInss; irrf: TabelaIrrf; salarioMinimo: number; fgts: { aliquota: number; multaSemJustaCausa: number; multaAcordo: number }; versoes: Record<string, string> }
export async function tabelasFolha(tenantId: string, ref: Date): Promise<TabelasFolha> {
  const [inss, irrf, sm, fgts] = await Promise.all([versaoVigente<TabelaInss>(tenantId, 'INSS', ref), versaoVigente<TabelaIrrf>(tenantId, 'IRRF', ref), versaoVigente<{ valor: number }>(tenantId, 'SALARIO_MINIMO', ref), versaoVigente<any>(tenantId, 'FGTS', ref)])
  return { inss: inss.dados, irrf: irrf.dados, salarioMinimo: sm.dados.valor, fgts: fgts.dados, versoes: { INSS: `${inss.vigenciaInicio} (${inss.origem})`, IRRF: `${irrf.vigenciaInicio} (${irrf.origem})`, SALARIO_MINIMO: `${sm.vigenciaInicio} (${sm.origem})`, FGTS: `${fgts.vigenciaInicio} (${fgts.origem})` } }
}

export async function listarVersoes(tenantId: string) {
  const t = await prisma.ctbParam.findMany({ where: { tenantId }, orderBy: [{ chave: 'asc' }, { vigenciaInicio: 'desc' }] })
  return {
    padrao: CHAVES.flatMap((c) => PADROES[c].map((v) => ({ chave: c, vigenciaInicio: v.vigenciaInicio, fonte: v.fonte, origem: 'PADRAO', dados: v.dados }))),
    tenant: t.map((x) => ({ id: x.id, chave: x.chave, vigenciaInicio: x.vigenciaInicio.toISOString().slice(0, 10), fonte: x.fonte, origem: 'TENANT', ativo: x.ativo, dados: x.dados })),
    aviso: 'Valores padrão são referenciais e podem estar desatualizados. Cadastre a vigência oficial vigente e confira com o contador.',
  }
}
