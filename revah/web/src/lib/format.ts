import type { Channel } from './types'

export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  TELEGRAM: 'Telegram',
  EMAIL: 'E-mail',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  VOICE: 'Voz',
}

export const CAMPAIGN_CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'TELEGRAM', 'EMAIL', 'VOICE']
export const ALL_CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'TELEGRAM', 'EMAIL', 'INSTAGRAM', 'MESSENGER', 'VOICE']

export const PLAN_LABEL: Record<string, string> = { TRIAL: 'Teste grátis', START: 'Start', PRO: 'Pro', ENTERPRISE: 'Enterprise' }

export const TENANT_STATUS_LABEL: Record<string, string> = {
  TRIAL: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
  SUSPENDED: 'Suspensa',
}

export const ROLE_LABEL: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', AGENT: 'Atendente' }

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'gray' },
  SCHEDULED: { label: 'Agendada', tone: 'blue' },
  RUNNING: { label: 'Enviando', tone: 'indigo' },
  PAUSED: { label: 'Pausada', tone: 'amber' },
  COMPLETED: { label: 'Concluída', tone: 'green' },
  CANCELED: { label: 'Cancelada', tone: 'red' },
}

export const RECIPIENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Na fila', tone: 'gray' },
  SENT: { label: 'Enviado', tone: 'green' },
  FAILED: { label: 'Falhou', tone: 'red' },
  SKIPPED_SUPPRESSED: { label: 'Bloqueado (opt-out)', tone: 'amber' },
  SKIPPED_INVALID: { label: 'Inválido', tone: 'amber' },
}

export const CONVERSATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  BOT: { label: 'Bot', tone: 'indigo' },
  HUMAN: { label: 'Humano', tone: 'amber' },
  CLOSED: { label: 'Encerrada', tone: 'gray' },
}

export const MESSAGE_STATUS: Record<string, string> = {
  QUEUED: 'na fila',
  SENT: 'enviada',
  DELIVERED: 'entregue',
  READ: 'lida',
  FAILED: 'falhou',
  RECEIVED: 'recebida',
  SIMULATED: 'simulada',
  BLOCKED: 'bloqueada',
}

export const CALL_STATUS: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Na fila', tone: 'gray' },
  RINGING: { label: 'Chamando', tone: 'blue' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'indigo' },
  COMPLETED: { label: 'Concluída', tone: 'green' },
  NO_ANSWER: { label: 'Não atendeu', tone: 'amber' },
  BUSY: { label: 'Ocupado', tone: 'amber' },
  FAILED: { label: 'Falhou', tone: 'red' },
  CANCELED: { label: 'Cancelada', tone: 'gray' },
  TRANSFERRED: { label: 'Transferida', tone: 'blue' },
  BLOCKED: { label: 'Bloqueada', tone: 'red' },
}

export const CALL_OUTCOME: Record<string, string> = {
  CONFIRMED: 'Confirmou',
  RESCHEDULE: 'Quer remarcar',
  NOT_INTERESTED: 'Sem interesse',
  OPT_OUT: 'Pediu para não ligar',
  CALLBACK_REQUESTED: 'Pediu retorno',
  PROMISE_TO_PAY: 'Promessa de pagamento',
  INFORMED: 'Informado',
  TRANSFERRED: 'Transferido',
  NO_ANSWER: 'Não atendeu',
  VOICEMAIL: 'Caixa postal',
  OTHER: 'Outro',
  PENDENTE: 'Pendente',
}

export const SUPPRESSION_REASON: Record<string, string> = {
  KEYWORD: 'Palavra-chave (SAIR)',
  VERBAL: 'Pedido verbal',
  DTMF: 'Tecla na ligação',
  MANUAL: 'Manual',
  UNSUBSCRIBE_LINK: 'Link de descadastro',
  BOUNCE: 'E-mail devolvido',
  IMPORT: 'Importação',
  INTEGRATION: 'Integração',
}

export const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  IMPORT: 'Importação',
  INBOUND: 'Mensagem recebida',
  CAMPAIGN: 'Campanha',
  LEADS: 'Leads',
  DENTALPOS: 'DentalPos One',
  API: 'API',
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export type Tone = 'gray' | 'indigo' | 'green' | 'red' | 'amber' | 'blue'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function fmtDate(v?: string | null) {
  return v ? dateFmt.format(new Date(v)) : '—'
}

export function fmtDateTime(v?: string | null) {
  return v ? dateTimeFmt.format(new Date(v)) : '—'
}

// Hora para hoje, data+hora para outros dias.
export function fmtRelative(v?: string | null) {
  if (!v) return ''
  const d = new Date(v)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeFmt.format(d)
  return dateTimeFmt.format(d)
}

export function fmtNumber(n?: number | null) {
  return typeof n === 'number' ? n.toLocaleString('pt-BR') : '—'
}

export function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// 5544999999999 → +55 (44) 99999-9999
export function fmtPhone(v?: string | null) {
  if (!v) return ''
  const d = v.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4)
    const rest = d.slice(4)
    const a = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4)
    const b = rest.slice(a.length)
    return `+55 (${ddd}) ${a}-${b}`
  }
  return d.length > 6 ? `+${d}` : v
}

export function fmtDuration(sec?: number | null) {
  if (!sec && sec !== 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}min ${String(s).padStart(2, '0')}s`
}

// Mesma regra da API (normalizePhone): aceita formatos brasileiros comuns.
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (d.startsWith('55')) {
    if (d.length !== 12 && d.length !== 13) return null
    const ddd = Number(d.slice(2, 4))
    if (ddd < 11 || ddd > 99) return null
    return d
  }
  return d.length >= 8 && d.length <= 15 ? d : null
}

export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null
}

export function validateDestination(channel: Channel, raw: string): string | null {
  if (channel === 'EMAIL') return normalizeEmail(raw)
  if (channel === 'TELEGRAM') {
    const v = raw.trim()
    return v ? v : null
  }
  return normalizePhone(raw)
}

export function destinationHint(channel: Channel) {
  if (channel === 'EMAIL') return 'Um e-mail por linha. Opcional: "Nome; email@exemplo.com".'
  if (channel === 'TELEGRAM') return 'Um chat ID do Telegram por linha (o contato precisa ter iniciado conversa com o bot).'
  return 'Um telefone por linha, com DDD. Opcional: "Nome; (44) 99999-9999".'
}

export function initials(name?: string | null) {
  const parts = (name || '?').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

// Pré-visualização das variáveis {{nome}}, {{primeiro_nome}}, {{empresa}}.
export function renderPreview(tpl: string, vars: { nome: string; empresa: string }) {
  const primeiro = vars.nome.split(/\s+/)[0] || ''
  return tpl
    .replace(/\{\{\s*nome\s*\}\}/gi, vars.nome)
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, primeiro)
    .replace(/\{\{\s*empresa\s*\}\}/gi, vars.empresa)
}

export function contactAddress(c: { phone: string | null; email: string | null; telegramChatId?: string | null; instagramId?: string | null; messengerId?: string | null }, channel: Channel): string | null {
  switch (channel) {
    case 'WHATSAPP':
    case 'SMS':
    case 'VOICE':
      return c.phone
    case 'EMAIL':
      return c.email
    case 'TELEGRAM':
      return c.telegramChatId || null
    case 'INSTAGRAM':
      return c.instagramId || null
    case 'MESSENGER':
      return c.messengerId || null
  }
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
