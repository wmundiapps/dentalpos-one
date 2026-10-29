import { prisma } from '../../lib/prisma'
import { SUPERS, httpError, r2, sha256 } from './common'

// ============================================================
// Máquina de estados do título a pagar + alçadas + retenções.
// Funções puras (sem I/O) exceto `carregarAlcadas`.
// ============================================================

export type StatusTitulo = 'RASCUNHO' | 'CONFERIDO' | 'AUTORIZADO' | 'ENVIADO_BANCO' | 'PAGO' | 'CONCILIADO' | 'REJEITADO' | 'CANCELADO'

export const TRANSICOES: Record<StatusTitulo, StatusTitulo[]> = {
  RASCUNHO: ['CONFERIDO', 'CANCELADO'],
  CONFERIDO: ['AUTORIZADO', 'REJEITADO', 'RASCUNHO', 'CANCELADO'],
  AUTORIZADO: ['ENVIADO_BANCO', 'PAGO', 'RASCUNHO', 'CANCELADO'],
  ENVIADO_BANCO: ['PAGO', 'AUTORIZADO'],
  PAGO: ['CONCILIADO'],
  CONCILIADO: [],
  REJEITADO: ['RASCUNHO', 'CANCELADO'],
  CANCELADO: [],
}

export const podeTransitar = (de: StatusTitulo, para: StatusTitulo) => TRANSICOES[de]?.includes(para) ?? false
export const FINAIS: StatusTitulo[] = ['CONCILIADO', 'CANCELADO']
export const EM_ABERTO: StatusTitulo[] = ['RASCUNHO', 'CONFERIDO', 'AUTORIZADO', 'ENVIADO_BANCO', 'REJEITADO']

export function exigirTransicao(de: StatusTitulo, para: StatusTitulo) {
  if (!podeTransitar(de, para)) throw httpError(409, `Transição inválida: ${de} → ${para}.`, { code: 'TRANSICAO_INVALIDA', de, para })
}

// ---------- alçadas ----------
export interface Faixa { ordem: number; nome: string; valorAte: number | null; papeis: string[]; aprovacoes: number; exige2fa: boolean }

export const ALCADAS_PADRAO: Faixa[] = [
  { ordem: 1, nome: 'Até R$ 5.000 (coordenação/financeiro)', valorAte: 5000, papeis: ['COORDINATOR', 'FINANCE'], aprovacoes: 1, exige2fa: false },
  { ordem: 2, nome: 'Até R$ 20.000 (financeiro)', valorAte: 20000, papeis: ['FINANCE'], aprovacoes: 1, exige2fa: false },
  { ordem: 3, nome: 'Acima de R$ 20.000 (diretoria, dupla aprovação)', valorAte: null, papeis: ['RECTOR', 'ADMIN', 'OWNER', 'BOARD'], aprovacoes: 2, exige2fa: false },
]

export async function carregarAlcadas(tenantId: string): Promise<Faixa[]> {
  const rows = await prisma.tesAlcada.findMany({ where: { tenantId }, orderBy: { ordem: 'asc' } })
  if (!rows.length) return ALCADAS_PADRAO
  return rows.map((r) => ({ ordem: r.ordem, nome: r.nome, valorAte: r.valorAte, papeis: r.papeis, aprovacoes: r.aprovacoes, exige2fa: r.exige2fa }))
}

/** Faixa aplicável ao valor (a primeira cujo teto comporta o valor). */
export function faixaDoValor(faixas: Faixa[], valor: number): Faixa {
  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem)
  for (const f of ordenadas) if (f.valorAte == null || valor <= f.valorAte + 1e-9) return f
  return ordenadas[ordenadas.length - 1]
}

export function papelPodeAutorizar(faixa: Faixa, papel: string): boolean {
  const p = String(papel).toUpperCase()
  return SUPERS.includes(p) || faixa.papeis.map((x) => x.toUpperCase()).includes(p)
}

/** Aprovações necessárias: faixa e o limite global de dupla aprovação, o que for maior. */
export function aprovacoesNecessarias(faixa: Faixa, valor: number, limiteDupla: number): number {
  return valor > limiteDupla ? Math.max(2, faixa.aprovacoes) : faixa.aprovacoes
}

// ---------- segregação de funções ----------
export interface CtxSegregacao { criadoPorId: string; conferidoPorId?: string | null; aprovadoresAnteriores: string[]; conferenteNaoAutoriza: boolean }

export function validarConferente(userId: string, t: { criadoPorId: string }) {
  if (t.criadoPorId === userId) throw httpError(403, 'Segregação de funções: quem lançou o título não pode conferi-lo.', { code: 'SEGREGACAO' })
}

export function validarAutorizador(userId: string, c: CtxSegregacao) {
  if (c.criadoPorId === userId) throw httpError(403, 'Segregação de funções: quem lançou o título não pode autorizá-lo.', { code: 'SEGREGACAO' })
  if (c.conferenteNaoAutoriza && c.conferidoPorId === userId) throw httpError(403, 'Segregação de funções: quem conferiu não pode autorizar (política da instituição).', { code: 'SEGREGACAO' })
  if (c.aprovadoresAnteriores.includes(userId)) throw httpError(403, 'Dupla aprovação: o segundo aprovador deve ser outra pessoa.', { code: 'DUPLA_APROVACAO' })
}

// ---------- integridade do que foi autorizado ----------
export function hashAutorizacao(t: {
  valorBruto: number; valorLiquido: number; fornecedor: string; fornecedorDocumento?: string | null; formaPagamento: string
  favorecidoBanco?: string | null; favorecidoAgencia?: string | null; favorecidoConta?: string | null; chavePix?: string | null; codigoBarras?: string | null; vencimento: Date
}): string {
  return sha256([
    r2(t.valorBruto), r2(t.valorLiquido), t.fornecedor, t.fornecedorDocumento ?? '', t.formaPagamento, t.favorecidoBanco ?? '', t.favorecidoAgencia ?? '',
    t.favorecidoConta ?? '', t.chavePix ?? '', t.codigoBarras ?? '', t.vencimento.toISOString().slice(0, 10),
  ].join('|'))
}

// ---------- retenções (modelo; validar com contador) ----------
export interface FaixaIrrf { ate: number | null; aliquota: number; deduzir: number }
// Tabela progressiva mensal (modelo): ajustar conforme a vigente.
export const IRRF_PADRAO: FaixaIrrf[] = [
  { ate: 2259.2, aliquota: 0, deduzir: 0 },
  { ate: 2826.65, aliquota: 7.5, deduzir: 169.44 },
  { ate: 3751.05, aliquota: 15, deduzir: 381.44 },
  { ate: 4664.68, aliquota: 22.5, deduzir: 662.77 },
  { ate: null, aliquota: 27.5, deduzir: 896.0 },
]

export function irrfProgressivo(base: number, tabela: FaixaIrrf[] = IRRF_PADRAO): number {
  if (base <= 0) return 0
  const f = tabela.find((x) => x.ate == null || base <= x.ate) || tabela[tabela.length - 1]
  return Math.max(0, r2((base * f.aliquota) / 100 - f.deduzir))
}

export interface ParamsRetencao { inssPercentualRpa: number; tetoInss: number; issPercentualPadrao: number; tabelaIrrf?: FaixaIrrf[] }
export const PARAMS_PADRAO: ParamsRetencao = { inssPercentualRpa: 11, tetoInss: 8475.55, issPercentualPadrao: 5 }

export interface RetencoesCalculadas { inss: number; irrf: number; iss: number; outras: number; total: number; liquido: number; detalhe: string }

/**
 * Retenções de pagamento a terceiros. Tipos:
 *  - RPA (autônomo PF): INSS 11% limitado ao teto; IRRF progressivo sobre (bruto - INSS); ISS opcional (issAliquota).
 *  - PJ (serviço): IRRF 1,5% e CSRF (PIS/COFINS/CSLL) 4,65% quando bruto > R$ 215,05 (se `retemTributos`), ISS por alíquota quando retido.
 *  - PROLABORE: INSS 11% limitado ao teto + IRRF progressivo.
 *  - SALARIO/OUTRO: sem cálculo (valores vêm da folha).
 */
export function calcularRetencoes(
  tipo: 'RPA' | 'PJ' | 'PROLABORE' | 'SALARIO' | 'OUTRO',
  bruto: number,
  opts: { issAliquota?: number; retemTributos?: boolean; params?: Partial<ParamsRetencao> } = {},
): RetencoesCalculadas {
  const p = { ...PARAMS_PADRAO, ...(opts.params || {}) }
  let inss = 0, irrf = 0, iss = 0, outras = 0
  const d: string[] = []
  if (tipo === 'RPA' || tipo === 'PROLABORE') {
    inss = r2(Math.min(bruto, p.tetoInss) * (p.inssPercentualRpa / 100))
    irrf = irrfProgressivo(bruto - inss, p.tabelaIrrf)
    d.push(`INSS ${p.inssPercentualRpa}% (teto ${p.tetoInss})`, 'IRRF progressivo')
    if (tipo === 'RPA' && opts.issAliquota) { iss = r2((bruto * opts.issAliquota) / 100); d.push(`ISS ${opts.issAliquota}%`) }
  } else if (tipo === 'PJ') {
    if (opts.retemTributos && bruto > 215.05) {
      irrf = r2(bruto * 0.015)
      outras = r2(bruto * 0.0465)
      d.push('IRRF 1,5%', 'PIS/COFINS/CSLL 4,65%')
    }
    if (opts.issAliquota) { iss = r2((bruto * opts.issAliquota) / 100); d.push(`ISS ${opts.issAliquota}%`) }
  }
  const total = r2(inss + irrf + iss + outras)
  return { inss, irrf, iss, outras, total, liquido: r2(bruto - total), detalhe: d.join('; ') }
}
