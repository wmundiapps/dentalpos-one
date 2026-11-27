// Cálculos PUROS da cobrança (sem banco): encargos, aging, quitação, parcelamento, validação de mensagem.
// Dias sempre em calendário de Brasília (UTC-3) para não "pular" o dia perto da meia-noite.

const BRT_MS = 3 * 3_600_000
export const DIA_MS = 86_400_000

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Nº do dia (inteiro) no calendário de Brasília. */
export function diaBRT(d: Date): number {
  return Math.floor((d.getTime() - BRT_MS) / DIA_MS)
}
export function diasEntre(de: Date, ate: Date): number {
  return diaBRT(ate) - diaBRT(de)
}

export interface PoliticaCalc {
  multaPct: number
  jurosTipo: string // MENSAL | DIARIO
  jurosPct: number
  jurosComposto: boolean
  correcaoPctAnual: number
  toleranciaDias: number
}

export const POLITICA_PADRAO: PoliticaCalc = { multaPct: 2, jurosTipo: 'MENSAL', jurosPct: 1, jurosComposto: false, correcaoPctAnual: 0, toleranciaDias: 0 }

export interface Encargos {
  diasAtraso: number
  multa: number
  juros: number
  correcao: number
  total: number
  valorAtualizado: number
}

/**
 * Encargos de um valor vencido.
 *  - dias de atraso = (data do cálculo - vencimento) em dias de calendário; <= 0 não há atraso.
 *  - tolerância: enquanto dias <= toleranciaDias não há encargo; passada a tolerância, os encargos contam desde o vencimento.
 *  - correção monetária: valor x pct anual x dias/365 (pro rata die, simples).
 *  - base de multa e juros = valor + correção. Multa única (% da base). Juros MENSAL = pct x dias/30 (simples) ou composto
 *    (1+pct)^(dias/30)-1; DIARIO = pct x dias (simples) ou (1+pct)^dias-1.
 *  - cada componente é arredondado a centavos.
 */
export function calcularEncargos(valor: number, vencimento: Date, dataCalculo: Date, pol: PoliticaCalc = POLITICA_PADRAO): Encargos {
  const dias = diasEntre(vencimento, dataCalculo)
  if (!(valor > 0) || dias <= 0 || dias <= pol.toleranciaDias) return { diasAtraso: Math.max(0, dias), multa: 0, juros: 0, correcao: 0, total: 0, valorAtualizado: round2(valor) }
  const correcao = round2(valor * (pol.correcaoPctAnual / 100) * (dias / 365))
  const base = valor + correcao
  const multa = round2(base * (pol.multaPct / 100))
  const i = pol.jurosPct / 100
  const periodos = pol.jurosTipo === 'DIARIO' ? dias : dias / 30
  const fator = pol.jurosComposto ? Math.pow(1 + i, periodos) - 1 : i * periodos
  const juros = round2(base * fator)
  const total = round2(multa + juros + correcao)
  return { diasAtraso: dias, multa, juros, correcao, total, valorAtualizado: round2(valor + total) }
}

export type Faixa = 'A_VENCER' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_MAIS'
export const FAIXAS: Faixa[] = ['A_VENCER', 'D1_30', 'D31_60', 'D61_90', 'D90_MAIS']
export const FAIXA_ROTULO: Record<Faixa, string> = { A_VENCER: 'A vencer', D1_30: '1-30 dias', D31_60: '31-60 dias', D61_90: '61-90 dias', D90_MAIS: '90+ dias' }

export function faixaDeAtraso(dias: number): Faixa {
  if (dias <= 0) return 'A_VENCER'
  if (dias <= 30) return 'D1_30'
  if (dias <= 60) return 'D31_60'
  if (dias <= 90) return 'D61_90'
  return 'D90_MAIS'
}

export const agingVazio = (): Record<Faixa, number> => ({ A_VENCER: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_MAIS: 0 })

// ---------------------------------------------------------------- saldo de um título
export interface AbatimentoLite {
  principal: number
  encargos: number
  descontoPrincipal: number
  descontoEncargos: number
}
export interface SaldoTitulo {
  valor: number
  principalRestante: number
  encargosBrutos: number
  encargosDevidos: number
  saldo: number
  enc: Encargos
}
/** Saldo = principal restante + encargos devidos (calculados sobre o valor original, menos encargos já pagos/descontados). */
export function saldoDoTitulo(valor: number, vencimento: Date, dataCalculo: Date, pol: PoliticaCalc, abat: AbatimentoLite[] = []): SaldoTitulo {
  const sum = (k: keyof AbatimentoLite) => abat.reduce((a, x) => a + (x[k] || 0), 0)
  const principalRestante = Math.max(0, round2(valor - sum('principal') - sum('descontoPrincipal')))
  const enc = calcularEncargos(valor, vencimento, dataCalculo, pol)
  const encargosDevidos = principalRestante <= 0 ? 0 : Math.max(0, round2(enc.total - sum('encargos') - sum('descontoEncargos')))
  return { valor, principalRestante, encargosBrutos: enc.total, encargosDevidos, saldo: round2(principalRestante + encargosDevidos), enc }
}

// ---------------------------------------------------------------- quitação à vista com desconto
export interface DescontoQuitacao {
  descontoEncargos: number
  descontoPrincipal: number
  desconto: number
  total: number
}
export function calcularQuitacao(principal: number, encargos: number, pol: { descontoQuitacaoEncargosPct: number; descontoQuitacaoPrincipalPct: number; descontoMaxPct: number }, permitirPrincipal = true): DescontoQuitacao {
  const dEnc = round2(encargos * (pol.descontoQuitacaoEncargosPct / 100))
  let dPri = permitirPrincipal ? round2(principal * (pol.descontoQuitacaoPrincipalPct / 100)) : 0
  const bruto = principal + encargos
  const teto = round2(bruto * (pol.descontoMaxPct / 100))
  if (dEnc + dPri > teto) dPri = Math.max(0, round2(teto - dEnc))
  const desconto = round2(Math.min(dEnc + dPri, teto))
  return { descontoEncargos: Math.min(dEnc, desconto), descontoPrincipal: round2(desconto - Math.min(dEnc, desconto)), desconto, total: round2(bruto - desconto) }
}

// ---------------------------------------------------------------- parcelamento
export interface ParcelaGerada {
  numero: number // 0 = entrada
  valor: number
  vencimento: Date
}
/** Soma meses a uma data preservando o dia (31/01 + 1 mês = 28/02) ao meio-dia UTC. */
export function somarMeses(base: Date, meses: number): Date {
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth() + meses
  const dia = base.getUTCDate()
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(dia, ultimo), 12, 0, 0))
}

export interface PlanoParcelas {
  parcelas: ParcelaGerada[]
  totalFinanciado: number // valor financiado sem juros (total - entrada)
  jurosParcelamento: number
  totalAPagar: number // entrada + parcelas
}
/**
 * Plano de pagamento: entrada (parcela 0, vence na data informada ou no 1º vencimento) + n parcelas mensais.
 * Com juros de parcelamento usa Tabela Price (PMT). A última parcela absorve a diferença de arredondamento, de modo que
 * a soma das parcelas é exatamente o total a pagar.
 */
export function gerarPlano(p: { total: number; entrada: number; parcelas: number; jurosMensalPct: number; primeiroVencimento: Date; entradaVencimento?: Date }): PlanoParcelas {
  const entrada = round2(Math.max(0, Math.min(p.entrada, p.total)))
  const financiado = round2(p.total - entrada)
  const n = Math.max(0, Math.floor(p.parcelas))
  const out: ParcelaGerada[] = []
  if (entrada > 0) out.push({ numero: 0, valor: entrada, vencimento: p.entradaVencimento ?? p.primeiroVencimento })
  let jurosParc = 0
  if (financiado > 0 && n > 0) {
    const i = p.jurosMensalPct / 100
    const pmt = i > 0 ? (financiado * i) / (1 - Math.pow(1 + i, -n)) : financiado / n
    const totalParcelado = i > 0 ? round2(pmt * n) : financiado
    jurosParc = round2(totalParcelado - financiado)
    const base = round2(totalParcelado / n)
    let acum = 0
    for (let k = 1; k <= n; k++) {
      const valor = k === n ? round2(totalParcelado - acum) : base
      acum = round2(acum + valor)
      out.push({ numero: k, valor, vencimento: somarMeses(p.primeiroVencimento, k - 1) })
    }
  }
  return { parcelas: out, totalFinanciado: financiado, jurosParcelamento: jurosParc, totalAPagar: round2(out.reduce((a, x) => a + x.valor, 0)) }
}

// ---------------------------------------------------------------- aceite (hash dos termos)
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  if (v && typeof v === 'object') {
    if (v instanceof Date) return JSON.stringify(v.toISOString())
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}

// ---------------------------------------------------------------- conformidade da mensagem (CDC art. 42)
const PROIBIDOS: Array<[RegExp, string]> = [
  [/\b(caloteiro|caloteira|vagabund|safad|ladr[aã]o|golpista|vergonha|vexame|humilha)/i, 'linguagem ofensiva ou vexatória (CDC art. 42)'],
  [/\b(pol[ií]cia|pris[aã]o|preso|cadeia|crime|delegacia)\b/i, 'ameaça de prisão/crime (CDC art. 42)'],
  [/\b(inadimplente|devedor|devedora|mau pagador|nome sujo|lista de devedores)\b/i, 'expressão que expõe o aluno como devedor (use texto neutro)'],
  [/\b(vamos (contar|avisar|falar|expor)|todos (v[aã]o|saber)|seus (pais|colegas|professores|amigos|vizinhos|empregador|chefe))\b/i, 'sugere exposição a terceiros (CDC art. 42)'],
]
const SO_EXTRAJUDICIAL = /\b(protesto|negativa[cç][aã]o|spc|serasa|execu[cç][aã]o|processo judicial|a[cç][aã]o judicial)\b/i

/** Valida o texto de uma mensagem de cobrança. Termos como protesto/negativação só valem em notificação extrajudicial. */
export function validarMensagemCobranca(texto: string, opts: { extrajudicial?: boolean } = {}): string[] {
  const erros: string[] = []
  if (!texto || texto.trim().length < 10) erros.push('mensagem muito curta')
  if (texto && texto.length > 1500) erros.push('mensagem longa demais (máx. 1500 caracteres)')
  for (const [re, msg] of PROIBIDOS) if (re.test(texto || '')) erros.push(msg)
  if (!opts.extrajudicial && SO_EXTRAJUDICIAL.test(texto || '')) erros.push('menção a protesto/negativação/medida judicial só é permitida na notificação extrajudicial formal')
  if (/https?:\/\/(?!.*\.(edu\.br|com\.br|org\.br)\b)/i.test(texto || '') && /bit\.ly|tinyurl|goo\.gl/i.test(texto || '')) erros.push('encurtadores de link não são permitidos (risco de golpe)')
  return erros
}

// ---------------------------------------------------------------- janela de contato
export interface JanelaPolitica {
  janelaInicio: string
  janelaFim: string
  diasContato: number[]
  bloqueiaFeriados: boolean
}
const hhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
function partesBRT(d: Date) {
  const b = new Date(d.getTime() - BRT_MS)
  return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate(), dow: b.getUTCDay(), min: b.getUTCHours() * 60 + b.getUTCMinutes() }
}
const pascoa = (ano: number) => {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  return new Date(Date.UTC(ano, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1))
}
export function feriadoNacional(ano: number, mes: number, dia: number): boolean {
  const k = `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  if (['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'].includes(k)) return true
  if (ano >= 2024 && k === '11-20') return true
  const sexta = new Date(pascoa(ano).getTime() - 2 * DIA_MS)
  return sexta.getUTCMonth() + 1 === mes && sexta.getUTCDate() === dia
}
export function dentroDaJanelaCobranca(now: Date, j: JanelaPolitica): boolean {
  const p = partesBRT(now)
  if (!j.diasContato.includes(p.dow)) return false
  if (j.bloqueiaFeriados && feriadoNacional(p.y, p.m, p.d)) return false
  return p.min >= hhmm(j.janelaInicio) && p.min < hhmm(j.janelaFim)
}
/** Próximo instante (>= now) em que o contato é permitido. */
export function proximaJanelaCobranca(now: Date, j: JanelaPolitica): Date {
  if (dentroDaJanelaCobranca(now, j)) return now
  const ini = hhmm(j.janelaInicio)
  for (let add = 0; add <= 12; add++) {
    const base = new Date(now.getTime() + add * DIA_MS)
    const p = partesBRT(base)
    if (!j.diasContato.includes(p.dow)) continue
    if (j.bloqueiaFeriados && feriadoNacional(p.y, p.m, p.d)) continue
    const cand = new Date(Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0) + BRT_MS + ini * 60_000)
    if (cand.getTime() > now.getTime()) return cand
  }
  return now
}

// ---------------------------------------------------------------- recorrência
export interface EtapaRec {
  id: string
  diaAtraso: number
  acao: string
  repetirACadaDias: number | null
  maxRepeticoes: number | null
  continuaAposProxima: boolean
}
export interface ExecRec {
  ocorrencias: number
  ultimaEm: Date | null
  resultado: string
}
/**
 * Decide se uma etapa de MENSAGEM deve disparar agora.
 *  - primeira vez: atraso >= diaAtraso;
 *  - repetição: houve execução, repetirACadaDias definido, passaram N dias desde a última, não excedeu maxRepeticoes e
 *    (continuaAposProxima ou nenhuma etapa posterior já está em vigor).
 */
export function etapaDevida(etapa: EtapaRec, exec: ExecRec | undefined, maiorAtraso: number, etapasMensagem: EtapaRec[], now: Date): { devida: boolean; motivo: string; primeira: boolean } {
  if (maiorAtraso < etapa.diaAtraso) return { devida: false, motivo: 'atraso menor que o gatilho', primeira: false }
  if (!exec || exec.resultado === 'SUPERADA') {
    if (exec && exec.resultado === 'SUPERADA') return { devida: false, motivo: 'etapa superada', primeira: false }
    return { devida: true, motivo: 'primeira execução', primeira: true }
  }
  if (!etapa.repetirACadaDias || etapa.repetirACadaDias < 1) return { devida: false, motivo: 'sem recorrência', primeira: false }
  if (etapa.maxRepeticoes != null && etapa.maxRepeticoes > 0 && exec.ocorrencias >= etapa.maxRepeticoes) return { devida: false, motivo: 'limite de repetições', primeira: false }
  if (!etapa.continuaAposProxima && etapasMensagem.some((e) => e.diaAtraso > etapa.diaAtraso && e.diaAtraso <= maiorAtraso)) return { devida: false, motivo: 'etapa seguinte em vigor', primeira: false }
  if (!exec.ultimaEm) return { devida: true, motivo: 'repetição', primeira: false }
  const passados = diasEntre(exec.ultimaEm, now)
  return passados >= etapa.repetirACadaDias ? { devida: true, motivo: 'repetição', primeira: false } : { devida: false, motivo: 'aguardando intervalo', primeira: false }
}

// ---------------------------------------------------------------- utilidades
export const mascararDestino = (canal: string, d: string | null | undefined): string | null => {
  if (!d) return null
  if (canal === 'EMAIL') {
    const [u, h] = d.split('@')
    return h ? `${u.slice(0, 1)}***@${h}` : '***'
  }
  const digits = d.replace(/\D/g, '')
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***'
}

export function csvCell(v: unknown): string {
  if (typeof v === 'number') return String(v).replace('.', ',')
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s // neutraliza injeção de fórmula no Excel
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export function toCsv(cols: Array<{ key: string; label: string }>, rows: Array<Record<string, unknown>>): string {
  const head = cols.map((c) => csvCell(c.label)).join(';')
  const body = rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(';')).join('\r\n')
  return '﻿' + head + '\r\n' + body + '\r\n'
}
