import { config } from '../../config'
import { httpJson, ProviderError, type ProviderAdapter, type SendInput } from './types'

function need(creds: Record<string, any>, ...keys: string[]) {
  const missing = keys.filter((k) => !creds[k])
  if (missing.length) throw new ProviderError(`Credenciais incompletas: ${missing.join(', ')}.`)
}

function graph(creds: Record<string, any>) {
  return `https://graph.facebook.com/${creds.apiVersion || config.meta.graphVersion}`
}

// WhatsApp — Meta Cloud API (oficial).
const metaCloud: ProviderAdapter = {
  async send({ creds, to, text, template }: SendInput) {
    need(creds, 'phoneNumberId', 'accessToken')
    const body: any = template?.name
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language || 'pt_BR' },
            ...(template.params?.length
              ? { components: [{ type: 'body', parameters: template.params.map((t) => ({ type: 'text', text: t })) }] }
              : {}),
          },
        }
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: text } }
    const d = await httpJson(`${graph(creds)}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { simulated: false, providerMessageId: d?.messages?.[0]?.id, raw: d }
  },
  async connect(_a, creds) {
    need(creds, 'phoneNumberId', 'accessToken')
    const d = await httpJson(`${graph(creds)}/${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    })
    return { ok: true, info: `${d.verified_name || ''} ${d.display_phone_number || ''} (qualidade: ${d.quality_rating || 'n/d'})`.trim() }
  },
}

// WhatsApp — Z-API (não oficial; risco de banimento do número).
const zapi: ProviderAdapter = {
  async send({ creds, to, text }) {
    need(creds, 'instanceId', 'token')
    const base = creds.baseUrl || 'https://api.z-api.io'
    const d = await httpJson(`${base}/instances/${creds.instanceId}/token/${creds.token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(creds.clientToken ? { 'Client-Token': String(creds.clientToken) } : {}) },
      body: JSON.stringify({ phone: to, message: text }),
    })
    return { simulated: false, providerMessageId: d?.messageId || d?.zaapId || d?.id, raw: d }
  },
  async connect(_a, creds) {
    need(creds, 'instanceId', 'token')
    const base = creds.baseUrl || 'https://api.z-api.io'
    const d = await httpJson(`${base}/instances/${creds.instanceId}/token/${creds.token}/status`, {
      headers: creds.clientToken ? { 'Client-Token': String(creds.clientToken) } : {},
    })
    return { ok: Boolean(d?.connected), info: d?.connected ? 'Instância conectada.' : 'Instância desconectada: leia o QR Code no painel do provedor.' }
  },
}

// WhatsApp — Zapiô (não oficial). Endpoint e campos configuráveis porque variam por conta/versão.
const zapio: ProviderAdapter = {
  async send({ creds, to, text }) {
    need(creds, 'baseUrl', 'token')
    const path = creds.sendPath || '/messages/send-text'
    const phoneField = creds.phoneField || 'phone'
    const textField = creds.textField || 'message'
    const d = await httpJson(`${String(creds.baseUrl).replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.token}` },
      body: JSON.stringify({ [phoneField]: to, [textField]: text, ...(creds.instanceId ? { instanceId: creds.instanceId } : {}) }),
    })
    return { simulated: false, providerMessageId: d?.messageId || d?.id || d?.key?.id, raw: d }
  },
  async connect(_a, creds) {
    need(creds, 'baseUrl', 'token')
    return { ok: true, info: 'Credenciais salvas. Envie um teste para confirmar a conexão.' }
  },
}

function twilioAuth(creds: Record<string, any>) {
  return `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`
}

// SMS — Twilio Messaging.
const twilioSms: ProviderAdapter = {
  async send({ account, creds, to, text }) {
    need(creds, 'accountSid', 'authToken')
    const params = new URLSearchParams({
      To: `+${to}`,
      Body: text,
      StatusCallback: `${config.publicApiUrl}/webhooks/twilio/sms/${account.id}/status`,
    })
    if (creds.messagingServiceSid) params.set('MessagingServiceSid', creds.messagingServiceSid)
    else params.set('From', account.address.startsWith('+') ? account.address : `+${account.address}`)
    const d = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: twilioAuth(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
    return { simulated: false, providerMessageId: d.sid, raw: d }
  },
  async connect(_a, creds) {
    need(creds, 'accountSid', 'authToken')
    const d = await httpJson(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}.json`, { headers: { Authorization: twilioAuth(creds) } })
    return { ok: d.status === 'active', info: `Conta Twilio: ${d.friendly_name} (${d.status})` }
  },
}

// Telegram Bot API.
const telegram: ProviderAdapter = {
  async send({ creds, to, text }) {
    need(creds, 'botToken')
    const d = await httpJson(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: to, text }),
    })
    return { simulated: false, providerMessageId: String(d?.result?.message_id ?? ''), raw: d }
  },
  async connect(account, creds) {
    need(creds, 'botToken')
    const me = await httpJson(`https://api.telegram.org/bot${creds.botToken}/getMe`)
    await httpJson(`https://api.telegram.org/bot${creds.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${config.publicApiUrl}/webhooks/telegram/${account.id}`,
        secret_token: account.webhookSecret,
        allowed_updates: ['message'],
      }),
    })
    return { ok: true, info: `Bot @${me?.result?.username} conectado.` }
  },
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// E-mail — Resend. Sempre inclui link de descadastro.
const resend: ProviderAdapter = {
  async send({ account, creds, to, text, subject, unsubscribeUrl }) {
    need(creds, 'apiKey')
    const footer = unsubscribeUrl
      ? `<p style="font-size:12px;color:#888;margin-top:24px">Não quer mais receber estes e-mails? <a href="${unsubscribeUrl}">Descadastrar</a>.</p>`
      : ''
    const d = await httpJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: creds.from || account.address,
        to: [to],
        subject: subject || creds.defaultSubject || account.label,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>${footer}`,
        text: unsubscribeUrl ? `${text}\n\nDescadastrar: ${unsubscribeUrl}` : text,
        ...(unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
        ...(creds.replyTo ? { reply_to: creds.replyTo } : {}),
      }),
    })
    return { simulated: false, providerMessageId: d.id, raw: d }
  },
  async connect(_a, creds) {
    need(creds, 'apiKey')
    await httpJson('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${creds.apiKey}` } })
    return { ok: true, info: 'Chave Resend válida.' }
  },
}

// Instagram Direct e Messenger — Graph API (Send API). Só responde quem iniciou a conversa (janela de 24h).
const metaGraph: ProviderAdapter = {
  async send({ account, creds, to, text }) {
    need(creds, 'pageAccessToken')
    const node = account.externalId || 'me'
    const d = await httpJson(`${graph(creds)}/${node}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.pageAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: to }, messaging_type: 'RESPONSE', message: { text } }),
    })
    return { simulated: false, providerMessageId: d?.message_id, raw: d }
  },
  async connect(account, creds) {
    need(creds, 'pageAccessToken')
    const node = account.externalId || 'me'
    const d = await httpJson(`${graph(creds)}/${node}?fields=id,name,username`, { headers: { Authorization: `Bearer ${creds.pageAccessToken}` } })
    return { ok: true, info: `Conta conectada: ${d.name || d.username || d.id}` }
  },
}

// Voz: o envio é uma ligação, tratada em services/voice. Aqui só valida credenciais.
const twilioVoice: ProviderAdapter = {
  async send() {
    throw new ProviderError('Use o fluxo de ligações para o canal de voz.')
  },
  connect: twilioSms.connect,
}

export const PROVIDERS: Record<string, { channels: string[]; adapter: ProviderAdapter; official: boolean; label: string }> = {
  META_CLOUD: { channels: ['WHATSAPP'], adapter: metaCloud, official: true, label: 'WhatsApp — API oficial da Meta' },
  ZAPI: { channels: ['WHATSAPP'], adapter: zapi, official: false, label: 'WhatsApp — Z-API (não oficial)' },
  ZAPIO: { channels: ['WHATSAPP'], adapter: zapio, official: false, label: 'WhatsApp — Zapiô (não oficial)' },
  TWILIO: { channels: ['SMS', 'VOICE'], adapter: twilioSms, official: true, label: 'Twilio' },
  TELEGRAM: { channels: ['TELEGRAM'], adapter: telegram, official: true, label: 'Telegram Bot API' },
  RESEND: { channels: ['EMAIL'], adapter: resend, official: true, label: 'Resend (e-mail)' },
  META_GRAPH: { channels: ['INSTAGRAM', 'MESSENGER'], adapter: metaGraph, official: true, label: 'Meta Graph API' },
}

export function adapterFor(provider: string, channel: string): ProviderAdapter {
  if (provider === 'TWILIO' && channel === 'VOICE') return twilioVoice
  const p = PROVIDERS[provider]
  if (!p || !p.channels.includes(channel)) throw new ProviderError(`Provedor ${provider} não atende o canal ${channel}.`)
  return p.adapter
}

export const UNOFFICIAL_WHATSAPP_WARNING =
  'Z-API e Zapiô não são APIs oficiais do WhatsApp. Eles automatizam um número comum, fora dos Termos de Serviço do WhatsApp/Meta para uso comercial em massa. ' +
  'Há risco real de o número ser bloqueado ou banido pela Meta, sem aviso. Para volume e confiabilidade, use a API oficial da Meta.'
