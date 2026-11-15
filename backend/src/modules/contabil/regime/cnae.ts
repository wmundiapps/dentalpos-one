import type { Atividade } from './tabelas'

// Classificação SIMPLIFICADA do CNAE em "atividade" para o recomendador de regime.
// É uma heurística por prefixo: o enquadramento real (anexo do Simples, presunção do Lucro Presumido, vedações do MEI)
// depende do CNAE completo, da LC 123 e da Resolução CGSN. Sempre permita ao contador corrigir a atividade na empresa.

export const ATIVIDADES: Array<{ valor: Atividade; nome: string; anexoPadrao: 'I' | 'II' | 'III' | 'IV' | 'V' | 'III/V' }> = [
  { valor: 'COMERCIO', nome: 'Comércio (Anexo I)', anexoPadrao: 'I' },
  { valor: 'INDUSTRIA', nome: 'Indústria (Anexo II)', anexoPadrao: 'II' },
  { valor: 'SERVICOS', nome: 'Serviços em geral (Anexo III)', anexoPadrao: 'III' },
  { valor: 'SERVICOS_FATOR_R', nome: 'Serviços sujeitos ao fator R (Anexo III ou V)', anexoPadrao: 'III/V' },
  { valor: 'SERVICOS_ANEXO_IV', nome: 'Serviços do Anexo IV (CPP fora do DAS)', anexoPadrao: 'IV' },
  { valor: 'SERVICOS_HOSPITALAR', nome: 'Serviços hospitalares (presunção reduzida)', anexoPadrao: 'III' },
  { valor: 'TRANSPORTE_CARGAS', nome: 'Transporte de cargas', anexoPadrao: 'III' },
]

const REGRAS: Array<[RegExp, Atividade, string]> = [
  [/^4930/, 'TRANSPORTE_CARGAS', 'Transporte rodoviário de carga'],
  [/^(45|46|47|56)/, 'COMERCIO', 'Comércio e alimentação'],
  [/^(1\d|2\d|3[0-2])/, 'INDUSTRIA', 'Indústria'],
  [/^6911/, 'SERVICOS_ANEXO_IV', 'Advocacia (Anexo IV)'],
  [/^6920/, 'SERVICOS', 'Contabilidade (Anexo III)'],
  [/^(62|63|70|71|72|73|74)/, 'SERVICOS_FATOR_R', 'Serviços intelectuais/técnicos (fator R)'],
  [/^(41|42|43|80|81)/, 'SERVICOS_ANEXO_IV', 'Construção, vigilância e limpeza (Anexo IV)'],
]

export function classificarCnae(cnae?: string | null): { atividade: Atividade; descricao: string; padrao: boolean } {
  const c = String(cnae ?? '').replace(/\D+/g, '')
  for (const [re, atividade, descricao] of REGRAS) if (re.test(c)) return { atividade, descricao, padrao: false }
  return { atividade: 'SERVICOS', descricao: 'Serviços em geral (padrão — confira o CNAE)', padrao: true }
}

export const ehServico = (a: Atividade) => a !== 'COMERCIO' && a !== 'INDUSTRIA' && a !== 'TRANSPORTE_CARGAS'
