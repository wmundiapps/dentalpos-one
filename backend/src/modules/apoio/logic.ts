// Lógica PURA do módulo apoio (sem acesso a banco): risco de evasão, bolsas,
// estágio (Lei 11.788/2008), ocorrências disciplinares, NPS/agregação,
// ouvidoria (Lei 13.460/2017) e indicadores de egressos.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'

const DAY = 86_400_000

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
export const diffDays = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY
export const round1 = (n: number) => Math.round(n * 10) / 10
export const round2 = (n: number) => Math.round(n * 100) / 100

// Soma dias úteis (seg-sex; feriados não considerados — informe `feriados` ISO yyyy-mm-dd se houver).
export function addBusinessDays(start: Date, n: number, feriados: string[] = []): Date {
  const set = new Set(feriados)
  const d = new Date(start)
  let left = n
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    if (set.has(d.toISOString().slice(0, 10))) continue
    left--
  }
  return d
}

// ------------------------------------------------------------------
// RISCO DE EVASÃO
// ------------------------------------------------------------------
export interface RiscoInput {
  faltasPercent?: number | null        // 0-100 (% de ausências sobre aulas registradas)
  mediaNotas?: number | null           // 0-10
  avaliacoesAbaixoMedia?: number | null // nº de avaliações com nota < 6
  avaliacoesTotal?: number | null
  diasMaiorAtraso?: number | null      // maior atraso (dias) entre parcelas vencidas e não pagas
  parcelasVencidas?: number | null
  diasSemAtividade?: number | null     // dias desde o último acesso/atividade
  requerimentoTrancamento?: boolean | null // trancamento/cancelamento/transferência solicitado
  bolsista?: boolean | null            // fator protetivo
  atendimentoRecente?: boolean | null  // acompanhamento do NAE nos últimos 30 dias (fator protetivo leve)
}

export type NivelRisco = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO'
export interface FatorRisco { chave: string; rotulo: string; peso: number; pontos: number; detalhe: string; disponivel: boolean }
export interface RiscoResultado { score: number; nivel: NivelRisco; fatores: FatorRisco[]; confianca: number; acoesSugeridas: string[] }

export const PESOS_RISCO = { faltas: 25, notas: 25, financeiro: 20, engajamento: 20, trancamento: 10 }

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))

export function nivelDoScore(score: number): NivelRisco {
  if (score >= 75) return 'CRITICO'
  if (score >= 50) return 'ALTO'
  if (score >= 25) return 'MEDIO'
  return 'BAIXO'
}

// Pontua o risco de 0 a 100. Métricas ausentes (null/undefined) não penalizam nem
// premiam: os pesos disponíveis são renormalizados e a `confianca` cai.
export function calcularRisco(i: RiscoInput): RiscoResultado {
  const fatores: FatorRisco[] = []
  const add = (chave: string, rotulo: string, peso: number, frac: number | null, detalhe: string) =>
    fatores.push({ chave, rotulo, peso, pontos: frac == null ? 0 : round1(clamp(frac) * peso), detalhe, disponivel: frac != null })

  // Faltas: <=10% nada; 10-25% cresce; >=40% máximo.
  const f = i.faltasPercent
  add('faltas', 'Faltas', PESOS_RISCO.faltas, f == null ? null : clamp((f - 10) / 30), f == null ? 'sem registro de frequência' : `${round1(f)}% de ausências`)

  // Notas: combina média (<=4 máx., >=7 zero) e proporção de avaliações abaixo da média.
  let notasFrac: number | null = null
  let notasDet = 'sem notas lançadas'
  if (i.mediaNotas != null) {
    const fm = clamp((7 - i.mediaNotas) / 3)
    const fp = i.avaliacoesTotal && i.avaliacoesTotal > 0 ? clamp((i.avaliacoesAbaixoMedia ?? 0) / i.avaliacoesTotal) : fm
    notasFrac = fm * 0.6 + fp * 0.4
    notasDet = `média ${round1(i.mediaNotas)}${i.avaliacoesTotal ? `, ${i.avaliacoesAbaixoMedia ?? 0}/${i.avaliacoesTotal} avaliações abaixo de 6` : ''}`
  }
  add('notas', 'Desempenho', PESOS_RISCO.notas, notasFrac, notasDet)

  // Financeiro: atraso de 0 a 90+ dias, com acréscimo por número de parcelas.
  let finFrac: number | null = null
  let finDet = 'sem dados financeiros'
  if (i.diasMaiorAtraso != null || i.parcelasVencidas != null) {
    const dias = i.diasMaiorAtraso ?? 0
    const parc = i.parcelasVencidas ?? 0
    finFrac = clamp(dias / 90 * 0.7 + clamp(parc / 3) * 0.3)
    if (dias <= 0 && parc <= 0) finFrac = 0
    finDet = parc > 0 ? `${parc} parcela(s) vencida(s), maior atraso ${Math.round(dias)} dia(s)` : 'adimplente'
  }
  add('financeiro', 'Inadimplência', PESOS_RISCO.financeiro, finFrac, finDet)

  // Engajamento: dias sem atividade (7 dias ok; 30+ máximo).
  const d = i.diasSemAtividade
  add('engajamento', 'Ausência de acessos/atividade', PESOS_RISCO.engajamento, d == null ? null : clamp((d - 7) / 23), d == null ? 'sem registro de acessos' : `${Math.round(d)} dia(s) sem atividade`)

  // Trancamento/cancelamento solicitado: sinal forte.
  add('trancamento', 'Requerimento de trancamento/cancelamento', PESOS_RISCO.trancamento, i.requerimentoTrancamento == null ? null : i.requerimentoTrancamento ? 1 : 0, i.requerimentoTrancamento ? 'há requerimento aberto/recente' : 'nenhum requerimento')

  const disp = fatores.filter((x) => x.disponivel)
  const pesoDisp = disp.reduce((s, x) => s + x.peso, 0)
  const pesoTotal = fatores.reduce((s, x) => s + x.peso, 0)
  let score = pesoDisp > 0 ? (disp.reduce((s, x) => s + x.pontos, 0) / pesoDisp) * 100 : 0
  // Poucos dados disponíveis: encolhe o score (evita 100 com um único indicador).
  score *= pesoTotal ? 0.5 + 0.5 * (pesoDisp / pesoTotal) : 1
  // Trancamento solicitado impõe piso: aluno já sinalizou a saída.
  if (i.requerimentoTrancamento) score = Math.max(score, 55)
  // Múltiplos fatores críticos simultâneos agravam (efeito composto).
  const criticos = disp.filter((x) => x.pontos / x.peso >= 0.7 && x.chave !== 'trancamento').length
  if (criticos >= 3) score += 10
  else if (criticos === 2) score += 5
  // Fatores protetivos (limitados).
  if (i.bolsista) score -= 3
  if (i.atendimentoRecente) score -= 3
  score = round1(clamp(score, 0, 100) * 1) // já em 0-100
  score = Math.max(0, Math.min(100, score))
  const confianca = pesoTotal ? round2(pesoDisp / pesoTotal) : 0

  const acoes: string[] = []
  const ativo = (k: string) => (fatores.find((x) => x.chave === k)?.pontos ?? 0) / (fatores.find((x) => x.chave === k)?.peso ?? 1) >= 0.4
  if (ativo('faltas')) acoes.push('Contato com o aluno para entender o motivo das faltas e acordar plano de reposição/compensação de ausências.')
  if (ativo('notas')) acoes.push('Encaminhar para monitoria/nivelamento/tutoria e orientação de estudos com a coordenação.')
  if (ativo('financeiro')) acoes.push('Acionar financeiro para renegociação de parcelas e avaliar elegibilidade a bolsa/assistência estudantil.')
  if (ativo('engajamento')) acoes.push('Busca ativa: contato por WhatsApp/telefone e convite para atendimento presencial.')
  if (i.requerimentoTrancamento) acoes.push('Entrevista de retenção antes da efetivação do trancamento/cancelamento (alternativas: redução de carga, bolsa, flexibilização).')
  if (score >= 50 && !i.atendimentoRecente) acoes.push('Agendar atendimento psicopedagógico/social no NAE.')
  return { score, nivel: nivelDoScore(score), fatores, confianca, acoesSugeridas: acoes }
}

// Prazo (dias) para o próximo contato conforme nível.
export function prazoContatoDias(n: NivelRisco): number {
  return n === 'CRITICO' ? 2 : n === 'ALTO' ? 5 : n === 'MEDIO' ? 15 : 30
}

// ------------------------------------------------------------------
// BOLSAS / ASSISTÊNCIA ESTUDANTIL
// ------------------------------------------------------------------
export const SALARIO_MINIMO_PADRAO = 1621 // referência 2026; sobrescreva via parâmetro

export function rendaPerCapita(rendaFamiliar: number, membros: number): number {
  if (!(membros >= 1)) throw new Error('Número de membros da família deve ser >= 1.')
  if (rendaFamiliar < 0) throw new Error('Renda familiar inválida.')
  return round2(rendaFamiliar / membros)
}

export interface ProgramaBolsaCriterios {
  rendaPerCapitaMaxSM?: number | null
  mediaMinima?: number | null
  frequenciaMinima?: number | null
  inscricaoInicio?: Date | null
  inscricaoFim?: Date | null
  tipo?: string
}
export interface InscricaoDados {
  rendaPerCapita: number
  numeroMembros?: number
  mediaAtual?: number | null
  frequenciaAtual?: number | null
  condicoes?: { cadUnico?: boolean; escolaPublica?: boolean; deficiencia?: boolean; moraSozinho?: boolean; familiaNumerosa?: boolean; primeiraGeracao?: boolean } | null
  documentosEnviados?: string[]
  documentosExigidos?: string[]
}

export function avaliarInscricaoBolsa(p: ProgramaBolsaCriterios, d: InscricaoDados, opts: { salarioMinimo?: number; agora?: Date } = {}) {
  const sm = opts.salarioMinimo ?? SALARIO_MINIMO_PADRAO
  const agora = opts.agora ?? new Date()
  const pendencias: string[] = []
  if (p.inscricaoInicio && agora < p.inscricaoInicio) pendencias.push('Período de inscrição ainda não iniciado.')
  if (p.inscricaoFim && agora > p.inscricaoFim) pendencias.push('Período de inscrição encerrado.')
  const limite = p.rendaPerCapitaMaxSM != null ? p.rendaPerCapitaMaxSM * sm : null
  if (limite != null && d.rendaPerCapita > limite) pendencias.push(`Renda per capita (R$ ${d.rendaPerCapita.toFixed(2)}) acima do limite de ${p.rendaPerCapitaMaxSM} SM (R$ ${limite.toFixed(2)}).`)
  if (p.mediaMinima != null) {
    if (d.mediaAtual == null) pendencias.push('Média acadêmica não disponível.')
    else if (d.mediaAtual < p.mediaMinima) pendencias.push(`Média ${d.mediaAtual} abaixo do mínimo ${p.mediaMinima}.`)
  }
  if (p.frequenciaMinima != null && d.frequenciaAtual != null && d.frequenciaAtual < p.frequenciaMinima) pendencias.push(`Frequência ${d.frequenciaAtual}% abaixo do mínimo ${p.frequenciaMinima}%.`)
  const faltam = (d.documentosExigidos ?? []).filter((x) => !(d.documentosEnviados ?? []).includes(x))
  if (faltam.length) pendencias.push(`Documentos pendentes: ${faltam.join(', ')}.`)

  // Pontuação (0-100). Programas socioeconômicos priorizam renda; mérito prioriza média.
  const merito = p.tipo === 'MERITO' || (limite == null && p.mediaMinima != null)
  let pts = 0
  if (merito) {
    pts += clamp((d.mediaAtual ?? 0) / 10) * 80
    pts += clamp((d.frequenciaAtual ?? 0) / 100) * 20
  } else {
    if (limite != null && limite > 0) pts += clamp(1 - d.rendaPerCapita / limite) * 60
    else pts += clamp(1 - d.rendaPerCapita / (3 * sm)) * 60
    const c = d.condicoes ?? {}
    if (c.cadUnico) pts += 10
    if (c.escolaPublica) pts += 8
    if (c.deficiencia) pts += 7
    if (c.familiaNumerosa || (d.numeroMembros ?? 0) >= 5) pts += 5
    if (c.primeiraGeracao) pts += 4
    if (c.moraSozinho) pts += 2
    pts += clamp((d.mediaAtual ?? 0) / 10) * 4
  }
  const bloqueios = pendencias.filter((x) => !x.startsWith('Documentos'))
  return { elegivel: bloqueios.length === 0, pendencias, pontuacao: round2(Math.min(100, pts)) }
}

// Ordena por pontuação (desempate: menor renda per capita, depois mais antiga) e separa deferidos x lista de espera.
export function classificarInscricoes<T extends { id: string; pontuacao: number; rendaPerCapita: number; elegivel: boolean; createdAt: Date }>(inscricoes: T[], vagas: number, jaConcedidas = 0) {
  const ord = inscricoes
    .filter((x) => x.elegivel)
    .sort((a, b) => b.pontuacao - a.pontuacao || a.rendaPerCapita - b.rendaPerCapita || a.createdAt.getTime() - b.createdAt.getTime())
  const livres = Math.max(0, vagas - jaConcedidas)
  return {
    deferidas: ord.slice(0, livres),
    listaEspera: ord.slice(livres),
    indeferidas: inscricoes.filter((x) => !x.elegivel),
  }
}

export function janelaRenovacao(fim: Date, antecedenciaDias: number, agora = new Date()) {
  const abre = addDays(fim, -antecedenciaDias)
  const estado = agora < abre ? 'AGUARDANDO' : agora <= fim ? 'ABERTA' : 'EXPIRADA'
  return { abre, fecha: fim, estado, diasParaFechar: Math.ceil(diffDays(fim, agora)) }
}

// ------------------------------------------------------------------
// MONITORIA
// ------------------------------------------------------------------
export function pontuacaoMonitoria(notaDisciplina?: number | null, notaEntrevista?: number | null, pesoDisc = 0.6) {
  const nd = notaDisciplina ?? 0
  const ne = notaEntrevista
  if (ne == null) return round2(nd * 10 * pesoDisc) // parcial até a entrevista
  return round2(nd * 10 * pesoDisc + ne * 10 * (1 - pesoDisc))
}

// ------------------------------------------------------------------
// ESTÁGIO — Lei 11.788/2008
// ------------------------------------------------------------------
export interface TermoEstagioInput {
  tipo: 'OBRIGATORIO' | 'NAO_OBRIGATORIO'
  inicio: Date
  fim: Date
  jornadaDiariaHoras: number
  cargaSemanalHoras: number
  alunoPcd?: boolean
  bolsaValor?: number | null
  auxilioTransporte?: number | null
  apoliceSeguro?: string | null
  orientadorUserId?: string | null
  supervisorNome?: string | null
  convenioFim?: Date | null
  alunoAtivo?: boolean
  semAulasNoPeriodo?: boolean   // períodos de férias/avaliação permitem jornada de 40h
  estagiosSimultaneosAtivos?: number
  mesesNaMesmaEmpresa?: number  // acumulado prévio na mesma concedente
}

export function validarTermoEstagio(t: TermoEstagioInput): { erros: string[]; avisos: string[] } {
  const erros: string[] = []
  const avisos: string[] = []
  if (t.fim <= t.inicio) erros.push('A data final deve ser posterior à inicial.')
  if (t.alunoAtivo === false) erros.push('Aluno sem matrícula ativa (Lei 11.788, art. 3º).')
  const maxDia = t.semAulasNoPeriodo ? 8 : 6
  const maxSem = t.semAulasNoPeriodo ? 40 : 30
  if (t.jornadaDiariaHoras > maxDia) erros.push(`Jornada diária de ${t.jornadaDiariaHoras}h excede o máximo de ${maxDia}h para ensino superior (art. 10).`)
  if (t.cargaSemanalHoras > maxSem) erros.push(`Carga semanal de ${t.cargaSemanalHoras}h excede o máximo de ${maxSem}h (art. 10).`)
  if (t.cargaSemanalHoras < t.jornadaDiariaHoras) erros.push('Carga semanal menor que a jornada diária.')
  const meses = (t.fim.getFullYear() - t.inicio.getFullYear()) * 12 + (t.fim.getMonth() - t.inicio.getMonth()) + (t.fim.getDate() >= t.inicio.getDate() ? 0 : -1)
  const total = meses + (t.mesesNaMesmaEmpresa ?? 0)
  if (!t.alunoPcd && total > 24) erros.push(`Duração acumulada de ${total} meses excede 2 anos na mesma concedente (art. 11); só é permitido para PcD.`)
  if (t.tipo === 'NAO_OBRIGATORIO') {
    if (t.bolsaValor == null || t.bolsaValor <= 0) erros.push('Estágio não obrigatório exige bolsa ou contraprestação (art. 12).')
    if (t.auxilioTransporte == null) avisos.push('Auxílio-transporte não informado (obrigatório no não obrigatório, art. 12).')
  }
  if (!t.apoliceSeguro) erros.push('Seguro contra acidentes pessoais obrigatório (art. 9º, IV).')
  if (!t.orientadorUserId) erros.push('Professor orientador da IES é obrigatório (art. 3º, §1º).')
  if (!t.supervisorNome) erros.push('Supervisor na concedente é obrigatório (art. 9º, III).')
  if (t.convenioFim && t.convenioFim < t.fim) erros.push('Convênio com a concedente vence antes do fim do estágio.')
  if ((t.estagiosSimultaneosAtivos ?? 0) > 0) avisos.push('Aluno já possui outro estágio ativo; somadas, as jornadas não podem exceder os limites legais.')
  if (meses >= 12) avisos.push('Estágio ≥ 1 ano: assegurar recesso de 30 dias (art. 13).')
  return { erros, avisos }
}

// Relatórios de estágio: parcial a cada 6 meses (art. 3º, §1º) + final na data de término.
export function prazosRelatoriosEstagio(inicio: Date, fim: Date): Array<{ tipo: 'PARCIAL' | 'FINAL'; prazoEm: Date }> {
  const out: Array<{ tipo: 'PARCIAL' | 'FINAL'; prazoEm: Date }> = []
  let k = 1
  for (;;) {
    const d = new Date(inicio)
    d.setMonth(d.getMonth() + 6 * k)
    if (d >= fim) break
    out.push({ tipo: 'PARCIAL', prazoEm: d })
    k++
  }
  out.push({ tipo: 'FINAL', prazoEm: fim })
  return out
}

// ------------------------------------------------------------------
// OCORRÊNCIA DISCIPLINAR — devido processo (contraditório e ampla defesa)
// ------------------------------------------------------------------
export type StatusOcorrencia = 'REGISTRADA' | 'NOTIFICADA' | 'DEFESA_RECEBIDA' | 'EM_JULGAMENTO' | 'DECIDIDA' | 'EM_RECURSO' | 'CONCLUIDA' | 'ARQUIVADA'
export const TRANSICOES_OCORRENCIA: Record<StatusOcorrencia, StatusOcorrencia[]> = {
  REGISTRADA: ['NOTIFICADA', 'ARQUIVADA'],
  NOTIFICADA: ['DEFESA_RECEBIDA', 'EM_JULGAMENTO', 'ARQUIVADA'],
  DEFESA_RECEBIDA: ['EM_JULGAMENTO', 'ARQUIVADA'],
  EM_JULGAMENTO: ['DECIDIDA'],
  DECIDIDA: ['EM_RECURSO', 'CONCLUIDA'],
  EM_RECURSO: ['CONCLUIDA'],
  CONCLUIDA: [],
  ARQUIVADA: [],
}

export interface CtxOcorrencia { status: StatusOcorrencia; prazoDefesaEm?: Date | null; prazoRecursoEm?: Date | null; gravidade: string; defesa?: string | null; sancao?: string | null; agora?: Date }

export function validarTransicaoOcorrencia(para: StatusOcorrencia, c: CtxOcorrencia): string | null {
  const agora = c.agora ?? new Date()
  if (!TRANSICOES_OCORRENCIA[c.status].includes(para)) return `Transição inválida: ${c.status} → ${para}.`
  if (para === 'EM_JULGAMENTO' && c.status === 'NOTIFICADA') {
    if (!c.prazoDefesaEm || agora <= c.prazoDefesaEm) return 'O prazo de defesa ainda não terminou: aguarde a defesa ou o fim do prazo (contraditório).'
  }
  if (para === 'CONCLUIDA' && c.status === 'DECIDIDA') {
    if (c.prazoRecursoEm && agora <= c.prazoRecursoEm) return 'Prazo de recurso ainda em curso.'
  }
  if (para === 'EM_RECURSO' && c.prazoRecursoEm && agora > c.prazoRecursoEm) return 'Prazo de recurso expirado.'
  return null
}

const SANCOES_POR_GRAVIDADE: Record<string, { sancoes: string[]; maxSuspensao: number }> = {
  LEVE: { sancoes: ['ADVERTENCIA_VERBAL', 'ADVERTENCIA_ESCRITA', 'ARQUIVAMENTO'], maxSuspensao: 0 },
  MEDIA: { sancoes: ['ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'ARQUIVAMENTO'], maxSuspensao: 5 },
  GRAVE: { sancoes: ['ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'ARQUIVAMENTO'], maxSuspensao: 30 },
  GRAVISSIMA: { sancoes: ['ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'DESLIGAMENTO', 'ARQUIVAMENTO'], maxSuspensao: 30 },
}
export function validarSancao(gravidade: string, sancao: string, dias?: number | null, fundamentacao?: string | null): string | null {
  const regra = SANCOES_POR_GRAVIDADE[gravidade]
  if (!regra) return 'Gravidade inválida.'
  if (!regra.sancoes.includes(sancao)) return `Sanção ${sancao} incompatível com gravidade ${gravidade} (proporcionalidade).`
  if (sancao === 'SUSPENSAO') {
    if (!dias || dias < 1) return 'Informe os dias de suspensão.'
    if (dias > regra.maxSuspensao) return `Suspensão máxima de ${regra.maxSuspensao} dia(s) para gravidade ${gravidade}.`
  }
  if (sancao !== 'ARQUIVAMENTO' && sancao !== 'ADVERTENCIA_VERBAL' && (!fundamentacao || fundamentacao.trim().length < 20)) return 'Decisão exige fundamentação (mín. 20 caracteres).'
  return null
}

// ------------------------------------------------------------------
// NPS / AGREGAÇÃO DE PESQUISAS (anonimato com mínimo de respostas)
// ------------------------------------------------------------------
export function calcularNps(scores: number[]) {
  const v = scores.filter((s) => Number.isFinite(s) && s >= 0 && s <= 10)
  const n = v.length
  if (n === 0) return { n: 0, promotores: 0, neutros: 0, detratores: 0, nps: null as number | null }
  const promotores = v.filter((s) => s >= 9).length
  const detratores = v.filter((s) => s <= 6).length
  const neutros = n - promotores - detratores
  return { n, promotores, neutros, detratores, nps: Math.round(((promotores - detratores) / n) * 100) }
}

export interface PerguntaInst { id: string; texto: string; tipo: 'ESCALA' | 'NPS' | 'SIM_NAO' | 'TEXTO' | 'MULTIPLA'; opcoes?: string[]; obrigatoria?: boolean }

export function validarRespostas(perguntas: PerguntaInst[], respostas: Record<string, unknown>, escalaMax = 5): string | null {
  for (const p of perguntas) {
    const v = respostas[p.id]
    const vazio = v === undefined || v === null || v === ''
    if (vazio) { if (p.obrigatoria) return `Pergunta obrigatória sem resposta: "${p.texto}".`; continue }
    if (p.tipo === 'ESCALA' && !(typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= escalaMax)) return `Resposta inválida (1-${escalaMax}) em "${p.texto}".`
    if (p.tipo === 'NPS' && !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10)) return `Resposta inválida (0-10) em "${p.texto}".`
    if (p.tipo === 'SIM_NAO' && typeof v !== 'boolean') return `Resposta inválida (sim/não) em "${p.texto}".`
    if (p.tipo === 'MULTIPLA' && !(typeof v === 'string' && (p.opcoes ?? []).includes(v))) return `Opção inválida em "${p.texto}".`
    if (p.tipo === 'TEXTO' && typeof v !== 'string') return `Resposta de texto inválida em "${p.texto}".`
  }
  return null
}

export interface RespostaAgg { respostas: Record<string, unknown>; nps?: number | null; comentario?: string | null }

export function agregarRespostas(perguntas: PerguntaInst[], dados: RespostaAgg[], minRespostas: number, convidados = 0) {
  const n = dados.length
  const base = { n, convidados, taxaResposta: convidados > 0 ? round1((n / convidados) * 100) : null, minRespostas }
  if (n < minRespostas) return { ...base, suprimido: true as const, motivo: `Resultados ocultos até atingir ${minRespostas} respostas (anonimato).` }
  const porPergunta = perguntas.map((p) => {
    const vals = dados.map((d) => d.respostas[p.id]).filter((x) => x !== undefined && x !== null && x !== '')
    if (p.tipo === 'ESCALA' || p.tipo === 'NPS') {
      const nums = vals.filter((x): x is number => typeof x === 'number')
      const dist: Record<string, number> = {}
      nums.forEach((x) => (dist[x] = (dist[x] ?? 0) + 1))
      return { id: p.id, texto: p.texto, tipo: p.tipo, n: nums.length, media: nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null, distribuicao: dist, ...(p.tipo === 'NPS' ? { nps: calcularNps(nums) } : {}) }
    }
    if (p.tipo === 'SIM_NAO') {
      const b = vals.filter((x): x is boolean => typeof x === 'boolean')
      return { id: p.id, texto: p.texto, tipo: p.tipo, n: b.length, sim: b.filter(Boolean).length, nao: b.filter((x) => !x).length, percentualSim: b.length ? round1((b.filter(Boolean).length / b.length) * 100) : null }
    }
    if (p.tipo === 'MULTIPLA') {
      const dist: Record<string, number> = {}
      vals.forEach((x) => (dist[String(x)] = (dist[String(x)] ?? 0) + 1))
      return { id: p.id, texto: p.texto, tipo: p.tipo, n: vals.length, distribuicao: dist }
    }
    return { id: p.id, texto: p.texto, tipo: p.tipo, n: vals.length, textos: vals.map(String).sort() } // ordenados: não revelam ordem de envio
  })
  const nota = porPergunta.filter((x: any) => x.tipo === 'ESCALA' && x.media != null) as any[]
  const mediaGeral = nota.length ? round2(nota.reduce((a, b) => a + b.media, 0) / nota.length) : null
  const npsScores = dados.map((d) => d.nps).filter((x): x is number => typeof x === 'number')
  const comentarios = dados.map((d) => d.comentario).filter((x): x is string => !!x && x.trim().length > 0).sort()
  return { ...base, suprimido: false as const, mediaGeral, nps: npsScores.length ? calcularNps(npsScores) : null, porPergunta, comentarios }
}

// ------------------------------------------------------------------
// OUVIDORIA
// ------------------------------------------------------------------
export const PRAZO_OUVIDORIA_DIAS = 30           // Lei 13.460/2017, art. 16
export const PRORROGACAO_OUVIDORIA_DIAS = 30

export function gerarProtocolo(ano: number, seq: number): string {
  const base = `${ano}${String(seq).padStart(6, '0')}`
  const dv = base.split('').reduce((s, c, i) => s + Number(c) * (i + 1), 0) % 11
  return `OUV-${ano}-${String(seq).padStart(6, '0')}-${dv === 10 ? 0 : dv}`
}
export function protocoloValido(p: string): boolean {
  const m = /^OUV-(\d{4})-(\d{6})-(\d)$/.exec(p.trim().toUpperCase())
  if (!m) return false
  return gerarProtocolo(Number(m[1]), Number(m[2])) === p.trim().toUpperCase()
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function gerarSenhaAcompanhamento(tam = 8): string {
  const b = randomBytes(tam)
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join('')
}
export function hashSenha(senha: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(senha.trim().toUpperCase(), salt, 32).toString('hex')
  return { hash, salt }
}
export function verificarSenha(senha: string, hash: string, salt: string): boolean {
  try {
    const h = scryptSync(String(senha).trim().toUpperCase(), salt, 32)
    const e = Buffer.from(hash, 'hex')
    return h.length === e.length && timingSafeEqual(h, e)
  } catch { return false }
}
export const hashCurto = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// Estado de SLA: no prazo, atenção (>=80% do tempo), vencida; nível de escalonamento por atraso.
export function estadoSla(criadoEm: Date, prazoEm: Date, agora = new Date()) {
  const total = Math.max(1, prazoEm.getTime() - criadoEm.getTime())
  const usado = (agora.getTime() - criadoEm.getTime()) / total
  const atrasoDias = Math.max(0, diffDays(agora, prazoEm))
  const estado = agora > prazoEm ? 'VENCIDA' : usado >= 0.8 ? 'ATENCAO' : 'NO_PRAZO'
  // nível 1 ao vencer; nível 2 após 5 dias de atraso; nível 3 após 15 dias
  const nivel = atrasoDias <= 0 ? 0 : atrasoDias < 5 ? 1 : atrasoDias < 15 ? 2 : 3
  return { estado, percentualUsado: round1(usado * 100), atrasoDias: round1(atrasoDias), nivelEscalonamento: nivel }
}

export interface ManifestacaoAgg {
  tipo: string; status: string; setorId?: string | null; criadoEm: Date; prazoEm: Date; respondidaEm?: Date | null; encerradaEm?: Date | null
  anonima?: boolean; avaliacaoNota?: number | null; categoria?: string | null; escalonamentos?: number
}
export function agregarManifestacoes(lista: ManifestacaoAgg[]) {
  const cont = <K extends string>(f: (m: ManifestacaoAgg) => K | null | undefined) => {
    const o: Record<string, number> = {}
    lista.forEach((m) => { const k = f(m) ?? 'NAO_INFORMADO'; o[k] = (o[k] ?? 0) + 1 })
    return o
  }
  const resp = lista.filter((m) => m.respondidaEm || m.encerradaEm)
  const dias = resp.map((m) => diffDays((m.respondidaEm ?? m.encerradaEm) as Date, m.criadoEm))
  const noPrazo = resp.filter((m) => ((m.respondidaEm ?? m.encerradaEm) as Date) <= m.prazoEm).length
  const notas = lista.map((m) => m.avaliacaoNota).filter((x): x is number => typeof x === 'number')
  return {
    total: lista.length,
    porTipo: cont((m) => m.tipo),
    porStatus: cont((m) => m.status),
    porSetor: cont((m) => m.setorId),
    porCategoria: cont((m) => m.categoria),
    anonimas: lista.filter((m) => m.anonima).length,
    respondidas: resp.length,
    tempoMedioRespostaDias: dias.length ? round1(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
    percentualNoPrazo: resp.length ? round1((noPrazo / resp.length) * 100) : null,
    abertasVencidas: lista.filter((m) => !['RESPONDIDA', 'ENCERRADA', 'ARQUIVADA'].includes(m.status) && m.prazoEm < new Date()).length,
    escalonadas: lista.filter((m) => (m.escalonamentos ?? 0) > 0).length,
    satisfacaoMedia: notas.length ? round2(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
    avaliacoes: notas.length,
  }
}

// ------------------------------------------------------------------
// EGRESSOS
// ------------------------------------------------------------------
export interface EgressoAgg {
  situacaoProfissional: string; atuaNaArea?: boolean | null; cursandoPos?: boolean; faixaSalarial?: string | null
  anoConclusao?: number | null; primeiroEmpregoEm?: Date | null; ultimaAtualizacaoEm?: Date | null; programId?: string | null
}
export function calcularIndicadoresEgressos(lista: EgressoAgg[], agora = new Date()) {
  const total = lista.length
  const informados = lista.filter((e) => e.situacaoProfissional !== 'NAO_INFORMADO')
  const ocupados = informados.filter((e) => ['EMPREGADO', 'AUTONOMO', 'EMPREENDEDOR'].includes(e.situacaoProfissional))
  const comArea = ocupados.filter((e) => e.atuaNaArea != null)
  const meses = lista
    .filter((e) => e.primeiroEmpregoEm && e.anoConclusao)
    .map((e) => Math.max(0, (e.primeiroEmpregoEm!.getTime() - new Date(e.anoConclusao!, 11, 31).getTime()) / (30.44 * DAY)))
  const salarios: Record<string, number> = {}
  lista.forEach((e) => { if (e.faixaSalarial) salarios[e.faixaSalarial] = (salarios[e.faixaSalarial] ?? 0) + 1 })
  const situacao: Record<string, number> = {}
  lista.forEach((e) => (situacao[e.situacaoProfissional] = (situacao[e.situacaoProfissional] ?? 0) + 1))
  const umAno = agora.getTime() - 365 * DAY
  const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : null)
  return {
    total,
    informados: informados.length,
    taxaInformacao: pct(informados.length, total),
    taxaInsercao: pct(ocupados.length, informados.length),           // inserção profissional (empregado/autônomo/empreendedor)
    taxaInsercaoOuEstudo: pct(informados.filter((e) => ocupados.includes(e) || e.cursandoPos || e.situacaoProfissional === 'ESTUDANDO').length, informados.length),
    taxaAtuacaoNaArea: pct(comArea.filter((e) => e.atuaNaArea).length, comArea.length),
    taxaPosGraduacao: pct(lista.filter((e) => e.cursandoPos).length, total),
    tempoMedioPrimeiroEmpregoMeses: meses.length ? round1(meses.reduce((a, b) => a + b, 0) / meses.length) : null,
    porSituacao: situacao,
    porFaixaSalarial: salarios,
    perfisAtualizadosUltimoAno: lista.filter((e) => e.ultimaAtualizacaoEm && e.ultimaAtualizacaoEm.getTime() >= umAno).length,
  }
}

// ------------------------------------------------------------------
// PLANO AEE
// ------------------------------------------------------------------
export function estadoPlanoAee(vigenciaFim: Date, status: string, agora = new Date()) {
  if (status === 'VIGENTE' && vigenciaFim < agora) return 'VENCIDO'
  return status
}
export function adaptacaoTempoExtra(tempoBaseMin: number, percent: number) {
  return Math.ceil(tempoBaseMin * (1 + percent / 100))
}
