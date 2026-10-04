import { createHash, randomBytes } from 'crypto'

// Funções PURAS da secretaria (sem acesso a banco). Testadas em __selftest__.ts.

export const DAY = 86_400_000

// ---------- numeração ----------
export function formatNumero(ano: number, seq: number, largura = 6) {
  return `${ano}/${String(seq).padStart(largura, '0')}`
}

export function parseNumero(numero: string): { ano: number; seq: number } | null {
  const m = /^(\d{4})\/(\d{1,})$/.exec(numero.trim())
  return m ? { ano: Number(m[1]), seq: Number(m[2]) } : null
}

// ---------- prazos ----------
// Soma dias ÚTEIS (sáb/dom e feriados informados em 'YYYY-MM-DD' são ignorados).
export function addBusinessDays(from: Date, dias: number, feriados: string[] = []): Date {
  const skip = new Set(feriados)
  const d = new Date(from.getTime())
  let restante = Math.max(0, Math.floor(dias))
  while (restante > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    const iso = d.toISOString().slice(0, 10)
    if (dow === 0 || dow === 6 || skip.has(iso)) continue
    restante--
  }
  return d
}

export function businessDaysBetween(a: Date, b: Date, feriados: string[] = []): number {
  const skip = new Set(feriados)
  const d = new Date(a.getTime())
  let n = 0
  while (d.getTime() + DAY <= b.getTime()) {
    d.setTime(d.getTime() + DAY)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !skip.has(d.toISOString().slice(0, 10))) n++
  }
  return n
}

export function slaSituacao(prazoEm: Date, now = new Date(), terminal = false) {
  if (terminal) return { atrasado: false, diasRestantes: null as number | null, nivel: 'OK' as const }
  const diasRestantes = Math.ceil((prazoEm.getTime() - now.getTime()) / DAY)
  const nivel = diasRestantes < 0 ? ('ATRASADO' as const) : diasRestantes <= 1 ? ('VENCENDO' as const) : ('OK' as const)
  return { atrasado: diasRestantes < 0, diasRestantes, nivel }
}

// ---------- máquina de estados do protocolo ----------
export type ProtocoloStatus = 'ABERTO' | 'EM_ANALISE' | 'PENDENTE_DOCUMENTO' | 'DEFERIDO' | 'INDEFERIDO' | 'CONCLUIDO' | 'CANCELADO'

export const PROTOCOLO_TRANSICOES: Record<ProtocoloStatus, ProtocoloStatus[]> = {
  ABERTO: ['EM_ANALISE', 'PENDENTE_DOCUMENTO', 'INDEFERIDO', 'CANCELADO'],
  EM_ANALISE: ['PENDENTE_DOCUMENTO', 'DEFERIDO', 'INDEFERIDO', 'CANCELADO'],
  PENDENTE_DOCUMENTO: ['EM_ANALISE', 'INDEFERIDO', 'CANCELADO'],
  DEFERIDO: ['CONCLUIDO', 'EM_ANALISE'],
  INDEFERIDO: ['EM_ANALISE'], // recurso/reanálise
  CONCLUIDO: [],
  CANCELADO: [],
}

export const PROTOCOLO_TERMINAIS: ProtocoloStatus[] = ['CONCLUIDO', 'CANCELADO']
export const isTerminal = (s: ProtocoloStatus) => PROTOCOLO_TERMINAIS.includes(s)

export function podeTransitar(de: ProtocoloStatus, para: ProtocoloStatus) {
  return PROTOCOLO_TRANSICOES[de]?.includes(para) ?? false
}

// Estados que exigem justificativa/parecer.
export function exigeParecer(para: ProtocoloStatus) {
  return para === 'INDEFERIDO' || para === 'PENDENTE_DOCUMENTO' || para === 'CANCELADO'
}

// Ao entrar em PENDENTE_DOCUMENTO o relógio do SLA para; ao sair, estende-se o prazo pelo tempo parado.
export function novoPrazoAposPendencia(prazoEm: Date, pendenteDesde: Date, agora: Date) {
  const parado = Math.max(0, agora.getTime() - pendenteDesde.getTime())
  return new Date(prazoEm.getTime() + parado)
}

// ---------- códigos e hash ----------
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O/1/I
export function gerarCodigoVerificacao(grupos = 3, tamanho = 4): string {
  const bytes = randomBytes(grupos * tamanho)
  const chars: string[] = []
  for (let i = 0; i < bytes.length; i++) chars.push(ALFABETO[bytes[i] % ALFABETO.length])
  const out: string[] = []
  for (let g = 0; g < grupos; g++) out.push(chars.slice(g * tamanho, (g + 1) * tamanho).join(''))
  return out.join('-')
}

export function normalizarCodigo(c: string) {
  const raw = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return raw.match(/.{1,4}/g)?.join('-') ?? ''
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

export const mascararCpf = (cpf?: string | null) => {
  const d = String(cpf ?? '').replace(/\D/g, '')
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null
}

export const mascararNome = (nome: string) =>
  nome
    .split(/\s+/)
    .map((p, i) => (i === 0 || p.length <= 3 ? p : p[0] + '*'.repeat(Math.min(p.length - 1, 6))))
    .join(' ')

// ---------- templates ----------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// Substitui {{variavel}} (valores escapados). {{{html}}} insere HTML cru (somente variáveis internas).
export function renderTemplate(tpl: string, vars: Record<string, unknown>, raw: Record<string, string> = {}) {
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, k) => raw[k] ?? '')
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => (vars[k] == null ? '' : esc(vars[k])))
}

export function variaveisDoTemplate(tpl: string): string[] {
  const s = new Set<string>()
  for (const m of tpl.matchAll(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g)) s.add(m[1])
  return [...s]
}

export function dataExtenso(d: Date) {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

// ---------- conferência de documentos ----------
export type ItemStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO'
export type ConferenciaStatus = 'EM_ANDAMENTO' | 'PENDENTE' | 'APROVADA' | 'REPROVADA'

// Regras: obrigatório rejeitado => PENDENTE (aluno pode reenviar). Todos obrigatórios aprovados => APROVADA.
// Algum obrigatório ainda PENDENTE (não analisado) => EM_ANDAMENTO.
// REPROVADA somente se houver item obrigatório rejeitado definitivamente (motivo começando com "DEFINITIVO:").
export function consolidarConferencia(itens: Array<{ obrigatorio: boolean; status: ItemStatus; motivo?: string | null }>): {
  status: ConferenciaStatus
  total: number
  aprovados: number
  rejeitados: number
  pendentes: number
  percentual: number
} {
  const obrig = itens.filter((i) => i.obrigatorio)
  const aprovados = itens.filter((i) => i.status === 'APROVADO').length
  const rejeitados = itens.filter((i) => i.status === 'REJEITADO').length
  const pendentes = itens.filter((i) => i.status === 'PENDENTE').length
  const rejObrig = obrig.filter((i) => i.status === 'REJEITADO')
  let status: ConferenciaStatus
  if (obrig.length > 0 && rejObrig.some((i) => /^DEFINITIVO:/i.test(i.motivo ?? ''))) status = 'REPROVADA'
  else if (obrig.every((i) => i.status === 'APROVADO')) status = 'APROVADA'
  else if (rejObrig.length > 0 && obrig.every((i) => i.status !== 'PENDENTE')) status = 'PENDENTE'
  else if (rejObrig.length > 0) status = 'PENDENTE'
  else status = 'EM_ANDAMENTO'
  return { status, total: itens.length, aprovados, rejeitados, pendentes, percentual: itens.length ? Math.round((aprovados / itens.length) * 100) : 0 }
}

export function documentoVencido(dataDocumento: Date | null | undefined, validadeDias: number | null | undefined, now = new Date()) {
  if (!dataDocumento || !validadeDias) return false
  return now.getTime() - dataDocumento.getTime() > validadeDias * DAY
}

export interface AnaliseDocumento {
  modo: 'IA' | 'HEURISTICA'
  parecer: 'APROVADO' | 'PENDENTE' | 'REJEITADO'
  legivel: boolean
  validade: 'OK' | 'VENCIDO' | 'INDETERMINADA'
  inconsistencias: string[]
  observacoes?: string
  confianca: number
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Extrai datas dd/mm/aaaa ou aaaa-mm-dd de um texto.
export function extrairDatas(texto: string): Date[] {
  const out: Date[] = []
  for (const m of texto.matchAll(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/g)) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
    if (!isNaN(d.getTime()) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) out.push(d)
  }
  for (const m of texto.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    if (!isNaN(d.getTime())) out.push(d)
  }
  return out
}

// Análise heurística (fallback quando não há IA): legibilidade, validade e termos exigidos.
export function analisarDocumentoHeuristica(params: {
  texto?: string | null
  requisitos?: string | null
  validadeDias?: number | null
  dataDocumento?: Date | null
  nomeEsperado?: string | null
  now?: Date
}): AnaliseDocumento {
  const now = params.now ?? new Date()
  const texto = (params.texto ?? '').trim()
  const inconsistencias: string[] = []
  const legivel = texto.length >= 20 && (texto.match(/[A-Za-zÀ-ú0-9]/g)?.length ?? 0) / Math.max(texto.length, 1) > 0.5
  if (!texto) inconsistencias.push('Sem texto/descrição do documento para análise automática — conferência manual necessária.')
  else if (!legivel) inconsistencias.push('Texto extraído curto ou ilegível.')

  let validade: AnaliseDocumento['validade'] = 'INDETERMINADA'
  const dataRef = params.dataDocumento ?? (texto ? extrairDatas(texto).sort((a, b) => b.getTime() - a.getTime())[0] : undefined)
  if (dataRef && params.validadeDias) {
    if (dataRef.getTime() > now.getTime() + DAY) inconsistencias.push('Data do documento está no futuro.')
    validade = documentoVencido(dataRef, params.validadeDias, now) ? 'VENCIDO' : 'OK'
    if (validade === 'VENCIDO') inconsistencias.push(`Documento com mais de ${params.validadeDias} dias (validade excedida).`)
  } else if (params.validadeDias && !dataRef) {
    inconsistencias.push('Não foi possível identificar a data do documento para checar a validade.')
  } else if (dataRef) validade = 'OK'

  if (params.nomeEsperado && texto) {
    const n = normalizar(texto)
    const partes = normalizar(params.nomeEsperado).split(/\s+/).filter((p) => p.length > 2)
    const faltam = partes.filter((p) => !n.includes(p))
    if (partes.length && faltam.length / partes.length > 0.5) inconsistencias.push('Nome do aluno não confere com o do documento.')
  }
  if (params.requisitos && texto) {
    const termos = normalizar(params.requisitos)
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 3 && t.split(' ').length <= 4)
    const n = normalizar(texto)
    const ausentes = termos.filter((t) => !n.includes(t))
    if (ausentes.length) inconsistencias.push(`Termos/requisitos não localizados: ${ausentes.join(', ')}.`)
  }
  const graves = inconsistencias.filter((i) => /excedida|futuro|não confere|ilegível/i.test(i)).length
  const parecer: AnaliseDocumento['parecer'] = graves > 0 ? 'REJEITADO' : inconsistencias.length > 0 ? 'PENDENTE' : 'APROVADO'
  return { modo: 'HEURISTICA', parecer, legivel, validade, inconsistencias, confianca: texto ? 0.5 : 0.1, observacoes: 'Análise heurística — confirmar manualmente.' }
}

// ---------- diploma ----------
export type DiplomaStatus = 'SOLICITADO' | 'CONFERENCIA' | 'PENDENCIA' | 'REGISTRO' | 'REGISTRADO' | 'ENTREGUE' | 'CANCELADO'
export const DIPLOMA_TRANSICOES: Record<DiplomaStatus, DiplomaStatus[]> = {
  SOLICITADO: ['CONFERENCIA', 'CANCELADO'],
  CONFERENCIA: ['PENDENCIA', 'REGISTRO', 'CANCELADO'],
  PENDENCIA: ['CONFERENCIA', 'CANCELADO'],
  REGISTRO: ['REGISTRADO', 'CONFERENCIA', 'CANCELADO'],
  REGISTRADO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
}
export const podeTransitarDiploma = (de: DiplomaStatus, para: DiplomaStatus) => DIPLOMA_TRANSICOES[de]?.includes(para) ?? false

// Aloca o próximo registro num livro: número sequencial + folha (n registros por folha).
export function alocarRegistro(livro: { proximoRegistro: number; registrosPorFolha: number }) {
  const numero = livro.proximoRegistro
  const rpf = Math.max(1, livro.registrosPorFolha)
  const folha = Math.floor((numero - 1) / rpf) + 1
  return { numero, folha, proximoRegistro: numero + 1 }
}

// ---------- formandos ----------
export function avaliarAptidaoFormando(p: {
  cargaHorariaExigida: number
  cargaHorariaCursada: number
  disciplinasPendentes: number
  statusAluno?: string | null
  conferenciaStatus?: string | null
  financeiroPendente?: number
}) {
  const pendencias: string[] = []
  if (p.cargaHorariaExigida > 0 && p.cargaHorariaCursada < p.cargaHorariaExigida)
    pendencias.push(`Carga horária insuficiente (${p.cargaHorariaCursada}/${p.cargaHorariaExigida}h).`)
  if (p.disciplinasPendentes > 0) pendencias.push(`${p.disciplinasPendentes} disciplina(s) sem aprovação.`)
  if (p.statusAluno && ['CANCELADO', 'DESISTENTE', 'TRANCADO'].includes(p.statusAluno)) pendencias.push(`Situação do aluno: ${p.statusAluno}.`)
  if (p.conferenciaStatus && p.conferenciaStatus !== 'APROVADA') pendencias.push('Conferência documental não aprovada.')
  if ((p.financeiroPendente ?? 0) > 0) pendencias.push(`Pendência financeira (${p.financeiroPendente} título(s) em aberto).`)
  return { apto: pendencias.length === 0, pendencias }
}

// ---------- histórico ----------
export interface LinhaHistorico {
  disciplina: string
  periodo?: string | null
  cargaHoraria: number
  nota?: number | null
  frequencia?: number | null // %
  situacao: string
}

export function situacaoDisciplina(nota: number | null | undefined, frequencia: number | null | undefined, mediaMin = 6, freqMin = 75) {
  if (nota == null) return 'EM CURSO'
  if (frequencia != null && frequencia < freqMin) return 'REPROVADO POR FALTAS'
  return nota >= mediaMin ? 'APROVADO' : 'REPROVADO'
}

// Normaliza a situação vinda do módulo de notas (ex.: REPROVADO_FREQ, RECUPERACAO) para o vocabulário do histórico.
export function normalizarSituacao(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').toUpperCase().replace(/_/g, ' ').trim()
  if (!s) return null
  if (/FREQ|FALTA/.test(s) && /REPROV/.test(s)) return 'REPROVADO POR FALTAS'
  if (/REPROV/.test(s)) return 'REPROVADO'
  if (/^APROVEIT/.test(s)) return 'APROVEITADO'
  if (/DISPENS/.test(s)) return 'DISPENSADO'
  if (/APROV/.test(s)) return 'APROVADO'
  if (/CURSO|RECUPERA|EXAME|PENDENTE/.test(s)) return 'EM CURSO'
  return null
}

export function resumoHistorico(linhas: LinhaHistorico[]) {
  const concl = linhas.filter((l) => l.situacao === 'APROVADO' || l.situacao === 'DISPENSADO' || l.situacao === 'APROVEITADO')
  const comNota = linhas.filter((l) => l.nota != null && ['APROVADO', 'REPROVADO', 'REPROVADO POR FALTAS'].includes(l.situacao))
  const pesoTotal = comNota.reduce((s, l) => s + (l.cargaHoraria || 0), 0)
  const cr = pesoTotal > 0 ? comNota.reduce((s, l) => s + (l.nota as number) * (l.cargaHoraria || 0), 0) / pesoTotal : comNota.length ? comNota.reduce((s, l) => s + (l.nota as number), 0) / comNota.length : null
  return {
    cargaHorariaCursada: concl.reduce((s, l) => s + (l.cargaHoraria || 0), 0),
    disciplinasAprovadas: concl.length,
    disciplinasEmCurso: linhas.filter((l) => l.situacao === 'EM CURSO').length,
    disciplinasReprovadas: linhas.filter((l) => l.situacao.startsWith('REPROVADO')).length,
    coeficienteRendimento: cr == null ? null : Math.round(cr * 100) / 100,
  }
}

// ---------- temporalidade / arquivo ----------
export function addAnos(d: Date, anos: number) {
  const r = new Date(d.getTime())
  r.setUTCFullYear(r.getUTCFullYear() + anos)
  return r
}

export function calcularEliminacao(dataEncerramento: Date, corrente: number, intermediario: number, destinacao: string): Date | null {
  if (destinacao === 'GUARDA_PERMANENTE') return null
  return addAnos(dataEncerramento, Math.max(0, corrente) + Math.max(0, intermediario))
}

export type ArquivoStatus = 'ATIVO' | 'ELEGIVEL_DESCARTE' | 'DESCARTE_SOLICITADO' | 'DESCARTADO' | 'GUARDA_PERMANENTE' | 'SUSPENSO'

// Estado "natural" do item de arquivo a partir da temporalidade (não altera estados manuais/terminais).
export function statusArquivoCalculado(atual: ArquivoStatus, destinacao: string, eliminarApos: Date | null, now = new Date()): ArquivoStatus {
  if (['DESCARTADO', 'DESCARTE_SOLICITADO', 'SUSPENSO'].includes(atual)) return atual
  if (destinacao === 'GUARDA_PERMANENTE') return 'GUARDA_PERMANENTE'
  if (eliminarApos && eliminarApos <= now) return 'ELEGIVEL_DESCARTE'
  return 'ATIVO'
}

export function localizacaoTexto(i: { predio?: string | null; sala?: string | null; estante?: string | null; caixa?: string | null; pasta?: string | null }) {
  return [i.predio && `Prédio ${i.predio}`, i.sala && `Sala ${i.sala}`, i.estante && `Estante ${i.estante}`, i.caixa && `Caixa ${i.caixa}`, i.pasta && `Pasta ${i.pasta}`].filter(Boolean).join(' › ')
}
