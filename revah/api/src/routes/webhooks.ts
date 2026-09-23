import { Router, type Request, type Response } from 'express'
import type { ChannelAccount } from '@prisma/client'
import { config, isProduction } from '../config'
import { prisma } from '../lib/prisma'
import { decryptJson, hmacHex, safeEqual } from '../lib/crypto'
import { ah } from '../lib/errors'
import { normalizeEmail, normalizePhone, type Channel } from '../lib/normalize'
import type { AuthedRequest } from '../middleware/auth'
import { constructStripeEvent, handleStripeEvent } from '../services/billing'
import { upsertContact } from '../services/contacts'
import { emitEvent } from '../services/automations'
import { handleInbound } from '../services/inbound'
import { ingestAdLead } from '../services/leads'
import { fetchAdLead } from '../services/leads/providers'
import { updateDeliveryStatus } from '../services/messaging'
import { answerTwiml, handleRecordingCallback, handleStatusCallback, startInboundCall, turnTwiml } from '../services/voice/engine'
import { TwiML, validTwilioRequest } from '../services/voice/twilio'

const r = Router()

async function loadAccount(id: string) {
  const account = await prisma.channelAccount.findUnique({ where: { id }, include: { tenant: true } })
  if (!account || !account.isActive) return null
  return account
}

function creds(a: ChannelAccount) {
  return decryptJson<Record<string, any>>(a.encryptedCredentials) || {}
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
r.post(
  '/stripe',
  ah(async (req: AuthedRequest, res) => {
    const event = constructStripeEvent(req.rawBody || Buffer.from(''), req.headers['stripe-signature'] as string)
    const status = await handleStripeEvent(event)
    res.json({ received: true, status })
  }),
)

// ---------------------------------------------------------------------------
// Meta: WhatsApp Cloud API, Instagram Direct, Messenger, Lead Ads
// ---------------------------------------------------------------------------
r.get('/meta', (req, res) => {
  const mode = req.query['hub.mode']
  const token = String(req.query['hub.verify_token'] || '')
  if (mode === 'subscribe' && config.meta.verifyToken && safeEqual(token, config.meta.verifyToken)) return res.status(200).send(String(req.query['hub.challenge'] || ''))
  res.sendStatus(403)
})

function validMetaSignature(req: AuthedRequest, secrets: string[]) {
  const sig = String(req.headers['x-hub-signature-256'] || '')
  if (!secrets.length) return !isProduction
  if (!sig.startsWith('sha256=') || !req.rawBody) return false
  return secrets.some((s) => safeEqual(`sha256=${hmacHex(s, req.rawBody!)}`, sig))
}

function waText(m: any): string {
  switch (m.type) {
    case 'text':
      return m.text?.body || ''
    case 'button':
      return m.button?.text || ''
    case 'interactive':
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
    case 'image':
    case 'video':
    case 'document':
      return m[m.type]?.caption || `[${m.type}]`
    default:
      return `[${m.type}]`
  }
}

const WA_STATUS: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' }

r.post(
  '/meta',
  ah(async (req: AuthedRequest, res) => {
    const body = req.body || {}
    const tasks: (() => Promise<unknown>)[] = []
    const secrets = new Set<string>(config.meta.appSecret ? [config.meta.appSecret] : [])

    for (const entry of body.entry || []) {
      // WhatsApp Cloud API
      if (body.object === 'whatsapp_business_account') {
        for (const change of entry.changes || []) {
          const v = change.value || {}
          const phoneNumberId = v.metadata?.phone_number_id
          if (!phoneNumberId) continue
          const account = await prisma.channelAccount.findFirst({ where: { provider: 'META_CLOUD', externalId: String(phoneNumberId), isActive: true }, include: { tenant: true } })
          if (!account) continue
          const c = creds(account)
          if (c.appSecret) secrets.add(c.appSecret)
          for (const m of v.messages || []) {
            const name = (v.contacts || []).find((x: any) => x.wa_id === m.from)?.profile?.name
            const address = normalizePhone(m.from) || m.from
            tasks.push(() => handleInbound({ tenant: account.tenant, account, channel: 'WHATSAPP', address, name, text: waText(m), providerMessageId: m.id, metadata: { type: m.type } }))
          }
          for (const s of v.statuses || []) {
            const st = WA_STATUS[s.status]
            if (st) tasks.push(() => updateDeliveryStatus(s.id, st, s.errors?.[0]?.title || s.errors?.[0]?.message))
          }
        }
      }
      // Messenger (object=page) e Instagram (object=instagram)
      if (body.object === 'page' || body.object === 'instagram') {
        const channel: Channel = body.object === 'page' ? 'MESSENGER' : 'INSTAGRAM'
        const account = await prisma.channelAccount.findFirst({ where: { provider: 'META_GRAPH', externalId: String(entry.id), isActive: true }, include: { tenant: true } })
        if (account) {
          const c = creds(account)
          if (c.appSecret) secrets.add(c.appSecret)
          for (const ev of entry.messaging || []) {
            if (!ev.message || ev.message.is_echo) continue
            const text = ev.message.text || (ev.message.attachments?.length ? `[${ev.message.attachments[0].type}]` : '')
            tasks.push(() => handleInbound({ tenant: account.tenant, account, channel: account.channel as Channel, address: String(ev.sender.id), text, providerMessageId: ev.message.mid }))
          }
          // Lead Ads (formulários de anúncios da própria empresa)
          for (const change of entry.changes || []) {
            if (change.field !== 'leadgen' || !change.value?.leadgen_id || !c.pageAccessToken) continue
            tasks.push(async () => {
              const raw = await fetchAdLead(String(change.value.leadgen_id), c.pageAccessToken)
              const lead = await ingestAdLead(account.tenantId, raw)
              if (raw.phone || raw.email) {
                const { contact } = await upsertContact(account.tenantId, { name: raw.name, phone: raw.phone, email: raw.email, company: raw.company, source: 'LEADS', tags: ['Anúncio'] }, { emit: false })
                await prisma.lead.update({ where: { id: lead.id }, data: { status: 'IMPORTED', contactId: contact.id } })
                await emitEvent(account.tenantId, 'lead.imported', { contactId: contact.id, data: { origem: 'anuncio' } })
              }
            })
          }
        }
        void channel
      }
    }

    if (!validMetaSignature(req, [...secrets])) return res.sendStatus(401)
    for (const t of tasks) {
      try {
        await t()
      } catch (e) {
        console.error('[revah] webhook meta', (e as Error).message)
      }
    }
    res.sendStatus(200)
  }),
)

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------
r.post(
  '/telegram/:accountId',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || account.provider !== 'TELEGRAM') return res.sendStatus(404)
    const token = String(req.headers['x-telegram-bot-api-secret-token'] || '')
    if (!safeEqual(token, account.webhookSecret)) return res.sendStatus(401)
    const m = req.body?.message
    if (m?.chat?.id && m.chat.type === 'private') {
      const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username
      await handleInbound({ tenant: account.tenant, account, channel: 'TELEGRAM', address: String(m.chat.id), name, text: m.text || m.caption || '', providerMessageId: `tg_${m.chat.id}_${m.message_id}` })
    }
    res.sendStatus(200)
  }),
)

// ---------------------------------------------------------------------------
// WhatsApp não oficial: Z-API e Zapiô
// ---------------------------------------------------------------------------
async function unofficialWebhook(req: Request, res: Response, provider: 'ZAPI' | 'ZAPIO') {
  const account = await loadAccount(req.params.accountId)
  if (!account || account.provider !== provider || !safeEqual(String(req.params.secret || ''), account.webhookSecret)) return res.sendStatus(404)
  const b = req.body || {}
  // Status de entrega (Z-API: MessageStatusCallback)
  if (b.type === 'MessageStatusCallback' && Array.isArray(b.ids)) {
    const st = ({ SENT: 'SENT', RECEIVED: 'DELIVERED', READ: 'READ', PLAYED: 'READ' } as Record<string, any>)[String(b.status).toUpperCase()]
    if (st) for (const id of b.ids) await updateDeliveryStatus(String(id), st)
    return res.sendStatus(200)
  }
  if (b.fromMe || b.isGroup || b.isNewsletter) return res.sendStatus(200)
  const phone = normalizePhone(b.phone || b.from || b.sender || b.remoteJid?.split('@')[0])
  const text = typeof b.text === 'object' ? b.text?.message : b.text || b.message || b.body || b.image?.caption || ''
  if (phone) {
    await handleInbound({
      tenant: account.tenant,
      account,
      channel: 'WHATSAPP',
      address: phone,
      name: b.senderName || b.chatName || b.name || b.pushName,
      text: typeof text === 'string' ? text : '',
      providerMessageId: b.messageId || b.id || b.key?.id,
    })
  }
  res.sendStatus(200)
}
r.post('/zapi/:accountId/:secret', ah((req, res) => unofficialWebhook(req, res, 'ZAPI')))
r.post('/zapio/:accountId/:secret', ah((req, res) => unofficialWebhook(req, res, 'ZAPIO')))

// ---------------------------------------------------------------------------
// E-mail recebido (inbound parse genérico: { from, subject, text })
// ---------------------------------------------------------------------------
r.post(
  '/email/:accountId/:secret',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || account.channel !== 'EMAIL' || !safeEqual(String(req.params.secret || ''), account.webhookSecret)) return res.sendStatus(404)
    const b = req.body?.data || req.body || {}
    const fromRaw = typeof b.from === 'object' ? b.from?.email || b.from?.address : String(b.from || '')
    const email = normalizeEmail(/<([^>]+)>/.exec(fromRaw || '')?.[1] || fromRaw)
    if (email) {
      await handleInbound({ tenant: account.tenant, account, channel: 'EMAIL', address: email, text: [b.subject ? `Assunto: ${b.subject}` : '', b.text || b.plain || ''].filter(Boolean).join('\n'), providerMessageId: b.message_id || b.messageId || b.email_id })
    }
    res.sendStatus(200)
  }),
)

// ---------------------------------------------------------------------------
// Twilio: SMS e voz (TwiML + callbacks de status)
// ---------------------------------------------------------------------------
function requestUrls(req: Request) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const path = req.originalUrl
  const fromPublic = `${config.publicApiUrl}${path.startsWith('/webhooks') ? path : path.replace(/^\/api/, '')}`
  return [`${proto}://${host}${path}`, fromPublic]
}

function twilioValid(req: Request, account: ChannelAccount | null) {
  if (!account) return false
  const c = creds(account)
  if (c.simulated === true) return !isProduction
  const sig = req.headers['x-twilio-signature'] as string | undefined
  return requestUrls(req).some((u) => validTwilioRequest(c.authToken, sig, u, req.body || {}))
}

function xml(res: Response, body: string) {
  res.type('text/xml').send(body)
}

r.post(
  '/twilio/sms/:accountId',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || !twilioValid(req, account)) return res.sendStatus(403)
    const phone = normalizePhone(req.body.From)
    if (phone) await handleInbound({ tenant: account.tenant, account, channel: 'SMS', address: phone, text: String(req.body.Body || ''), providerMessageId: req.body.MessageSid })
    xml(res, '<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  }),
)

r.post(
  '/twilio/sms/:accountId/status',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || !twilioValid(req, account)) return res.sendStatus(403)
    const map: Record<string, any> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', undelivered: 'FAILED', failed: 'FAILED' }
    const st = map[String(req.body.MessageStatus)]
    if (st) await updateDeliveryStatus(String(req.body.MessageSid), st, req.body.ErrorCode ? `Erro Twilio ${req.body.ErrorCode}` : undefined)
    res.sendStatus(204)
  }),
)

// Ligação recebida no número da empresa.
r.post(
  '/twilio/voice/inbound/:accountId',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || account.channel !== 'VOICE' || !twilioValid(req, account)) return res.sendStatus(403)
    const call = await startInboundCall(account.id, req.body)
    if (!call) return xml(res, new TwiML().hangup().toString())
    xml(res, await answerTwiml(call.id, req.body.CallSid))
  }),
)

r.post(
  '/twilio/voice/inbound/:accountId/status',
  ah(async (req, res) => {
    const account = await loadAccount(req.params.accountId)
    if (!account || !twilioValid(req, account)) return res.sendStatus(403)
    const call = await prisma.call.findUnique({ where: { providerCallSid: String(req.body.CallSid || '') } })
    if (call) await handleStatusCallback(call.id, req.body)
    res.sendStatus(204)
  }),
)

async function callAccount(callId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } })
  if (!call?.channelAccountId) return { call, account: null }
  return { call, account: await prisma.channelAccount.findUnique({ where: { id: call.channelAccountId } }) }
}

r.post(
  '/twilio/voice/:callId/:step',
  ah(async (req, res) => {
    const { call, account } = await callAccount(req.params.callId)
    if (!call || !twilioValid(req, account)) return res.sendStatus(403)
    switch (req.params.step) {
      case 'answer':
        return xml(res, await answerTwiml(call.id, req.body.CallSid))
      case 'turn':
        return xml(res, await turnTwiml(call.id, req.body))
      case 'status':
        await handleStatusCallback(call.id, req.body)
        return res.sendStatus(204)
      case 'recording':
        await handleRecordingCallback(call.id, req.body)
        return res.sendStatus(204)
      case 'dial-status': {
        const st = String(req.body.DialCallStatus || '')
        if (st === 'completed' || st === 'answered') return xml(res, new TwiML().hangup().toString())
        await prisma.call.update({ where: { id: call.id }, data: { outcome: 'CALLBACK_REQUESTED' } })
        return xml(res, new TwiML().say('Nossos atendentes estão ocupados no momento. Vamos retornar sua ligação. Obrigado.').hangup().toString())
      }
      default:
        return res.sendStatus(404)
    }
  }),
)

export default r
