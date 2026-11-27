// ============================================================================
// TABELAS FISCAIS VERSIONADAS — parâmetros usados nos cálculos de regime e de guias.
//
// ATENÇÃO: estes valores são uma TRANSCRIÇÃO de referência (alíquotas e limites conhecidos na data de vigência abaixo)
// e PRECISAM SER CONFERIDOS por um contador com a legislação vigente antes de qualquer uso real. Alíquotas mudam
// (leis, decretos, reforma tributária, portarias, legislação municipal e estadual). Nada aqui é "oficial".
//
// Para atualizar: acrescente uma nova versão em TABELAS_VERSOES com `vigenteDesde` e mantenha as anteriores (histórico).
// `tabelasVigentes(data)` escolhe a versão cuja vigência cobre a data da competência calculada.
// ============================================================================

export interface FaixaSimples { ate: number; aliquota: number; deduzir: number }   // aliquota em %; ate = teto da RBT12 da faixa
export type AnexoSimples = 'I' | 'II' | 'III' | 'IV' | 'V'
export type Atividade = 'COMERCIO' | 'INDUSTRIA' | 'SERVICOS' | 'SERVICOS_FATOR_R' | 'SERVICOS_ANEXO_IV' | 'SERVICOS_HOSPITALAR' | 'TRANSPORTE_CARGAS'

export interface TabelasFiscais {
  versao: string
  vigenteDesde: string          // AAAA-MM-DD
  situacao: string              // sempre explicita que precisa conferência
  fontes: string[]              // referências legais (para o contador conferir)
  salarioMinimo: number
  mei: { limiteAnual: number; toleranciaExcessoPct: number; inssPctSalarioMinimo: number; issFixo: number; icmsFixo: number; patronalComFuncionarioPct: number }
  simples: { limiteAnual: number; sublimiteAnual: number; fatorRMinPct: number; cppPatronalPct: number; ratPct: number; anexos: Record<AnexoSimples, FaixaSimples[]> }
  presumido: { presuncaoIrpj: Record<Atividade, number>; presuncaoCsll: Record<Atividade, number>; irpjPct: number; irpjAdicionalPct: number; adicionalLimiteTrimestral: number; csllPct: number; pisPct: number; cofinsPct: number; limiteReceitaAnual: number }
  real: { irpjPct: number; irpjAdicionalPct: number; adicionalLimiteTrimestral: number; csllPct: number; pisPct: number; cofinsPct: number }
  encargosFolha: { patronalPct: number; ratPct: number; terceirosPct: number; fgtsPct: number; seguradosMediaPct: number }
  indiretos: { icmsAliquotaPadraoPct: number; issAliquotaPadraoPct: number; issMinimoPct: number; issMaximoPct: number }
  carneLeao: { faixas: Array<{ ate: number; aliquota: number; deduzir: number }>; descontoSimplificado: number; isencaoRedutorAte: number; redutorMaxAte: number; redutorA: number; redutorB: number }
  guias: { diaVencimentoDas: number; diaVencimentoPisCofins: number; diaVencimentoIrrf: number; diaVencimentoGps: number; diaVencimentoFgts: number; diaVencimentoIssPadrao: number; multaDiaPct: number; multaMaximaPct: number; selicMensalPctAproximada: number }
}

export const TABELAS_VERSOES: TabelasFiscais[] = [
  {
    versao: '2026.1-REFERENCIA',
    vigenteDesde: '2026-01-01',
    situacao: 'REFERÊNCIA — NÃO CONFERIDA POR CONTADOR. Confirme alíquotas, faixas, limites e vencimentos na legislação vigente antes de usar.',
    fontes: [
      'Lei Complementar 123/2006 e Resolução CGSN 140/2018 (Simples Nacional, MEI, anexos e fator R)',
      'Lei 9.249/1995 e Lei 9.430/1996 (Lucro Presumido/Real: presunção, IRPJ, CSLL)',
      'Leis 10.637/2002 e 10.833/2003 (PIS/COFINS não cumulativo); Lei 9.718/1998 (cumulativo)',
      'Lei Complementar 116/2003 (ISS) e legislação municipal; legislação estadual do ICMS',
      'Lei 8.212/1991 (contribuições previdenciárias) e Lei 8.036/1990 (FGTS)',
      'Tabela mensal do IRPF e redutor (Lei 15.270/2025 — conferir)',
    ],
    salarioMinimo: 1621,
    mei: { limiteAnual: 81000, toleranciaExcessoPct: 20, inssPctSalarioMinimo: 5, issFixo: 5, icmsFixo: 1, patronalComFuncionarioPct: 3 },
    simples: {
      limiteAnual: 4_800_000, sublimiteAnual: 3_600_000, fatorRMinPct: 28, cppPatronalPct: 20, ratPct: 2,
      anexos: {
        I: [
          { ate: 180_000, aliquota: 4.0, deduzir: 0 }, { ate: 360_000, aliquota: 7.3, deduzir: 5_940 }, { ate: 720_000, aliquota: 9.5, deduzir: 13_860 },
          { ate: 1_800_000, aliquota: 10.7, deduzir: 22_500 }, { ate: 3_600_000, aliquota: 14.3, deduzir: 87_300 }, { ate: 4_800_000, aliquota: 19.0, deduzir: 378_000 },
        ],
        II: [
          { ate: 180_000, aliquota: 4.5, deduzir: 0 }, { ate: 360_000, aliquota: 7.8, deduzir: 5_940 }, { ate: 720_000, aliquota: 10.0, deduzir: 13_860 },
          { ate: 1_800_000, aliquota: 11.2, deduzir: 22_500 }, { ate: 3_600_000, aliquota: 14.7, deduzir: 85_500 }, { ate: 4_800_000, aliquota: 30.0, deduzir: 720_000 },
        ],
        III: [
          { ate: 180_000, aliquota: 6.0, deduzir: 0 }, { ate: 360_000, aliquota: 11.2, deduzir: 9_360 }, { ate: 720_000, aliquota: 13.5, deduzir: 17_640 },
          { ate: 1_800_000, aliquota: 16.0, deduzir: 35_640 }, { ate: 3_600_000, aliquota: 21.0, deduzir: 125_640 }, { ate: 4_800_000, aliquota: 33.0, deduzir: 648_000 },
        ],
        IV: [
          { ate: 180_000, aliquota: 4.5, deduzir: 0 }, { ate: 360_000, aliquota: 9.0, deduzir: 8_100 }, { ate: 720_000, aliquota: 10.2, deduzir: 12_420 },
          { ate: 1_800_000, aliquota: 14.0, deduzir: 39_780 }, { ate: 3_600_000, aliquota: 22.0, deduzir: 183_780 }, { ate: 4_800_000, aliquota: 33.0, deduzir: 828_000 },
        ],
        V: [
          { ate: 180_000, aliquota: 15.5, deduzir: 0 }, { ate: 360_000, aliquota: 18.0, deduzir: 4_500 }, { ate: 720_000, aliquota: 19.5, deduzir: 9_900 },
          { ate: 1_800_000, aliquota: 20.5, deduzir: 17_100 }, { ate: 3_600_000, aliquota: 23.0, deduzir: 62_100 }, { ate: 4_800_000, aliquota: 30.5, deduzir: 540_000 },
        ],
      },
    },
    presumido: {
      presuncaoIrpj: { COMERCIO: 8, INDUSTRIA: 8, SERVICOS: 32, SERVICOS_FATOR_R: 32, SERVICOS_ANEXO_IV: 32, SERVICOS_HOSPITALAR: 8, TRANSPORTE_CARGAS: 8 },
      presuncaoCsll: { COMERCIO: 12, INDUSTRIA: 12, SERVICOS: 32, SERVICOS_FATOR_R: 32, SERVICOS_ANEXO_IV: 32, SERVICOS_HOSPITALAR: 12, TRANSPORTE_CARGAS: 12 },
      irpjPct: 15, irpjAdicionalPct: 10, adicionalLimiteTrimestral: 60_000, csllPct: 9, pisPct: 0.65, cofinsPct: 3, limiteReceitaAnual: 78_000_000,
    },
    real: { irpjPct: 15, irpjAdicionalPct: 10, adicionalLimiteTrimestral: 60_000, csllPct: 9, pisPct: 1.65, cofinsPct: 7.6 },
    encargosFolha: { patronalPct: 20, ratPct: 2, terceirosPct: 5.8, fgtsPct: 8, seguradosMediaPct: 8 },
    indiretos: { icmsAliquotaPadraoPct: 18, issAliquotaPadraoPct: 3, issMinimoPct: 2, issMaximoPct: 5 },
    carneLeao: {
      faixas: [
        { ate: 2_259.20, aliquota: 0, deduzir: 0 }, { ate: 2_826.65, aliquota: 7.5, deduzir: 169.44 }, { ate: 3_751.05, aliquota: 15, deduzir: 381.44 },
        { ate: 4_664.68, aliquota: 22.5, deduzir: 662.77 }, { ate: Infinity, aliquota: 27.5, deduzir: 896.00 },
      ],
      descontoSimplificado: 564.80, isencaoRedutorAte: 5_000, redutorMaxAte: 7_350, redutorA: 978.62, redutorB: 0.133145,
    },
    guias: { diaVencimentoDas: 20, diaVencimentoPisCofins: 25, diaVencimentoIrrf: 20, diaVencimentoGps: 20, diaVencimentoFgts: 20, diaVencimentoIssPadrao: 10, multaDiaPct: 0.33, multaMaximaPct: 20, selicMensalPctAproximada: 1.0 },
  },
]

/** Versão das tabelas válida para a data (a mais recente com vigenteDesde <= data; se nenhuma, a mais antiga). */
export function tabelasVigentes(data: Date | string = new Date()): TabelasFiscais {
  const d = typeof data === 'string' ? data : data.toISOString().slice(0, 10)
  const ord = [...TABELAS_VERSOES].sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))
  return ord.find((t) => t.vigenteDesde <= d) ?? ord[ord.length - 1]
}

export const AVISO_TABELAS = 'Alíquotas e limites são parâmetros de referência (ver tabelas.ts) e precisam ser conferidos por um contador com a legislação vigente.'
