import crypto from 'crypto'

// Funções PURAS do módulo de comunicação (sem I/O). Testadas em __selftest__.ts.

export const CANAIS_ENVIO = ['EMAIL', 'WHATSAPP', 'SMS', 'TELEGRAM', 'VOZ'] as const
export type CanalEnvio = (typeof CANAIS_ENVIO)[number]

// ---------------------------------------------------------------- texto
export function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set(['a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'um', 'uma', 'para', 'por', 'com', 'que', 'se', 'no', 'na', 'os', 'as', 'eu', 'meu', 'minha', 'qual', 'como', 'quero', 'gostaria', 'preciso', 'posso', 'ola', 'oi', 'bom', 'dia', 'boa', 'tarde', 'noite'])

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (d.length < 11 || d.length > 15) return null
  return '+' + d
}

export function onlyDigits(s?: string | null): string {
  return String(s || '').replace(/\D/g, '')
}

// ---------------------------------------------------------------- templates
export function extractVars(tpl: string): string[] {
  const out = new Set<string>()
  for (const m of String(tpl || '').matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) out.add(m[1])
  return [...out]
}

export function renderTemplate(tpl: string, vars: Record<string, unknown>): { texto: string; faltantes: string[] } {
  const faltantes: string[] = []
  const texto = String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k]
    if (v === undefined || v === null || v === '') {
      if (!faltantes.includes(k)) faltantes.push(k)
      return ''
    }
    return String(v)
  })
  return { texto, faltantes }
}

export function formatBRL(v: number): string {
  return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Data no fuso de Brasília (UTC-3, sem horário de verão desde 2019).
const BRT_MS = -3 * 3600_000
export function brtParts(d: Date) {
  const l = new Date(d.getTime() + BRT_MS)
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), dow: l.getUTCDay(), h: l.getUTCHours(), min: l.getUTCMinutes() }
}
export function formatDateBR(d: Date): string {
  const p = brtParts(d)
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
}
// Dia civil (BRT) como número de dias desde a época, para diferenças de datas.
export function dayNumberBRT(d: Date): number {
  return Math.floor((d.getTime() + BRT_MS) / 86_400_000)
}

// ---------------------------------------------------------------- janela comercial
export interface JanelaCfg {
  horarioInicio: string
  horarioFim: string
  diasUteis: number[]
}
function hhmm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '')
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}
export function dentroDaJanela(now: Date, cfg: JanelaCfg): boolean {
  const p = brtParts(now)
  if (!cfg.diasUteis.includes(p.dow)) return false
  const mins = p.h * 60 + p.min
  return mins >= hhmm(cfg.horarioInicio) && mins < hhmm(cfg.horarioFim)
}
// Próximo instante em que a janela está aberta (>= now).
export function proximaJanela(now: Date, cfg: JanelaCfg): Date {
  if (dentroDaJanela(now, cfg)) return now
  if (!cfg.diasUteis.length) return now
  const ini = hhmm(cfg.horarioInicio)
  for (let add = 0; add <= 8; add++) {
    const base = new Date(now.getTime() + add * 86_400_000)
    const p = brtParts(base)
    if (!cfg.diasUteis.includes(p.dow)) continue
    // meia-noite BRT desse dia + início
    const midnightUtc = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0) - BRT_MS
    const cand = new Date(midnightUtc + ini * 60_000)
    if (cand.getTime() > now.getTime()) return cand
  }
  return now
}

// ---------------------------------------------------------------- retentativas
export function backoffMs(tentativasFeitas: number, minutos: number[]): number {
  const arr = minutos.length ? minutos : [5, 15, 60]
  const i = Math.max(0, Math.min(arr.length - 1, tentativasFeitas - 1))
  return arr[i] * 60_000
}

export interface DecisaoRetentativa {
  acao: 'RETENTAR' | 'FALHAR'
  proximaEm?: Date
}
export function decidirRetentativa(p: { tentativas: number; maxTentativas: number; retryable: boolean; now: Date; backoff: number[] }): DecisaoRetentativa {
  if (!p.retryable || p.tentativas >= p.maxTentativas) return { acao: 'FALHAR' }
  return { acao: 'RETENTAR', proximaEm: new Date(p.now.getTime() + backoffMs(p.tentativas, p.backoff)) }
}

// ---------------------------------------------------------------- consentimento
export interface PrefLinha {
  canal: string
  finalidade: string
  consentimento: boolean
}
// Regra: a preferência mais específica (canal exato > "*", finalidade exata > TODAS) vence.
// Sem registro: permitido para ACADEMICO/COBRANCA (base legal: execução de contrato) e
// para MARKETING exige consentimento explícito (opt-in) quando `exigirOptInMarketing`.
export function podeEnviar(prefs: PrefLinha[], canal: string, finalidade: string, opts: { exigirOptInMarketing?: boolean } = {}): { ok: boolean; motivo?: string } {
  const score = (p: PrefLinha) => (p.canal === canal ? 2 : p.canal === '*' ? 1 : -1) * 10 + (p.finalidade === finalidade ? 2 : p.finalidade === 'TODAS' ? 1 : -1)
  const aplicaveis = prefs.filter((p) => (p.canal === canal || p.canal === '*') && (p.finalidade === finalidade || p.finalidade === 'TODAS'))
  if (aplicaveis.length) {
    const melhor = aplicaveis.sort((a, b) => score(b) - score(a))[0]
    return melhor.consentimento ? { ok: true } : { ok: false, motivo: `Contato optou por não receber (${melhor.finalidade}/${melhor.canal}).` }
  }
  if (finalidade === 'MARKETING' && opts.exigirOptInMarketing) return { ok: false, motivo: 'Sem consentimento de marketing registrado.' }
  return { ok: true }
}

const OPTOUT = new Set(['sair', 'parar', 'stop', 'cancelar', 'descadastrar', 'remover', 'nao quero receber', 'pare'])
const OPTIN = new Set(['voltar', 'quero', 'reativar', 'start', 'iniciar', 'quero receber'])
export function detectarOptOut(texto: string): 'OPT_OUT' | 'OPT_IN' | null {
  const n = normalizeText(texto)
  if (OPTOUT.has(n)) return 'OPT_OUT'
  if (OPTIN.has(n)) return 'OPT_IN'
  return null
}

// ---------------------------------------------------------------- destino por canal
export interface ContatoDestino {
  email?: string | null
  telefone?: string | null
  telegramChatId?: string | null
}
export function pickDestino(canal: string, c: ContatoDestino): string | null {
  switch (canal) {
    case 'EMAIL':
      return c.email && /^\S+@\S+\.\S+$/.test(c.email) ? c.email.trim().toLowerCase() : null
    case 'WHATSAPP':
    case 'SMS':
    case 'VOZ':
      return normalizePhone(c.telefone)
    case 'TELEGRAM':
      return c.telegramChatId ? String(c.telegramChatId) : null
    default:
      return null
  }
}

// ---------------------------------------------------------------- régua de cobrança
export interface EtapaLite {
  id: string
  offsetDias: number
  ativa: boolean
}
export interface TituloLite {
  id: string
  vencimento: Date
  status: string // PENDENTE | ATRASADO | PAGO | CANCELADO
  pago?: boolean
}
export interface AlvoRegua {
  tituloId: string
  etapaId: string
  diasDesdeVencimento: number
}
// Uma etapa dispara quando (hoje - vencimento) >= offset, dentro da tolerância, e ainda não executada.
// Etapas "antes" (offset<0) só valem enquanto o título estiver em aberto; todas exigem título em aberto.
export function calcularAlvosRegua(titulos: TituloLite[], etapas: EtapaLite[], executadas: Set<string>, now: Date, toleranciaDias: number): AlvoRegua[] {
  const hoje = dayNumberBRT(now)
  const out: AlvoRegua[] = []
  for (const t of titulos) {
    if (t.pago || t.status === 'PAGO' || t.status === 'CANCELADO') continue
    const dias = hoje - dayNumberBRT(t.vencimento)
    for (const e of etapas) {
      if (!e.ativa) continue
      if (executadas.has(`${e.id}|${t.id}`)) continue
      if (dias >= e.offsetDias && dias <= e.offsetDias + Math.max(0, toleranciaDias)) {
        out.push({ tituloId: t.id, etapaId: e.id, diasDesdeVencimento: dias })
      }
    }
  }
  // Se mais de uma etapa do mesmo título cair no catch-up, só a mais recente (maior offset) é enviada.
  const porTitulo = new Map<string, AlvoRegua[]>()
  for (const a of out) porTitulo.set(a.tituloId, [...(porTitulo.get(a.tituloId) ?? []), a])
  const final: AlvoRegua[] = []
  for (const [, arr] of porTitulo) {
    const offs = (id: string) => etapas.find((e) => e.id === id)!.offsetDias
    arr.sort((a, b) => offs(b.etapaId) - offs(a.etapaId))
    final.push(arr[0])
  }
  return final
}

// ---------------------------------------------------------------- chatbot
export interface BotOpcao {
  rotulo: string
  gatilhos?: string[]
  proximo?: string
  acao?: string // BOLETO | NOTAS | CALENDARIO | FAQ | HANDOFF | FIM
}
export interface BotNo {
  texto: string
  opcoes?: BotOpcao[]
  acao?: string
}
export interface BotDef {
  inicio: string
  nos: Record<string, BotNo>
}
export interface BotEstado {
  fluxoId?: string
  no?: string
  invalidas?: number
  aguardandoCpf?: { acao: string; tentativas: number }
  verificadoEm?: number
}

export function renderNo(no: BotNo): string {
  const linhas = [no.texto]
  if (no.opcoes?.length) {
    linhas.push('')
    no.opcoes.forEach((o, i) => linhas.push(`${i + 1} - ${o.rotulo}`))
    linhas.push('')
    linhas.push('Responda com o número da opção (ou 0 para falar com um atendente).')
  }
  return linhas.join('\n')
}

export type PassoBot = { tipo: 'MENSAGEM'; texto: string; estado: BotEstado } | { tipo: 'ACAO'; acao: string; estado: BotEstado; prefixo?: string } | { tipo: 'HANDOFF'; estado: BotEstado } | { tipo: 'FIM'; texto: string; estado: BotEstado } | { tipo: 'NAO_ENTENDI'; estado: BotEstado }

export function escolherOpcao(no: BotNo, entrada: string): BotOpcao | null {
  const ops = no.opcoes ?? []
  const n = normalizeText(entrada)
  if (/^\d+$/.test(n)) {
    const i = Number(n)
    return i >= 1 && i <= ops.length ? ops[i - 1] : null
  }
  const toks = new Set(tokens(entrada))
  let melhor: { o: BotOpcao; s: number } | null = null
  for (const o of ops) {
    const palavras = new Set([...tokens(o.rotulo), ...(o.gatilhos ?? []).flatMap((g) => tokens(g))])
    let s = 0
    for (const t of toks) if (palavras.has(t)) s++
    if (s > 0 && (!melhor || s > melhor.s)) melhor = { o, s }
  }
  return melhor?.o ?? null
}

export function passoBot(def: BotDef, estado: BotEstado, entrada: string): PassoBot {
  const e: BotEstado = { ...estado }
  const n = normalizeText(entrada)
  if (n === '0' || n === 'atendente' || n === 'humano' || n === 'falar com atendente') return { tipo: 'HANDOFF', estado: e }
  const noId = e.no && def.nos[e.no] ? e.no : def.inicio
  const no = def.nos[noId]
  if (!no) return { tipo: 'NAO_ENTENDI', estado: e }
  // Primeira interação no fluxo: mostra o nó inicial.
  if (!e.no) {
    e.no = noId
    e.invalidas = 0
    return { tipo: 'MENSAGEM', texto: renderNo(no), estado: e }
  }
  const op = escolherOpcao(no, entrada)
  if (!op) {
    e.invalidas = (e.invalidas ?? 0) + 1
    if (e.invalidas >= 3) return { tipo: 'HANDOFF', estado: e }
    return { tipo: 'MENSAGEM', texto: 'Não entendi sua resposta.\n\n' + renderNo(no), estado: e }
  }
  e.invalidas = 0
  if (op.acao === 'HANDOFF') return { tipo: 'HANDOFF', estado: e }
  if (op.acao === 'FIM') return { tipo: 'FIM', texto: 'Obrigado pelo contato! Se precisar, é só chamar.', estado: { fluxoId: e.fluxoId } }
  if (op.acao && op.acao !== 'PROXIMO') return { tipo: 'ACAO', acao: op.acao, estado: e }
  if (op.proximo && def.nos[op.proximo]) {
    e.no = op.proximo
    const prox = def.nos[op.proximo]
    if (prox.acao && prox.acao !== 'PROXIMO' && !prox.opcoes?.length) {
      if (prox.acao === 'HANDOFF') return { tipo: 'HANDOFF', estado: e }
      if (prox.acao === 'FIM') return { tipo: 'FIM', texto: prox.texto, estado: { fluxoId: e.fluxoId } }
      return { tipo: 'ACAO', acao: prox.acao, estado: e, prefixo: prox.texto }
    }
    return { tipo: 'MENSAGEM', texto: renderNo(prox), estado: e }
  }
  return { tipo: 'NAO_ENTENDI', estado: e }
}

export function validarBotDef(def: any): string[] {
  const erros: string[] = []
  if (!def || typeof def !== 'object') return ['definição ausente']
  if (!def.inicio || !def.nos || typeof def.nos !== 'object') return ['definição precisa de "inicio" e "nos"']
  if (!def.nos[def.inicio]) erros.push(`nó inicial "${def.inicio}" não existe`)
  const acoes = new Set(['BOLETO', 'NOTAS', 'CALENDARIO', 'FAQ', 'HANDOFF', 'FIM', 'PROXIMO'])
  for (const [id, no] of Object.entries<any>(def.nos)) {
    if (!no || typeof no.texto !== 'string') erros.push(`nó "${id}" sem texto`)
    if (no?.acao && !acoes.has(no.acao)) erros.push(`nó "${id}" com ação inválida "${no.acao}"`)
    for (const [i, o] of (no?.opcoes ?? []).entries()) {
      if (!o.rotulo) erros.push(`nó "${id}" opção ${i + 1} sem rótulo`)
      if (o.proximo && !def.nos[o.proximo]) erros.push(`nó "${id}" opção ${i + 1} aponta para nó inexistente "${o.proximo}"`)
      if (o.acao && !acoes.has(o.acao)) erros.push(`nó "${id}" opção ${i + 1} com ação inválida "${o.acao}"`)
      if (!o.proximo && !o.acao) erros.push(`nó "${id}" opção ${i + 1} sem destino`)
    }
  }
  return erros
}

export function pontuarGatilhos(gatilhos: string[], entrada: string): number {
  const n = ' ' + normalizeText(entrada) + ' '
  let s = 0
  for (const g of gatilhos) {
    const gn = normalizeText(g)
    if (gn && n.includes(' ' + gn + ' ')) s += gn.split(' ').length
  }
  return s
}

export interface FaqLite {
  id: string
  pergunta: string
  resposta: string
  palavrasChave: string[]
}
export function rankFaq(faqs: FaqLite[], entrada: string, topN = 3): Array<{ faq: FaqLite; score: number }> {
  const q = new Set(tokens(entrada))
  if (!q.size) return []
  const r = faqs.map((f) => {
    const pt = new Set(tokens(f.pergunta))
    const kw = new Set(f.palavrasChave.flatMap((k) => tokens(k)))
    let s = 0
    for (const t of q) {
      if (pt.has(t)) s += 1
      if (kw.has(t)) s += 1.5
    }
    const norm = s / Math.sqrt(q.size)
    return { faq: f, score: Math.round(norm * 100) / 100 }
  })
  return r.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, topN)
}

export function verificarCpfPrefixo(cpf: string | null | undefined, entrada: string): boolean {
  const c = onlyDigits(cpf)
  const e = onlyDigits(entrada)
  return c.length >= 11 && e.length >= 4 && e.length <= 11 && c.startsWith(e)
}

const PALAVRAS_ALERTA = ['golpe', 'fraude', 'processo', 'procon', 'advogado', 'denuncia', 'reclame aqui', 'cancelar matricula', 'assedio', 'discriminacao']
export function triarTexto(texto: string): { spam: boolean; alerta?: string } {
  const n = normalizeText(texto)
  const spam = /(https?:\/\/\S+.*){2,}/i.test(texto) || /ganhe dinheiro|clique aqui|sorteio gratis|siga de volta|chame no privado/.test(n)
  const alerta = PALAVRAS_ALERTA.find((p) => n.includes(p))
  return { spam, alerta }
}

// ---------------------------------------------------------------- SLA
export function calcularSla(abertaEm: Date, cfg: { slaPrimeiraRespostaMin: number; slaResolucaoMin: number }) {
  return {
    primeiraRespostaEm: new Date(abertaEm.getTime() + cfg.slaPrimeiraRespostaMin * 60_000),
    resolucaoEm: new Date(abertaEm.getTime() + cfg.slaResolucaoMin * 60_000),
  }
}
export function statusSla(c: { slaPrimeiraRespostaEm?: Date | null; primeiraRespostaEm?: Date | null; slaResolucaoEm?: Date | null; status: string }, now: Date): 'OK' | 'ATENCAO' | 'ESTOURADO' | 'ENCERRADA' {
  if (c.status === 'RESOLVIDA' || c.status === 'ARQUIVADA') return 'ENCERRADA'
  const alvo = !c.primeiraRespostaEm && c.slaPrimeiraRespostaEm ? c.slaPrimeiraRespostaEm : c.slaResolucaoEm
  if (!alvo) return 'OK'
  const rest = alvo.getTime() - now.getTime()
  if (rest < 0) return 'ESTOURADO'
  if (rest < 15 * 60_000) return 'ATENCAO'
  return 'OK'
}

// ---------------------------------------------------------------- redes sociais
export const TRANSICOES_POST: Record<string, string[]> = {
  RASCUNHO: ['EM_APROVACAO', 'CANCELADO'],
  EM_APROVACAO: ['APROVADO', 'REJEITADO', 'RASCUNHO', 'CANCELADO'],
  REJEITADO: ['RASCUNHO', 'EM_APROVACAO', 'CANCELADO'],
  APROVADO: ['PUBLICADO', 'MANUAL', 'FALHA', 'RASCUNHO', 'CANCELADO'],
  FALHA: ['APROVADO', 'MANUAL', 'CANCELADO'],
  MANUAL: ['PUBLICADO', 'CANCELADO'],
  PUBLICADO: [],
  CANCELADO: [],
}
export function podeTransicionarPost(de: string, para: string): boolean {
  return (TRANSICOES_POST[de] ?? []).includes(para)
}
export const LIMITE_TEXTO_REDE: Record<string, number> = { INSTAGRAM: 2200, FACEBOOK: 63206, LINKEDIN: 3000, TIKTOK: 2200, YOUTUBE: 5000, X: 280 }
export function validarPostParaRede(rede: string, texto: string, midias: string[]): string[] {
  const erros: string[] = []
  const lim = LIMITE_TEXTO_REDE[rede]
  if (lim && texto.length > lim) erros.push(`Texto excede ${lim} caracteres do ${rede}.`)
  if ((rede === 'INSTAGRAM' || rede === 'TIKTOK' || rede === 'YOUTUBE') && midias.length === 0) erros.push(`${rede} exige ao menos uma mídia.`)
  return erros
}

// ---------------------------------------------------------------- voz (TwiML)
export function xmlEsc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
const VOZ = 'Polly.Camila'
export function twimlDizer(texto: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR" voice="${VOZ}">${xmlEsc(texto)}</Say></Response>`
}
export interface UraOpcao {
  digito: string
  rotulo: string
  acao: 'ENCAMINHAR' | 'MENSAGEM' | 'ATENDENTE'
  destino?: string
  mensagem?: string
}
export interface UraMenu {
  saudacao: string
  opcoes: UraOpcao[]
}
export function twimlUra(menu: UraMenu, actionUrl: string): string {
  const locucao = [menu.saudacao, ...menu.opcoes.map((o) => `Para ${o.rotulo}, tecle ${o.digito}.`)].join(' ')
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" timeout="6" action="${xmlEsc(actionUrl)}" method="POST"><Say language="pt-BR" voice="${VOZ}">${xmlEsc(locucao)}</Say></Gather><Say language="pt-BR" voice="${VOZ}">Não recebemos sua opção. Até logo.</Say><Hangup/></Response>`
}
export function twimlResposta(menu: UraMenu, digito: string, actionUrl: string): string {
  const op = menu.opcoes.find((o) => o.digito === digito)
  if (!op) return twimlUra({ ...menu, saudacao: 'Opção inválida.' }, actionUrl)
  if (op.acao === 'ENCAMINHAR' && op.destino) return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR" voice="${VOZ}">Transferindo sua ligação.</Say><Dial>${xmlEsc(op.destino)}</Dial></Response>`
  if (op.acao === 'MENSAGEM' && op.mensagem) return twimlDizer(op.mensagem + ' Obrigado por ligar.')
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR" voice="${VOZ}">Nenhum atendente disponível no momento. Deixe sua mensagem após o sinal.</Say><Record maxLength="60" playBeep="true"/></Response>`
}

// ---------------------------------------------------------------- assinaturas de webhook
export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  return A.length === B.length && crypto.timingSafeEqual(A, B)
}

// Twilio: base64(HMAC-SHA1(authToken, url + concat(sorted key+value))).
export function twilioSignature(authToken: string, url: string, params: Record<string, any>): string {
  const data = url + Object.keys(params).sort().map((k) => k + (Array.isArray(params[k]) ? params[k].join('') : params[k] ?? '')).join('')
  return crypto.createHmac('sha1', authToken).update(data).digest('base64')
}
export function verifyTwilio(authToken: string, url: string, params: Record<string, any>, header?: string): boolean {
  if (!authToken || !header) return false
  return safeEqual(twilioSignature(authToken, url, params), header)
}

// Meta (WhatsApp/Instagram/Facebook): X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(appSecret, rawBody).
export function metaSignature(appSecret: string, raw: Buffer | string): string {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
}
export function verifyMeta(appSecret: string, raw: Buffer | string | undefined, header?: string): boolean {
  if (!appSecret || !raw || !header) return false
  return safeEqual(metaSignature(appSecret, raw), header)
}

// Telegram: header X-Telegram-Bot-Api-Secret-Token igual ao segredo definido no setWebhook.
export function verifyTelegram(secret: string, header?: string): boolean {
  if (!secret || !header) return false
  return safeEqual(secret, header)
}

// Resend (Svix): assinatura "v1,<base64>" de HMAC-SHA256(secretBytes, `${id}.${ts}.${body}`).
export function svixSignature(secret: string, id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  return crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
}
export function verifySvix(secret: string, raw: Buffer | string | undefined, h: { id?: string; timestamp?: string; signature?: string }, now = Date.now(), toleranciaSeg = 300): boolean {
  if (!secret || !raw || !h.id || !h.timestamp || !h.signature) return false
  if (Math.abs(now / 1000 - Number(h.timestamp)) > toleranciaSeg) return false
  const esperado = svixSignature(secret, h.id, h.timestamp, raw.toString())
  return h.signature.split(' ').some((p) => {
    const [v, sig] = p.split(',')
    return v === 'v1' && !!sig && safeEqual(sig, esperado)
  })
}
