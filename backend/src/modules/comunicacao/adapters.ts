import { normalizePhone } from './pure'

// Adapters reais (fetch, sem SDKs): Telegram Bot API, WhatsApp Cloud API (Meta),
// Twilio REST (SMS, voz, WhatsApp), Resend (e-mail) e Meta Graph (Facebook/Instagram DM).
// Cada um expõe send(), teste de conexão e parse de inbound/status.

export interface SendInput {
  destino: string
  assunto?: string | null
  mensagem: string
  html?: string
  twiml?: string
  statusCallback?: string
}
export interface SendResult {
  ok: boolean
  provedorId?: string
  erro?: string
  retryable?: boolean
}
export interface InboundMsg {
  chaveExterna: string // chat id / telefone / e-mail / psid
  nome?: string
  texto: string
  externalId?: string
  telefone?: string
  email?: string
  assunto?: string
  midiaUrl?: string
}
export interface StatusUpdate {
  provedorId: string
  status: 'ENVIADA' | 'ENTREGUE' | 'LIDA' | 'FALHA'
  erro?: string
}

export type Cfg = Record<string, any>

const CAMPOS: Record<string, string[]> = {
  'TELEGRAM:TELEGRAM_BOT': ['botToken'],
  'WHATSAPP:META_CLOUD': ['accessToken', 'phoneNumberId'],
  'WHATSAPP:TWILIO': ['accountSid', 'authToken', 'from'],
  'SMS:TWILIO': ['accountSid', 'authToken', 'from'],
  'VOZ:TWILIO': ['accountSid', 'authToken', 'from'],
  'EMAIL:RESEND': ['apiKey', 'from'],
  'FACEBOOK:META_GRAPH': ['accessToken', 'pageId'],
  'INSTAGRAM:META_GRAPH': ['accessToken', 'igUserId'],
  'SITE_CHAT:PROPRIO': [],
}
export function camposObrigatorios(tipo: string, provedor: string): string[] | null {
  return CAMPOS[`${tipo}:${provedor}`] ?? null
}
export function provedoresDoTipo(tipo: string): string[] {
  return Object.keys(CAMPOS).filter((k) => k.startsWith(tipo + ':')).map((k) => k.split(':')[1])
}
export function faltandoCampos(tipo: string, provedor: string, cfg: Cfg | null): string[] {
  const req = camposObrigatorios(tipo, provedor)
  if (!req) return ['provedor inválido para o canal']
  return req.filter((c) => !cfg || !String(cfg[c] ?? '').trim())
}

async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; json: any; text: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await r.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* não-JSON */
    }
    return { status: r.status, json, text }
  } finally {
    clearTimeout(t)
  }
}
function retryableStatus(s: number) {
  return s === 429 || s >= 500
}
function netErr(e: any): SendResult {
  return { ok: false, erro: `Falha de rede/timeout: ${e?.name === 'AbortError' ? 'tempo esgotado' : e?.message || e}`, retryable: true }
}
const GRAPH = 'https://graph.facebook.com/v20.0'

// ---------------------------------------------------------------- Telegram
async function telegramCall(token: string, method: string, body?: any) {
  return http(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
}

// ---------------------------------------------------------------- envio
export async function sendVia(tipo: string, provedor: string, cfg: Cfg, i: SendInput): Promise<SendResult> {
  try {
    const key = `${tipo}:${provedor}`
    if (key === 'TELEGRAM:TELEGRAM_BOT') {
      const r = await telegramCall(cfg.botToken, 'sendMessage', { chat_id: i.destino, text: i.mensagem })
      if (r.json?.ok) return { ok: true, provedorId: String(r.json.result?.message_id) }
      return { ok: false, erro: `Telegram: ${r.json?.description || r.text.slice(0, 200)}`, retryable: retryableStatus(r.status) }
    }
    if (key === 'WHATSAPP:META_CLOUD') {
      const to = i.destino.replace(/\D/g, '')
      const r = await http(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: i.mensagem, preview_url: true } }),
      })
      if (r.status < 300 && r.json?.messages?.[0]?.id) return { ok: true, provedorId: r.json.messages[0].id }
      const code = r.json?.error?.code
      const msg = r.json?.error?.message || r.text.slice(0, 200)
      if (code === 131047 || code === 131026) return { ok: false, erro: `WhatsApp: fora da janela de 24h ou número sem WhatsApp (${msg}). Inicie a conversa com um template HSM aprovado pela Meta.`, retryable: false }
      return { ok: false, erro: `WhatsApp Cloud: ${msg}`, retryable: retryableStatus(r.status) }
    }
    if (provedor === 'TWILIO') return await twilioSend(tipo, cfg, i)
    if (key === 'EMAIL:RESEND') {
      const body: any = { from: cfg.from, to: [i.destino], subject: i.assunto || '(sem assunto)' }
      if (i.html) body.html = i.html
      else body.text = i.mensagem
      if (cfg.replyTo) body.reply_to = cfg.replyTo
      const r = await http('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status < 300 && r.json?.id) return { ok: true, provedorId: r.json.id }
      return { ok: false, erro: `Resend: ${r.json?.message || r.text.slice(0, 200)}`, retryable: retryableStatus(r.status) }
    }
    if (key === 'FACEBOOK:META_GRAPH' || key === 'INSTAGRAM:META_GRAPH') {
      const owner = tipo === 'FACEBOOK' ? cfg.pageId : cfg.igUserId
      const r = await http(`${GRAPH}/${owner}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ recipient: { id: i.destino }, messaging_type: 'RESPONSE', message: { text: i.mensagem } }),
      })
      if (r.status < 300 && r.json?.message_id) return { ok: true, provedorId: r.json.message_id }
      return { ok: false, erro: `Meta Graph: ${r.json?.error?.message || r.text.slice(0, 200)}`, retryable: retryableStatus(r.status) }
    }
    if (tipo === 'SITE_CHAT') return { ok: true, provedorId: 'site-chat' } // entregue ao widget por polling da conversa
    return { ok: false, erro: `Canal ${tipo}/${provedor} não suporta envio.`, retryable: false }
  } catch (e) {
    return netErr(e)
  }
}

function twilioAuth(cfg: Cfg) {
  return 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')
}
async function twilioSend(tipo: string, cfg: Cfg, i: SendInput): Promise<SendResult> {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}`
  const to = normalizePhone(i.destino) ?? i.destino
  const form = new URLSearchParams()
  let url: string
  if (tipo === 'VOZ') {
    url = `${base}/Calls.json`
    form.set('To', to)
    form.set('From', cfg.from)
    form.set('Twiml', i.twiml || `<Response><Say language="pt-BR" voice="Polly.Camila">${i.mensagem.replace(/[<>&]/g, ' ')}</Say></Response>`)
    if (i.statusCallback) {
      form.set('StatusCallback', i.statusCallback)
      form.append('StatusCallbackEvent', 'completed')
    }
  } else {
    url = `${base}/Messages.json`
    const wa = tipo === 'WHATSAPP'
    form.set('To', wa ? `whatsapp:${to}` : to)
    if (cfg.messagingServiceSid && !wa) form.set('MessagingServiceSid', cfg.messagingServiceSid)
    else form.set('From', wa && !String(cfg.from).startsWith('whatsapp:') ? `whatsapp:${cfg.from}` : cfg.from)
    form.set('Body', i.mensagem)
    if (i.statusCallback) form.set('StatusCallback', i.statusCallback)
  }
  const r = await http(url, { method: 'POST', headers: { authorization: twilioAuth(cfg), 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() })
  if (r.status < 300 && r.json?.sid) return { ok: true, provedorId: r.json.sid }
  return { ok: false, erro: `Twilio: ${r.json?.message || r.text.slice(0, 200)}${r.json?.code ? ` (código ${r.json.code})` : ''}`, retryable: retryableStatus(r.status) }
}

// ---------------------------------------------------------------- teste de conexão
export async function testarConexao(tipo: string, provedor: string, cfg: Cfg): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const key = `${tipo}:${provedor}`
    if (key === 'TELEGRAM:TELEGRAM_BOT') {
      const r = await http(`https://api.telegram.org/bot${cfg.botToken}/getMe`)
      return r.json?.ok ? { ok: true, mensagem: `Bot @${r.json.result.username} conectado.` } : { ok: false, mensagem: `Telegram recusou o token: ${r.json?.description || r.status}` }
    }
    if (key === 'WHATSAPP:META_CLOUD') {
      const r = await http(`${GRAPH}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${cfg.accessToken}` } })
      return r.status < 300 ? { ok: true, mensagem: `Número ${r.json?.display_phone_number} (${r.json?.verified_name || 'sem nome verificado'}).` } : { ok: false, mensagem: `Meta: ${r.json?.error?.message || r.status}` }
    }
    if (provedor === 'TWILIO') {
      const r = await http(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}.json`, { headers: { authorization: twilioAuth(cfg) } })
      return r.status < 300 ? { ok: true, mensagem: `Conta Twilio "${r.json?.friendly_name}" (${r.json?.status}).` } : { ok: false, mensagem: `Twilio: ${r.json?.message || r.status}` }
    }
    if (key === 'EMAIL:RESEND') {
      const r = await http('https://api.resend.com/domains', { headers: { authorization: `Bearer ${cfg.apiKey}` } })
      if (r.status >= 300) return { ok: false, mensagem: `Resend: ${r.json?.message || r.status}` }
      const verificados = (r.json?.data ?? []).filter((d: any) => d.status === 'verified').length
      return { ok: true, mensagem: `Chave válida; ${verificados} domínio(s) verificado(s).` }
    }
    if (key === 'FACEBOOK:META_GRAPH' || key === 'INSTAGRAM:META_GRAPH') {
      const id = tipo === 'FACEBOOK' ? cfg.pageId : cfg.igUserId
      const r = await http(`${GRAPH}/${id}?fields=id,name,username`, { headers: { authorization: `Bearer ${cfg.accessToken}` } })
      return r.status < 300 ? { ok: true, mensagem: `Conectado a ${r.json?.name || r.json?.username || r.json?.id}.` } : { ok: false, mensagem: `Meta: ${r.json?.error?.message || r.status}` }
    }
    if (tipo === 'SITE_CHAT') return { ok: true, mensagem: 'Chat do site não depende de provedor externo.' }
    return { ok: false, mensagem: 'Provedor não suportado.' }
  } catch (e: any) {
    return { ok: false, mensagem: `Falha de rede: ${e?.message || e}` }
  }
}

export async function telegramSetWebhook(botToken: string, url: string, secret: string) {
  const r = await telegramCall(botToken, 'setWebhook', { url, secret_token: secret, allowed_updates: ['message'] })
  return r.json?.ok ? { ok: true, mensagem: 'Webhook do Telegram registrado.' } : { ok: false, mensagem: r.json?.description || `HTTP ${r.status}` }
}

// ---------------------------------------------------------------- parse inbound
export function parseTelegram(update: any): InboundMsg | null {
  const m = update?.message
  if (!m || !m.chat) return null
  const texto = m.text || m.caption || (m.photo ? '[foto]' : m.document ? '[documento]' : m.voice ? '[áudio]' : '')
  if (!texto) return null
  const nome = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.chat.title || m.from?.username
  return { chaveExterna: String(m.chat.id), nome, texto, externalId: String(m.message_id), telefone: m.contact?.phone_number }
}

export function parseWhatsAppMeta(body: any): { mensagens: InboundMsg[]; status: StatusUpdate[] } {
  const mensagens: InboundMsg[] = []
  const status: StatusUpdate[] = []
  for (const e of body?.entry ?? []) {
    for (const ch of e.changes ?? []) {
      const v = ch.value
      if (!v) continue
      const nomes: Record<string, string> = {}
      for (const c of v.contacts ?? []) nomes[c.wa_id] = c.profile?.name
      for (const m of v.messages ?? []) {
        const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.caption ?? `[${m.type}]`
        mensagens.push({ chaveExterna: m.from, telefone: normalizePhone(m.from) ?? undefined, nome: nomes[m.from], texto, externalId: m.id })
      }
      for (const s of v.statuses ?? []) {
        const st = s.status === 'delivered' ? 'ENTREGUE' : s.status === 'read' ? 'LIDA' : s.status === 'failed' ? 'FALHA' : s.status === 'sent' ? 'ENVIADA' : null
        if (st) status.push({ provedorId: s.id, status: st, erro: s.errors?.[0]?.title })
      }
    }
  }
  return { mensagens, status }
}

// Facebook Messenger / Instagram DM (objeto "page" ou "instagram").
export function parseMetaMessaging(body: any): InboundMsg[] {
  const out: InboundMsg[] = []
  for (const e of body?.entry ?? []) {
    for (const m of e.messaging ?? []) {
      if (!m.message || m.message.is_echo || !m.sender?.id) continue
      const texto = m.message.text || (m.message.attachments?.length ? `[${m.message.attachments[0].type}]` : '')
      if (texto) out.push({ chaveExterna: String(m.sender.id), texto, externalId: m.message.mid })
    }
  }
  return out
}

export function parseTwilioInbound(p: Record<string, any>): InboundMsg | null {
  if (!p.From || (p.Body === undefined && !p.NumMedia)) return null
  const raw = String(p.From).replace(/^whatsapp:/, '')
  return { chaveExterna: raw, telefone: normalizePhone(raw) ?? undefined, nome: p.ProfileName, texto: p.Body || '[mídia]', externalId: p.MessageSid, midiaUrl: p.MediaUrl0 }
}
export function parseTwilioStatus(p: Record<string, any>): StatusUpdate | null {
  const sid = p.MessageSid || p.SmsSid
  const s = String(p.MessageStatus || p.SmsStatus || '').toLowerCase()
  if (!sid) return null
  const st = s === 'delivered' ? 'ENTREGUE' : s === 'read' ? 'LIDA' : s === 'failed' || s === 'undelivered' ? 'FALHA' : s === 'sent' || s === 'queued' || s === 'sending' ? 'ENVIADA' : null
  return st ? { provedorId: sid, status: st, erro: st === 'FALHA' ? `Twilio ${p.ErrorCode || ''} ${s}`.trim() : undefined } : null
}

export function parseResend(body: any): { mensagem?: InboundMsg; status?: StatusUpdate } {
  const t = String(body?.type || '')
  const d = body?.data ?? {}
  if (t === 'email.received') {
    const from = String(d.from || '')
    const m = /<([^>]+)>/.exec(from)
    const email = (m ? m[1] : from).trim().toLowerCase()
    return { mensagem: { chaveExterna: email, email, nome: m ? from.replace(/<.*>/, '').trim().replace(/^"|"$/g, '') : undefined, assunto: d.subject, texto: d.text || d.html?.replace(/<[^>]+>/g, ' ') || `(e-mail "${d.subject ?? ''}" recebido sem corpo no webhook)`, externalId: d.email_id || d.message_id } }
  }
  const map: Record<string, StatusUpdate['status']> = { 'email.sent': 'ENVIADA', 'email.delivered': 'ENTREGUE', 'email.opened': 'LIDA', 'email.bounced': 'FALHA', 'email.complained': 'FALHA', 'email.failed': 'FALHA' }
  if (map[t] && d.email_id) return { status: { provedorId: d.email_id, status: map[t], erro: map[t] === 'FALHA' ? `Resend: ${t}` : undefined } }
  return {}
}

// ---------------------------------------------------------------- Graph API (redes sociais)
export interface GraphResult {
  ok: boolean
  id?: string
  erro?: string
  retryable?: boolean
  dados?: any
}
async function graph(path: string, token: string, method: 'GET' | 'POST', params: Record<string, string> = {}): Promise<GraphResult> {
  try {
    const qs = new URLSearchParams(params).toString()
    const r = await http(`${GRAPH}/${path}${method === 'GET' && qs ? '?' + qs : ''}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? qs : undefined,
    })
    if (r.status < 300) return { ok: true, id: r.json?.id ?? r.json?.post_id, dados: r.json }
    return { ok: false, erro: `Graph API: ${r.json?.error?.message || r.text.slice(0, 200)}`, retryable: retryableStatus(r.status) }
  } catch (e: any) {
    return { ok: false, erro: `Falha de rede: ${e?.message || e}`, retryable: true }
  }
}

export async function publicarGraph(rede: string, externalId: string, token: string, texto: string, midias: string[]): Promise<GraphResult> {
  if (rede === 'FACEBOOK') {
    if (midias.length) return graph(`${externalId}/photos`, token, 'POST', { url: midias[0], caption: texto })
    return graph(`${externalId}/feed`, token, 'POST', { message: texto })
  }
  if (rede === 'INSTAGRAM') {
    if (!midias.length) return { ok: false, erro: 'Instagram exige mídia.', retryable: false }
    const c = await graph(`${externalId}/media`, token, 'POST', { image_url: midias[0], caption: texto })
    if (!c.ok || !c.id) return c
    return graph(`${externalId}/media_publish`, token, 'POST', { creation_id: c.id })
  }
  return { ok: false, erro: `Publicação automática não suportada para ${rede}.`, retryable: false }
}

export async function metricasPostGraph(rede: string, postId: string, token: string) {
  const fields = rede === 'FACEBOOK' ? 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares' : 'like_count,comments_count'
  const r = await graph(postId, token, 'GET', { fields })
  if (!r.ok) return r
  const d = r.dados ?? {}
  return { ok: true, dados: rede === 'FACEBOOK' ? { curtidas: d.likes?.summary?.total_count ?? 0, comentarios: d.comments?.summary?.total_count ?? 0, compartilhamentos: d.shares?.count ?? 0 } : { curtidas: d.like_count ?? 0, comentarios: d.comments_count ?? 0, compartilhamentos: 0 } } as GraphResult
}
export async function seguidoresGraph(rede: string, externalId: string, token: string) {
  const r = await graph(externalId, token, 'GET', { fields: rede === 'FACEBOOK' ? 'followers_count,fan_count' : 'followers_count' })
  return r.ok ? ((r.dados?.followers_count ?? r.dados?.fan_count) as number | undefined) : undefined
}
export async function comentariosGraph(rede: string, postId: string, token: string) {
  const r = await graph(`${postId}/comments`, token, 'GET', { fields: rede === 'FACEBOOK' ? 'id,message,from' : 'id,text,username', limit: '50' })
  if (!r.ok) return r
  const itens = (r.dados?.data ?? []).map((c: any) => ({ externalId: c.id, texto: c.message ?? c.text ?? '', autor: c.from?.name ?? c.username }))
  return { ok: true, dados: itens } as GraphResult
}
export async function ocultarComentarioGraph(rede: string, commentId: string, token: string, ocultar: boolean) {
  return graph(commentId, token, 'POST', rede === 'FACEBOOK' ? { is_hidden: String(ocultar) } : { hide: String(ocultar) })
}
export async function responderComentarioGraph(rede: string, commentId: string, token: string, texto: string) {
  return graph(`${commentId}/${rede === 'FACEBOOK' ? 'comments' : 'replies'}`, token, 'POST', { message: texto })
}
