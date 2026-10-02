// Regras regulatórias PURAS (sem banco, sem I/O) — parametrizáveis e testadas em __selftest__.ts.
// ATENÇÃO: os parâmetros padrão refletem a prática comum (Decreto 9.235/2017, Portarias do MEC e notas
// técnicas do INEP) mas DEVEM ser conferidos com a norma vigente: eles mudam por portaria/edital.

const DAY = 86_400_000
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
export const diffDays = (a: Date, b: Date) => Math.ceil((a.getTime() - b.getTime()) / DAY) // a - b, em dias (arredonda para cima)
export function addMonths(d: Date, m: number) {
  const r = new Date(d.getTime())
  const day = r.getUTCDate()
  r.setUTCMonth(r.getUTCMonth() + m, 1)
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, last))
  return r
}

export const DISCLAIMER_SIMULACAO =
  'SIMULAÇÃO: resultado estimativo, sem valor oficial. Pesos, faixas e regras de cálculo devem ser conferidos com a norma e a nota técnica vigentes do INEP/MEC.'

// ---------------- Máquina de estados do processo ----------------
export type Etapa = 'PREPARACAO' | 'PROTOCOLADO' | 'EM_ANALISE' | 'DILIGENCIA' | 'AVALIACAO_IN_LOCO' | 'DECISAO' | 'PUBLICADO' | 'ARQUIVADO'

export const TRANSICOES: Record<Etapa, Etapa[]> = {
  PREPARACAO: ['PROTOCOLADO', 'ARQUIVADO'],
  PROTOCOLADO: ['EM_ANALISE', 'ARQUIVADO'],
  EM_ANALISE: ['DILIGENCIA', 'AVALIACAO_IN_LOCO', 'DECISAO', 'ARQUIVADO'],
  DILIGENCIA: ['EM_ANALISE', 'ARQUIVADO'],
  AVALIACAO_IN_LOCO: ['EM_ANALISE', 'DILIGENCIA', 'DECISAO', 'ARQUIVADO'],
  DECISAO: ['PUBLICADO', 'DILIGENCIA', 'AVALIACAO_IN_LOCO', 'ARQUIVADO'],
  PUBLICADO: [],
  ARQUIVADO: [],
}

export function transicaoValida(de: Etapa, para: Etapa) {
  return TRANSICOES[de]?.includes(para) ?? false
}

// ---------------- Janela legal de reconhecimento ----------------
export interface ParamsReconhecimento {
  inicioPct: number // padrão 50: a partir de 50% da carga horária
  fimPct: number // padrão 75: antes de completar 75%
}
export const PARAMS_RECONHECIMENTO: ParamsReconhecimento = { inicioPct: 50, fimPct: 75 }

export type SituacaoJanela = 'ANTES_DA_JANELA' | 'JANELA_ABERTA' | 'JANELA_ENCERRANDO' | 'JANELA_ENCERRADA'

export interface JanelaReconhecimento {
  abreEm: Date
  fechaEm: Date
  percentualAtual: number
  situacao: SituacaoJanela
  diasParaAbrir: number | null
  diasParaFechar: number | null
  mensagem: string
}

// Estima a janela por proporção do tempo da 1ª turma (duração em semestres) ou, se informado,
// pelo percentual real da carga horária cumprida pela 1ª turma.
export function janelaReconhecimento(
  p: { inicioPrimeiraTurma: Date; duracaoSemestres: number; percentualCumprido?: number; agora?: Date },
  params: ParamsReconhecimento = PARAMS_RECONHECIMENTO,
): JanelaReconhecimento {
  const agora = p.agora ?? new Date()
  if (!(p.duracaoSemestres > 0)) throw new Error('duracaoSemestres deve ser > 0')
  if (!(params.inicioPct >= 0 && params.fimPct > params.inicioPct && params.fimPct <= 100)) throw new Error('parâmetros de janela inválidos')
  const meses = p.duracaoSemestres * 6
  const totalDias = diffDays(addMonths(p.inicioPrimeiraTurma, meses), p.inicioPrimeiraTurma)
  const abreEm = addDays(p.inicioPrimeiraTurma, Math.round((totalDias * params.inicioPct) / 100))
  const fechaEm = addDays(p.inicioPrimeiraTurma, Math.round((totalDias * params.fimPct) / 100))
  const pctTempo = Math.max(0, ((agora.getTime() - p.inicioPrimeiraTurma.getTime()) / DAY / totalDias) * 100)
  const pct = p.percentualCumprido ?? pctTempo
  let situacao: SituacaoJanela
  if (pct < params.inicioPct) situacao = 'ANTES_DA_JANELA'
  else if (pct >= params.fimPct) situacao = 'JANELA_ENCERRADA'
  else situacao = diffDays(fechaEm, agora) <= 60 || pct >= params.fimPct - 5 ? 'JANELA_ENCERRANDO' : 'JANELA_ABERTA'
  const diasParaAbrir = situacao === 'ANTES_DA_JANELA' ? Math.max(0, diffDays(abreEm, agora)) : null
  const diasParaFechar = situacao === 'JANELA_ABERTA' || situacao === 'JANELA_ENCERRANDO' ? Math.max(0, diffDays(fechaEm, agora)) : null
  const msg: Record<SituacaoJanela, string> = {
    ANTES_DA_JANELA: `O pedido de reconhecimento só pode ser protocolado a partir de ${params.inicioPct}% da carga horária (aprox. ${abreEm.toISOString().slice(0, 10)}).`,
    JANELA_ABERTA: `Janela aberta: protocolar o reconhecimento antes de ${params.fimPct}% da carga horária (limite aprox. ${fechaEm.toISOString().slice(0, 10)}).`,
    JANELA_ENCERRANDO: `ATENÇÃO: janela de reconhecimento encerrando (limite aprox. ${fechaEm.toISOString().slice(0, 10)}). Protocolar imediatamente.`,
    JANELA_ENCERRADA: `Janela de ${params.inicioPct}%-${params.fimPct}% encerrada: verificar a situação do curso e a regularização junto ao MEC.`,
  }
  return { abreEm, fechaEm, percentualAtual: Math.round(pct * 10) / 10, situacao, diasParaAbrir, diasParaFechar, mensagem: msg[situacao] }
}

// ---------------- Vencimento de ato, janela de renovação, ciclo ----------------
export type SituacaoAto = 'SEM_PRAZO' | 'VIGENTE' | 'RENOVACAO_ABERTA' | 'VENCENDO' | 'VENCIDO'

export interface ParamsAto {
  janelaRenovacaoDias: number // a renovação deve ser protocolada com antecedência (padrão 180 dias)
  vencendoDias: number // abaixo disso o ato é "VENCENDO" (padrão 90)
}
export const PARAMS_ATO: ParamsAto = { janelaRenovacaoDias: 180, vencendoDias: 90 }

export function statusAto(vencimento: Date | null | undefined, agora = new Date(), params: ParamsAto = PARAMS_ATO) {
  if (!vencimento) return { situacao: 'SEM_PRAZO' as SituacaoAto, diasRestantes: null as number | null }
  const dias = diffDays(vencimento, agora)
  let situacao: SituacaoAto
  if (dias < 0) situacao = 'VENCIDO'
  else if (dias <= params.vencendoDias) situacao = 'VENCENDO'
  else if (dias <= params.janelaRenovacaoDias) situacao = 'RENOVACAO_ABERTA'
  else situacao = 'VIGENTE'
  return { situacao, diasRestantes: dias }
}

// Ciclo avaliativo: padrão trienal (SINAES). Parametrizável por ato.
export function proximoCiclo(ultimaAvaliacao: Date, cicloAnos = 3) {
  return addMonths(ultimaAvaliacao, cicloAnos * 12)
}

// Início sugerido do protocolo de renovação: vencimento - janela.
export function inicioProtocoloRenovacao(vencimento: Date, params: ParamsAto = PARAMS_ATO) {
  return addDays(vencimento, -params.janelaRenovacaoDias)
}

// ---------------- Alertas escalonados ----------------
export const MARCOS_PADRAO = [180, 90, 60, 30, 15, 7]

export interface MarcoAlerta {
  dias: number
  data: Date // quando avisar (vencimento - dias)
  severity: 'INFO' | 'ATENCAO' | 'CRITICO'
  passado: boolean // marco já ultrapassado
  vigente: boolean // é o marco "atual" (último ultrapassado)
}

export function severidadePorDias(dias: number): 'INFO' | 'ATENCAO' | 'CRITICO' {
  if (dias <= 30) return 'CRITICO'
  if (dias <= 90) return 'ATENCAO'
  return 'INFO'
}

export function marcosAlerta(vencimento: Date, agora = new Date(), marcos: number[] = MARCOS_PADRAO): MarcoAlerta[] {
  const ordenados = [...new Set(marcos)].filter((m) => m > 0).sort((a, b) => b - a)
  const out: MarcoAlerta[] = ordenados.map((dias) => {
    const data = addDays(vencimento, -dias)
    return { dias, data, severity: severidadePorDias(dias), passado: data.getTime() <= agora.getTime(), vigente: false }
  })
  const passados = out.filter((m) => m.passado)
  if (passados.length) passados[passados.length - 1].vigente = true
  return out
}

// Quais marcos ainda devem gerar lembrete: os futuros + o vigente (se o ato não venceu).
export function marcosParaAgendar(vencimento: Date, agora = new Date(), marcos: number[] = MARCOS_PADRAO) {
  if (vencimento.getTime() < agora.getTime()) return []
  return marcosAlerta(vencimento, agora, marcos).filter((m) => !m.passado || m.vigente)
}

// ---------------- Prontidão de checklist ----------------
export interface ItemPront {
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'ATENDIDO' | 'NAO_APLICAVEL'
  peso?: number
  obrigatorio?: boolean
  prazo?: Date | null
  dimensao?: string
}

function percentualPonderado(aplicaveis: ItemPront[]) {
  const peso = (i: ItemPront) => Math.max(1, i.peso ?? 1)
  const total = aplicaveis.reduce((s, i) => s + peso(i), 0)
  const feito = aplicaveis.reduce((s, i) => s + peso(i) * (i.status === 'ATENDIDO' ? 1 : i.status === 'EM_ANDAMENTO' ? 0.3 : 0), 0)
  return total === 0 ? 0 : Math.round((feito / total) * 1000) / 10
}

export function prontidao(itens: ItemPront[], agora = new Date()) {
  const aplicaveis = itens.filter((i) => i.status !== 'NAO_APLICAVEL')
  const peso = (i: ItemPront) => Math.max(1, i.peso ?? 1)
  const total = aplicaveis.reduce((s, i) => s + peso(i), 0)
  // EM_ANDAMENTO conta 30% do peso (progresso parcial, nunca "pronto")
  const feito = aplicaveis.reduce((s, i) => s + peso(i) * (i.status === 'ATENDIDO' ? 1 : i.status === 'EM_ANDAMENTO' ? 0.3 : 0), 0)
  const percentual = total === 0 ? 0 : Math.round((feito / total) * 1000) / 10
  const obrigPend = aplicaveis.filter((i) => i.obrigatorio !== false && i.status !== 'ATENDIDO').length
  const atrasados = aplicaveis.filter((i) => i.status !== 'ATENDIDO' && i.prazo && i.prazo.getTime() < agora.getTime()).length
  const porDimensao: Record<string, number> = {}
  const dims = [...new Set(aplicaveis.map((i) => i.dimensao ?? 'GERAL'))]
  for (const d of dims) porDimensao[d] = percentualPonderado(aplicaveis.filter((i) => (i.dimensao ?? 'GERAL') === d))
  return { percentual, total: aplicaveis.length, atendidos: aplicaveis.filter((i) => i.status === 'ATENDIDO').length, obrigatoriosPendentes: obrigPend, atrasados, porDimensao }
}

export type Risco = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO'
export function classificarRisco(p: { prontidao?: number | null; diasParaPrazo?: number | null; atoVencido?: boolean; diligenciasVencidas?: number; obrigatoriosPendentes?: number }): { risco: Risco; motivos: string[] } {
  const motivos: string[] = []
  let score = 0
  if (p.atoVencido) { score += 4; motivos.push('Ato regulatório vencido') }
  if (p.diligenciasVencidas && p.diligenciasVencidas > 0) { score += 3; motivos.push(`${p.diligenciasVencidas} diligência(s) com prazo vencido`) }
  if (p.diasParaPrazo != null) {
    if (p.diasParaPrazo < 0) { score += 3; motivos.push('Prazo regulatório vencido') }
    else if (p.diasParaPrazo <= 30) { score += 2; motivos.push(`Prazo em ${p.diasParaPrazo} dia(s)`) }
    else if (p.diasParaPrazo <= 90) { score += 1; motivos.push(`Prazo em ${p.diasParaPrazo} dias`) }
  }
  if (p.prontidao != null && p.diasParaPrazo != null && p.diasParaPrazo <= 90 && p.prontidao < 60) { score += 2; motivos.push(`Prontidão baixa (${p.prontidao}%) com prazo próximo`) }
  else if (p.prontidao != null && p.prontidao < 40) { score += 1; motivos.push(`Prontidão baixa (${p.prontidao}%)`) }
  if (p.obrigatoriosPendentes && p.obrigatoriosPendentes > 0 && p.diasParaPrazo != null && p.diasParaPrazo <= 60) { score += 1; motivos.push(`${p.obrigatoriosPendentes} requisito(s) obrigatório(s) pendente(s)`) }
  const risco: Risco = score >= 5 ? 'CRITICO' : score >= 3 ? 'ALTO' : score >= 1 ? 'MEDIO' : 'BAIXO'
  return { risco, motivos }
}

// ---------------- Simuladores CPC / CC ----------------
export type FaixaConceito = 1 | 2 | 3 | 4 | 5

// Faixas contínuo -> conceito (padrão INEP: 0–0,945 =1; ...; >=3,945 =5). CONFERIR com a nota técnica vigente.
export const CORTES_FAIXA = [0.945, 1.945, 2.945, 3.945]

export function faixaDeContinuo(v: number, cortes: number[] = CORTES_FAIXA): FaixaConceito {
  let f = 1
  for (const c of cortes) if (v >= c) f++
  return Math.min(5, f) as FaixaConceito
}

export const PESOS_CPC = {
  enade: 0.2,
  idd: 0.35,
  mestres: 0.075,
  doutores: 0.15,
  regime: 0.075,
  organizacaoDidatico: 0.075,
  infraestrutura: 0.05,
  oportunidades: 0.025,
} as const
export type ComponenteCpc = keyof typeof PESOS_CPC
export type EntradaCpc = Partial<Record<ComponenteCpc, number>> // cada nota em 0..5

export const NOMES_CPC: Record<ComponenteCpc, string> = {
  enade: 'Nota dos concluintes no ENADE',
  idd: 'IDD (indicador de diferença entre desempenhos)',
  mestres: 'Proporção de mestres',
  doutores: 'Proporção de doutores',
  regime: 'Regime de trabalho do corpo docente',
  organizacaoDidatico: 'Organização didático-pedagógica',
  infraestrutura: 'Infraestrutura e instalações físicas',
  oportunidades: 'Oportunidades de ampliação da formação',
}

function validaNota(n: unknown, nome: string) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0 || n > 5) throw new Error(`${nome}: nota deve estar entre 0 e 5`)
}

export interface ResultadoSimulacao {
  simulacao: true
  aviso: string
  continuo: number
  faixa: FaixaConceito
  detalhes: Array<{ chave: string; nome: string; peso: number; nota: number; contribuicao: number; ganhoPotencial: number }>
  paraSubir: null | {
    proximaFaixa: FaixaConceito
    corte: number
    faltam: number
    sugestoes: Array<{ chave: string; nome: string; notaAtual: number; notaNecessariaIsolada: number | null; viavelIsolada: boolean; ganhoMaximo: number }>
    caminho: Array<{ chave: string; nome: string; deNota: number; paraNota: number }>
  }
}

function paraSubir(
  continuo: number,
  faixa: FaixaConceito,
  comps: Array<{ chave: string; nome: string; peso: number; nota: number }>,
  cortes: number[],
): ResultadoSimulacao['paraSubir'] {
  if (faixa >= 5) return null
  const corte = cortes[faixa - 1]
  const faltam = Math.round((corte - continuo) * 10000) / 10000
  const sugestoes = comps
    .map((c) => {
      const need = c.nota + faltam / c.peso
      return { chave: c.chave, nome: c.nome, notaAtual: c.nota, notaNecessariaIsolada: need <= 5 ? Math.round(need * 100) / 100 : null, viavelIsolada: need <= 5, ganhoMaximo: Math.round((5 - c.nota) * c.peso * 10000) / 10000 }
    })
    .sort((a, b) => b.ganhoMaximo - a.ganhoMaximo)
  // caminho guloso: eleva os componentes de maior ganho potencial até cobrir o déficit
  let restante = faltam
  const caminho: Array<{ chave: string; nome: string; deNota: number; paraNota: number }> = []
  for (const s of sugestoes) {
    if (restante <= 1e-9) break
    const comp = comps.find((c) => c.chave === s.chave)!
    const ganho = Math.min(s.ganhoMaximo, restante)
    if (ganho <= 0) continue
    caminho.push({ chave: s.chave, nome: s.nome, deNota: s.notaAtual, paraNota: Math.round((comp.nota + ganho / comp.peso) * 100) / 100 })
    restante -= ganho
  }
  return { proximaFaixa: (faixa + 1) as FaixaConceito, corte, faltam, sugestoes, caminho: restante > 1e-6 ? [] : caminho }
}

export function simularCPC(entrada: EntradaCpc, pesos: Record<string, number> = PESOS_CPC, cortes: number[] = CORTES_FAIXA): ResultadoSimulacao {
  const comps: Array<{ chave: string; nome: string; peso: number; nota: number }> = []
  for (const k of Object.keys(pesos) as ComponenteCpc[]) {
    const nota = entrada[k]
    if (nota == null) throw new Error(`Componente do CPC ausente: ${k}`)
    validaNota(nota, k)
    comps.push({ chave: k, nome: NOMES_CPC[k] ?? k, peso: pesos[k], nota })
  }
  const somaPesos = comps.reduce((s, c) => s + c.peso, 0)
  if (Math.abs(somaPesos - 1) > 1e-6) throw new Error(`Os pesos devem somar 100% (soma atual ${(somaPesos * 100).toFixed(2)}%)`)
  const continuo = Math.round(comps.reduce((s, c) => s + c.peso * c.nota, 0) * 10000) / 10000
  const faixa = faixaDeContinuo(continuo, cortes)
  return {
    simulacao: true,
    aviso: DISCLAIMER_SIMULACAO,
    continuo,
    faixa,
    detalhes: comps.map((c) => ({ chave: c.chave, nome: c.nome, peso: c.peso, nota: c.nota, contribuicao: Math.round(c.peso * c.nota * 10000) / 10000, ganhoPotencial: Math.round((5 - c.nota) * c.peso * 10000) / 10000 })),
    paraSubir: paraSubir(continuo, faixa, comps, cortes),
  }
}

// CC (Conceito de Curso): média ponderada das 3 dimensões do instrumento in loco (cada uma 1..5).
export const PESOS_CC = { organizacaoDidatico: 0.3, corpoDocente: 0.3, infraestrutura: 0.4 } as const
export const NOMES_CC: Record<keyof typeof PESOS_CC, string> = {
  organizacaoDidatico: 'Organização didático-pedagógica',
  corpoDocente: 'Corpo docente e tutorial',
  infraestrutura: 'Infraestrutura',
}
export function simularCC(entrada: Partial<Record<keyof typeof PESOS_CC, number>>, pesos: Record<string, number> = PESOS_CC): ResultadoSimulacao & { requisitosLegaisAtendidos?: boolean; alerta?: string } {
  const comps: Array<{ chave: string; nome: string; peso: number; nota: number }> = []
  for (const k of Object.keys(pesos) as Array<keyof typeof PESOS_CC>) {
    const nota = entrada[k]
    if (nota == null) throw new Error(`Dimensão do CC ausente: ${k}`)
    if (typeof nota !== 'number' || !isFinite(nota) || nota < 1 || nota > 5) throw new Error(`${k}: conceito deve estar entre 1 e 5`)
    comps.push({ chave: k, nome: NOMES_CC[k] ?? k, peso: pesos[k], nota })
  }
  const soma = comps.reduce((s, c) => s + c.peso, 0)
  if (Math.abs(soma - 1) > 1e-6) throw new Error('Os pesos devem somar 100%')
  const continuo = Math.round(comps.reduce((s, c) => s + c.peso * c.nota, 0) * 10000) / 10000
  // No CC o contínuo (1..5) é arredondado por faixa; usamos cortes equivalentes: <1,5=1 ... >=4,5=5 (parametrizar/conferir).
  const faixa = faixaDeContinuo(continuo, [1.5, 2.5, 3.5, 4.5])
  const base = paraSubir(continuo, faixa, comps, [1.5, 2.5, 3.5, 4.5])
  return {
    simulacao: true,
    aviso: DISCLAIMER_SIMULACAO,
    continuo,
    faixa,
    detalhes: comps.map((c) => ({ chave: c.chave, nome: c.nome, peso: c.peso, nota: c.nota, contribuicao: Math.round(c.peso * c.nota * 10000) / 10000, ganhoPotencial: Math.round((5 - c.nota) * c.peso * 10000) / 10000 })),
    paraSubir: base,
    alerta: faixa <= 2 ? 'Conceito insatisfatório (1 ou 2): sujeito a protocolo de compromisso/medidas de supervisão. Conferir a norma vigente.' : undefined,
  }
}

// Média simples de indicadores 1..5 por dimensão (para alimentar o simulador de CC a partir da autoavaliação).
export function mediaIndicadores(inds: Array<{ dimensao: string; conceito: number | null }>) {
  const acc: Record<string, { s: number; n: number }> = {}
  for (const i of inds) {
    if (i.conceito == null) continue
    const a = (acc[i.dimensao] ||= { s: 0, n: 0 })
    a.s += i.conceito
    a.n++
  }
  const out: Record<string, number> = {}
  for (const [d, a] of Object.entries(acc)) out[d] = Math.round((a.s / a.n) * 100) / 100
  return out
}

// ---------------- Análise heurística de documento (fallback sem IA) ----------------
export interface PrazoDetectado { texto: string; data?: string; dias?: number; contexto: string }
export interface AnaliseHeuristica {
  resumo: string
  numeroAto?: string
  prazos: PrazoDetectado[]
  exigencias: string[]
  tarefasSugeridas: Array<{ titulo: string; prazo?: string; prazoDias?: number; severity: 'INFO' | 'ATENCAO' | 'CRITICO' }>
}

const RX_DATA = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
const RX_DIAS = /\b(?:no\s+)?prazo\s+(?:de|máximo\s+de|improrrogável\s+de)\s+(\d{1,3})\s*(?:\([^)]*\)\s*)?(dias?|meses|mês)\b/gi
const RX_EXIG = /(deverá|deverão|exige-se|exigência|fica\s+determinado|apresentar|comprovar|regularizar|sanar|adequar|encaminhar|protocolar|obrigatóri[oa])/i

export function isoDeBR(d: string, m: string, y: string) {
  const dt = new Date(Date.UTC(+y, +m - 1, +d))
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return undefined
  return dt.toISOString().slice(0, 10)
}

export function analisarDocumentoHeuristico(texto: string): AnaliseHeuristica {
  const limpo = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ')
  const frases = limpo.split(/(?<=[.;:!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8)
  const prazos: PrazoDetectado[] = []
  const vistos = new Set<string>()
  for (const f of frases) {
    for (const m of f.matchAll(RX_DATA)) {
      const iso = isoDeBR(m[1], m[2], m[3])
      if (!iso) continue
      const k = iso + f.slice(0, 40)
      if (vistos.has(k)) continue
      vistos.add(k)
      prazos.push({ texto: m[0], data: iso, contexto: f.slice(0, 240) })
    }
    for (const m of f.matchAll(RX_DIAS)) {
      const n = +m[1]
      const dias = /m[eê]s/i.test(m[2]) ? n * 30 : n
      prazos.push({ texto: m[0], dias, contexto: f.slice(0, 240) })
    }
  }
  const exigencias = frases.filter((f) => RX_EXIG.test(f)).slice(0, 25).map((f) => f.slice(0, 300))
  const numero = limpo.match(/portaria\s+(?:mec\s+|sere\s+|seres\s+)?n[ºo°.]*\s*([\d.]+\/?\d{0,4})/i)?.[1]
  const tarefas: AnaliseHeuristica['tarefasSugeridas'] = []
  for (const e of exigencias.slice(0, 10)) {
    const p = prazos.find((x) => e.includes(x.texto.slice(0, 10)) || x.contexto.startsWith(e.slice(0, 60)))
    tarefas.push({ titulo: e.slice(0, 140), prazo: p?.data, prazoDias: p?.dias, severity: p?.dias != null && p.dias <= 15 ? 'CRITICO' : p ? 'ATENCAO' : 'INFO' })
  }
  for (const p of prazos) {
    if (p.data && !tarefas.some((t) => t.prazo === p.data)) tarefas.push({ titulo: `Verificar prazo citado: ${p.contexto.slice(0, 110)}`, prazo: p.data, severity: 'ATENCAO' })
  }
  const resumo = frases.slice(0, 3).join(' ').slice(0, 500) || 'Documento sem texto suficiente para resumo.'
  return { resumo, numeroAto: numero, prazos, exigencias, tarefasSugeridas: tarefas }
}

// Conferência heurística de uma evidência contra um requisito: sobreposição de termos significativos.
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'para', 'por', 'com', 'um', 'uma', 'no', 'na', 'nos', 'nas', 'ao', 'que', 'ou', 'se'])
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function conferenciaHeuristica(requisito: string, documento: string) {
  const termos = [...new Set(norm(requisito).split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !STOP.has(t)))]
  if (termos.length === 0) return { atende: null as boolean | null, cobertura: 0, encontrados: [] as string[], ausentes: [] as string[] }
  const doc = norm(documento)
  const encontrados = termos.filter((t) => doc.includes(t.length > 6 ? t.slice(0, t.length - 1) : t))
  const cobertura = Math.round((encontrados.length / termos.length) * 100) / 100
  return { atende: cobertura >= 0.7 ? true : cobertura < 0.35 ? false : null, cobertura, encontrados, ausentes: termos.filter((t) => !encontrados.includes(t)) }
}
