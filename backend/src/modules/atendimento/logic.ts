import { randomBytes } from 'crypto'
import { rankFaq, normalizeText, tokens } from '../comunicacao/pure'
export { addBusinessDays, sha256, normalizarCodigo, gerarCodigoVerificacao, dataExtenso } from '../secretaria/logic'
export { rankFaq, normalizeText }

// ============================================================ funções PURAS (sem banco) do módulo de atendimento
export const CANAIS = ['BALCAO', 'TELEFONE', 'WHATSAPP', 'EMAIL', 'CHAT_PORTAL', 'INSTAGRAM', 'FACEBOOK'] as const
export type Canal = (typeof CANAIS)[number]
/** Canais que existem em ComCanal (espelhados na caixa da comunicação). */
export const CANAL_COM: Record<string, string | undefined> = { WHATSAPP: 'WHATSAPP', EMAIL: 'EMAIL', CHAT_PORTAL: 'SITE_CHAT', INSTAGRAM: 'INSTAGRAM', FACEBOOK: 'FACEBOOK' }
export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const
export const STATUS_ATD = ['NOVO', 'EM_FILA', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE', 'RESOLVIDO', 'FECHADO'] as const
export const ATD_ABERTOS = ['NOVO', 'EM_FILA', 'EM_ATENDIMENTO', 'AGUARDANDO_SOLICITANTE']
export const PESO_PRIORIDADE: Record<string, number> = { BAIXA: 1.5, NORMAL: 1, ALTA: 0.6, URGENTE: 0.3 } // multiplicador do SLA

export function slaPorPrioridade(base: { primeiraMin: number; resolucaoMin: number }, prioridade: string) {
  const f = PESO_PRIORIDADE[prioridade] ?? 1
  return { primeiraMin: Math.max(5, Math.round(base.primeiraMin * f)), resolucaoMin: Math.max(15, Math.round(base.resolucaoMin * f)) }
}
export function statusSla(a: { status: string; slaPrimeiraRespostaEm?: Date | null; primeiraRespostaEm?: Date | null; slaResolucaoEm?: Date | null }, now = new Date()): 'OK' | 'ATENCAO' | 'ESTOURADO' | 'ENCERRADO' {
  if (['RESOLVIDO', 'FECHADO'].includes(a.status)) return 'ENCERRADO'
  const t = now.getTime()
  if (a.slaPrimeiraRespostaEm && !a.primeiraRespostaEm && a.slaPrimeiraRespostaEm.getTime() < t) return 'ESTOURADO'
  if (a.slaResolucaoEm && a.slaResolucaoEm.getTime() < t) return 'ESTOURADO'
  const quase = (d?: Date | null) => !!d && d.getTime() - t < 30 * 60_000
  if ((a.slaPrimeiraRespostaEm && !a.primeiraRespostaEm && quase(a.slaPrimeiraRespostaEm)) || quase(a.slaResolucaoEm)) return 'ATENCAO'
  return 'OK'
}

/** Escolhe o membro: RODIZIO = o que recebeu há mais tempo; MENOR_CARGA = menos atendimentos abertos. Respeita capacidade. */
export function escolherMembro(membros: Array<{ userId: string; capacidade: number; ultimaAtribuicaoEm: Date | null; abertos: number }>, modo: string): string | null {
  const livres = membros.filter((m) => m.abertos < m.capacidade)
  if (!livres.length || modo === 'MANUAL') return null
  const ord = [...livres].sort((a, b) => (modo === 'MENOR_CARGA' ? a.abertos - b.abertos : 0) || (a.ultimaAtribuicaoEm?.getTime() ?? 0) - (b.ultimaAtribuicaoEm?.getTime() ?? 0) || a.userId.localeCompare(b.userId))
  return ord[0].userId
}

// ------------------------------------------------------------ protocolo / rastreio
const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function gerarCodigoRastreio(): string {
  const b = randomBytes(12)
  let s = ''
  for (let i = 0; i < 12; i++) s += ALFA[b[i] % ALFA.length]
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}
export function normalizarRastreio(c: string): string | null {
  const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== 12 || /[^A-HJ-NP-Z2-9]/.test(s)) return null
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}
export const formatProtocolo = (ano: number, seq: number) => `${ano}/${String(seq).padStart(6, '0')}`

export interface EtapaModelo { codigo: string; nome: string; prazoDias?: number; setorCodigo?: string }
export const ETAPAS_PADRAO: EtapaModelo[] = [
  { codigo: 'RECEBIDO', nome: 'Recebido', prazoDias: 0 },
  { codigo: 'CONFERENCIA', nome: 'Conferência de documentos', prazoDias: 1 },
  { codigo: 'ANALISE', nome: 'Em análise no setor', prazoDias: 3 },
  { codigo: 'ASSINATURA', nome: 'Assinatura', prazoDias: 1 },
  { codigo: 'PRONTO', nome: 'Pronto', prazoDias: 0 },
  { codigo: 'ENTREGUE', nome: 'Entregue', prazoDias: 0 },
]
export function validarEtapas(e: unknown): string | null {
  if (!Array.isArray(e) || !e.length) return 'Informe ao menos uma etapa.'
  if (e.length > 12) return 'No máximo 12 etapas.'
  const cods = new Set<string>()
  for (const x of e) {
    if (!x || typeof x.codigo !== 'string' || !/^[A-Z0-9_]{2,30}$/.test(x.codigo)) return 'Código de etapa inválido (use MAIÚSCULAS, números e _).'
    if (typeof x.nome !== 'string' || !x.nome.trim()) return 'Toda etapa precisa de nome.'
    if (cods.has(x.codigo)) return `Etapa repetida: ${x.codigo}.`
    cods.add(x.codigo)
  }
  return null
}

/** Distribui o prazo total entre as etapas proporcionalmente aos prazoDias do modelo. */
export function calcularPrazosEtapas(etapas: EtapaModelo[], inicio: Date, prazoTotalDias: number, addDias: (d: Date, n: number) => Date) {
  const soma = etapas.reduce((s, e) => s + (e.prazoDias ?? 0), 0)
  let acum = 0
  return etapas.map((e) => {
    acum += e.prazoDias ?? 0
    const dias = soma > 0 ? Math.round((acum / soma) * prazoTotalDias) : 0
    return addDias(inicio, dias)
  })
}

export interface EtapaPublica { codigo: string; nome: string; status: string; concluidaEm: Date | null; prazoEm: Date | null; mensagem?: string | null }
/** Filtra as etapas conforme a configuração da instituição; etapa oculta nunca aparece (nem o status dela). */
export function etapasVisiveis<T extends { codigo: string; nome: string; status: string; concluidaEm: Date | null; prazoEm: Date | null }>(etapas: T[], cfg: Array<{ codigo: string; visivelSolicitante: boolean; nome?: string; mensagemPublica?: string | null }>): EtapaPublica[] {
  const m = new Map(cfg.map((c) => [c.codigo, c]))
  return etapas
    .filter((e) => m.get(e.codigo)?.visivelSolicitante ?? true)
    .map((e) => ({ codigo: e.codigo, nome: m.get(e.codigo)?.nome || e.nome, status: e.status, concluidaEm: e.concluidaEm, prazoEm: e.prazoEm, mensagem: e.status === 'EM_ANDAMENTO' || e.status === 'CONCLUIDA' ? m.get(e.codigo)?.mensagemPublica ?? null : null }))
}
export function progressoJornada(etapas: Array<{ status: string }>) {
  if (!etapas.length) return 0
  return Math.round((etapas.filter((e) => e.status === 'CONCLUIDA' || e.status === 'PULADA').length / etapas.length) * 100)
}

// ------------------------------------------------------------ LGPD / IA
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const RE_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g
const RE_TEL = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g
const RE_CARTAO = /\b(?:\d[ -]?){13,19}\b/g
const RE_RA = /\bRA\s?[:#-]?\s?[A-Z0-9]{5,}\b/gi
const SENSIVEL = /\b(cid\b|cid-?10|laudo|atestado m[eé]dico|diagn[oó]stico|doen[cç]a|depress[aã]o|ansiedade|suic[ií]d|psiquiatr|psic[oó]log|tratamento m[eé]dico|defici[eê]ncia|hiv|c[aâ]ncer|gesta[nç]|gr[aá]vida|biometri|religi[aã]o|orienta[cç][aã]o sexual|filiado|menor de idade|viol[eê]ncia|abuso|medicament)/i

export interface Redacao { texto: string; redigidos: number }
/** Minimização (LGPD art. 6º, III): remove identificadores antes de enviar texto a qualquer provedor de IA. */
export function redigirParaIa(texto: string, nomes: string[] = []): Redacao {
  let n = 0
  const sub = (re: RegExp, rep: string) => { texto = texto.replace(re, () => { n++; return rep }) }
  sub(RE_EMAIL, '[EMAIL]'); sub(RE_CNPJ, '[CNPJ]'); sub(RE_CPF, '[CPF]'); sub(RE_CARTAO, '[NUMERO]'); sub(RE_TEL, '[TELEFONE]'); sub(RE_RA, '[RA]')
  for (const nome of nomes) for (const parte of nome.split(/\s+/).filter((p) => p.length >= 3)) texto = texto.replace(new RegExp(`\\b${parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), () => { n++; return '[NOME]' })
  return { texto, redigidos: n }
}
export const contemSensivel = (t: string) => SENSIVEL.test(t)

// ------------------------------------------------------------ classificação / resposta (motor simulado, sem chave)
export interface SetorLite { id: string; codigo: string; nome: string; palavrasChave: string[] }
export interface ServicoLite { id: string; codigo: string; nome: string; setorId: string | null; autoatendimento: boolean; descricao?: string | null }
export interface Classificacao { categoria: string; setorId: string | null; setorCodigo: string | null; servicoId: string | null; servicoCodigo: string | null; prioridade: string; confianca: number; motivos: string[] }

const CATEGORIAS: Record<string, string[]> = {
  FINANCEIRO: ['boleto', 'mensalidade', 'pagamento', 'segunda via', '2a via', 'cobranca', 'desconto', 'bolsa', 'financiamento', 'fies', 'prouni', 'parcela', 'negociar', 'fatura'],
  DOCUMENTOS: ['declaracao', 'historico', 'certificado', 'diploma', 'atestado', 'comprovante', 'vinculo', 'termo'],
  ACADEMICO: ['trancamento', 'trancar', 'matricula', 'rematricula', 'disciplina', 'nota', 'falta', 'frequencia', 'transferencia', 'aproveitamento', 'dispensa', 'revisao de prova', 'horario', 'calendario', 'estagio'],
  TI_ACESSO: ['senha', 'login', 'acesso', 'portal', 'aplicativo', 'wifi', 'email institucional'],
  OUVIDORIA: ['reclamacao', 'denuncia', 'elogio', 'sugestao', 'ouvidoria', 'assedio'],
}
const URGENTES = ['urgente', 'prazo hoje', 'ultimo dia', 'amanha', 'bloqueado', 'cobranca indevida', 'procon', 'advogado', 'cancelar matricula']

export function classificarDemanda(texto: string, setores: SetorLite[], servicos: ServicoLite[]): Classificacao {
  const n = ' ' + normalizeText(texto) + ' '
  const tk = new Set(tokens(texto))
  const motivos: string[] = []
  let melhorCat = 'GERAL', melhorPts = 0
  for (const [cat, kws] of Object.entries(CATEGORIAS)) {
    const pts = kws.filter((k) => n.includes(k)).length
    if (pts > melhorPts) { melhorPts = pts; melhorCat = cat }
  }
  if (melhorPts) motivos.push(`palavras da categoria ${melhorCat}`)
  let setor: SetorLite | null = null, sPts = 0
  for (const s of setores) {
    const pts = s.palavrasChave.reduce((a, k) => a + (n.includes(normalizeText(k)) ? 1 : 0), 0)
    if (pts > sPts) { setor = s; sPts = pts }
  }
  if (setor) motivos.push(`setor ${setor.codigo} por palavras-chave`)
  let serv: ServicoLite | null = null, vPts = 0
  for (const s of servicos) {
    const alvo = new Set(tokens(s.nome + ' ' + (s.descricao ?? '')))
    let pts = 0
    for (const t of tk) if (alvo.has(t) && t.length > 3) pts++
    if (pts > vPts) { vPts = pts; serv = s }
  }
  if (serv && vPts >= 2) { motivos.push(`serviço ${serv.codigo}`); if (!setor && serv.setorId) setor = setores.find((x) => x.id === serv!.setorId) ?? null } else serv = null
  const urgente = URGENTES.some((u) => n.includes(u))
  const conf = Math.min(0.95, 0.25 + 0.2 * melhorPts + 0.2 * Math.min(sPts, 2) + (serv ? 0.2 : 0))
  return { categoria: melhorCat, setorId: setor?.id ?? null, setorCodigo: setor?.codigo ?? null, servicoId: serv?.id ?? null, servicoCodigo: serv?.codigo ?? null, prioridade: urgente ? 'ALTA' : 'NORMAL', confianca: Math.round(conf * 100) / 100, motivos }
}

export interface FaqLite2 { id: string; pergunta: string; resposta: string; palavrasChave: string[] }
/** Confiança de 0 a 1 a partir da pontuação do ranking (rankFaq normaliza por √tokens). */
export function confiancaFaq(score: number, segundo = 0): number {
  if (score <= 0) return 0
  const base = Math.min(1, score / 3)
  const gap = segundo ? Math.max(0, (score - segundo) / score) : 1
  return Math.round(Math.min(0.98, base * (0.7 + 0.3 * gap)) * 100) / 100
}
export function melhorResposta(base: FaqLite2[], pergunta: string) {
  const r = rankFaq(base, pergunta, 2)
  if (!r.length) return null
  return { faq: r[0].faq, score: r[0].score, confianca: confiancaFaq(r[0].score, r[1]?.score ?? 0), alternativas: r.slice(1).map((x) => x.faq.id) }
}
export function saudacao(nome?: string | null) { const p = (nome || '').trim().split(/\s+/)[0]; return p ? `Olá, ${p}!` : 'Olá!' }

/** Resumo extrativo (sem provedor): demanda inicial + último contato de cada lado + situação. */
export function resumirConversa(msgs: Array<{ direcao: string; conteudo: string }>, maxChars = 600): string {
  const ent = msgs.filter((m) => m.direcao === 'ENTRADA'), sai = msgs.filter((m) => m.direcao === 'SAIDA')
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
  const partes: string[] = []
  if (ent[0]) partes.push(`Demanda: ${cut(ent[0].conteudo.replace(/\s+/g, ' '), 220)}`)
  if (ent.length > 1) partes.push(`Último contato do solicitante: ${cut(ent[ent.length - 1].conteudo.replace(/\s+/g, ' '), 160)}`)
  if (sai.length) partes.push(`Última resposta da instituição: ${cut(sai[sai.length - 1].conteudo.replace(/\s+/g, ' '), 160)}`)
  partes.push(`${msgs.length} mensagem(ns); ${sai.length ? 'já respondido' : 'sem resposta ainda'}.`)
  return cut(partes.join(' | '), maxChars)
}

// ------------------------------------------------------------ documentos
export function renderTexto(tpl: string, vars: Record<string, unknown>): { texto: string; faltantes: string[] } {
  const faltantes: string[] = []
  const texto = tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => { const v = vars[k]; if (v === undefined || v === null || v === '') { faltantes.push(k); return '—' } return String(v) })
  return { texto, faltantes: [...new Set(faltantes)] }
}
export function camposDoTexto(tpl: string): string[] { return [...new Set([...tpl.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))] }
export const CAMPOS_DINAMICOS = ['nome', 'cpf', 'ra', 'curso', 'modalidade', 'periodo', 'matricula', 'situacao', 'ingresso', 'conclusao', 'carga_horaria_total', 'carga_horaria_cursada', 'frequencia_media', 'coeficiente', 'disciplinas_aprovadas', 'historico', 'data', 'instituicao', 'numero', 'codigo', 'finalidade', 'dias_afastamento']
export const TIPOS_MODELO = ['CERTIFICADO', 'DIPLOMA', 'DECLARACAO', 'ATESTADO', 'TERMO'] as const
export const mascCpf = (v?: string | null) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '' }

/** Conteúdo canônico usado no hash do documento (independe de layout). */
export function conteudoCanonico(p: { numero: string; codigo: string; titulo: string; destinatario: string; conteudo: string }) { return [p.numero, p.codigo, p.titulo, p.destinatario, p.conteudo].join('\n') }

export function proximaEtapa<T extends { ordem: number; status: string }>(etapas: T[]): T | null {
  return [...etapas].sort((a, b) => a.ordem - b.ordem).find((e) => e.status === 'PENDENTE') ?? null
}
