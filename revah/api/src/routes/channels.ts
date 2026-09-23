import { Router } from 'express'
import { z } from 'zod'
import type { ChannelAccount } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { decryptJson, encryptJson, randomToken } from '../lib/crypto'
import { ah, badRequest, notFound } from '../lib/errors'
import { CHANNELS, normalizeDestination, type Channel } from '../lib/normalize'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { adapterFor, PROVIDERS, UNOFFICIAL_WHATSAPP_WARNING } from '../services/channels/providers'
import { sendMessage } from '../services/messaging'
import { assertCanAddChannel } from '../services/plans'

const r = Router()

// Campos de credencial por provedor (o painel monta o formulário a partir daqui).
const CREDENTIAL_FIELDS: Record<string, { key: string; label: string; secret?: boolean; optional?: boolean }[]> = {
  META_CLOUD: [
    { key: 'phoneNumberId', label: 'Phone number ID' },
    { key: 'accessToken', label: 'Token de acesso permanente', secret: true },
    { key: 'wabaId', label: 'WhatsApp Business Account ID', optional: true },
    { key: 'appSecret', label: 'App secret (validação de webhook)', secret: true, optional: true },
  ],
  ZAPI: [
    { key: 'instanceId', label: 'ID da instância' },
    { key: 'token', label: 'Token da instância', secret: true },
    { key: 'clientToken', label: 'Client-Token da conta', secret: true, optional: true },
  ],
  ZAPIO: [
    { key: 'baseUrl', label: 'URL base da API' },
    { key: 'token', label: 'Token', secret: true },
    { key: 'instanceId', label: 'ID da instância', optional: true },
    { key: 'sendPath', label: 'Caminho de envio (padrão /messages/send-text)', optional: true },
  ],
  TWILIO: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken', label: 'Auth Token', secret: true },
    { key: 'messagingServiceSid', label: 'Messaging Service SID (SMS)', optional: true },
  ],
  TELEGRAM: [{ key: 'botToken', label: 'Token do bot (BotFather)', secret: true }],
  RESEND: [
    { key: 'apiKey', label: 'API key', secret: true },
    { key: 'from', label: 'Remetente (Nome <email@dominio>)', optional: true },
    { key: 'replyTo', label: 'Responder para', optional: true },
  ],
  META_GRAPH: [
    { key: 'pageAccessToken', label: 'Token de acesso da página', secret: true },
    { key: 'appSecret', label: 'App secret (validação de webhook)', secret: true, optional: true },
  ],
}

export function webhookInfo(a: Pick<ChannelAccount, 'id' | 'provider' | 'channel' | 'webhookSecret'>) {
  const base = config.publicApiUrl
  switch (a.provider) {
    case 'META_CLOUD':
    case 'META_GRAPH':
      return { url: `${base}/webhooks/meta`, verifyToken: config.meta.verifyToken || '(defina META_VERIFY_TOKEN)' }
    case 'ZAPI':
      return { url: `${base}/webhooks/zapi/${a.id}/${a.webhookSecret}` }
    case 'ZAPIO':
      return { url: `${base}/webhooks/zapio/${a.id}/${a.webhookSecret}` }
    case 'TWILIO':
      return a.channel === 'VOICE' ? { url: `${base}/webhooks/twilio/voice/inbound/${a.id}` } : { url: `${base}/webhooks/twilio/sms/${a.id}` }
    case 'TELEGRAM':
      return { url: `${base}/webhooks/telegram/${a.id}`, automatic: true }
    case 'RESEND':
      return { url: `${base}/webhooks/email/${a.id}/${a.webhookSecret}`, note: 'Opcional: receba respostas por e-mail via inbound parse.' }
    default:
      return null
  }
}

function publicAccount(a: ChannelAccount) {
  const creds = decryptJson<Record<string, any>>(a.encryptedCredentials) || {}
  const { encryptedCredentials: _e, webhookSecret: _w, ...rest } = a
  return {
    ...rest,
    official: PROVIDERS[a.provider]?.official ?? true,
    simulated: creds.simulated === true,
    configuredFields: Object.keys(creds).filter((k) => creds[k] !== undefined && creds[k] !== ''),
    webhook: webhookInfo(a),
  }
}

r.get('/channels/providers', (_req, res) => {
  res.json({
    providers: Object.entries(PROVIDERS).map(([key, p]) => ({ key, ...p, adapter: undefined, fields: CREDENTIAL_FIELDS[key] || [] })),
    unofficialWarning: UNOFFICIAL_WHATSAPP_WARNING,
  })
})

r.get(
  '/channels',
  ah(async (req: AuthedRequest, res) => {
    const rows = await prisma.channelAccount.findMany({ where: { tenantId: req.tenant.id }, orderBy: [{ channel: 'asc' }, { createdAt: 'asc' }] })
    res.json(rows.map(publicAccount))
  }),
)

const ChannelSchema = z.object({
  channel: z.enum(CHANNELS as [string, ...string[]]),
  provider: z.string(),
  label: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(200),
  externalId: z.string().max(120).nullable().optional(),
  credentials: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
  acknowledgeRisk: z.boolean().optional(),
})

r.post(
  '/channels',
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => {
    const b = ChannelSchema.parse(req.body)
    const meta = PROVIDERS[b.provider]
    if (!meta || !meta.channels.includes(b.channel)) throw badRequest('Provedor não atende este canal.')
    if (!meta.official && !b.acknowledgeRisk) throw badRequest(UNOFFICIAL_WHATSAPP_WARNING, { code: 'RISK_ACK_REQUIRED' })
    await assertCanAddChannel(req.tenant)
    const address = ['WHATSAPP', 'SMS', 'VOICE'].includes(b.channel) ? normalizeDestination('WHATSAPP', b.address) : b.address.trim()
    if (!address) throw badRequest('Número/endereço inválido.')
    const creds = b.credentials || {}
    if (creds.simulated !== true) {
      const missing = (CREDENTIAL_FIELDS[b.provider] || []).filter((f) => !f.optional && !creds[f.key]).map((f) => f.label)
      if (missing.length) throw badRequest(`Preencha: ${missing.join(', ')}.`)
    }
    const externalId = b.externalId || (b.provider === 'META_CLOUD' ? creds.phoneNumberId : b.provider === 'ZAPI' ? creds.instanceId : null) || null
    const hasDefault = await prisma.channelAccount.count({ where: { tenantId: req.tenant.id, channel: b.channel, isDefault: true } })
    const isDefault = b.isDefault ?? !hasDefault
    if (isDefault) await prisma.channelAccount.updateMany({ where: { tenantId: req.tenant.id, channel: b.channel }, data: { isDefault: false } })
    const account = await prisma.channelAccount.create({
      data: {
        tenantId: req.tenant.id,
        channel: b.channel,
        provider: b.provider,
        label: b.label,
        address,
        externalId,
        encryptedCredentials: encryptJson(creds),
        settings: (b.settings as any) || undefined,
        webhookSecret: randomToken(18),
        isDefault,
        ...(!meta.official ? { riskAcknowledgedAt: new Date(), riskAcknowledgedBy: req.user.id } : {}),
      },
    })
    let connection: { ok: boolean; info?: string; error?: string } = { ok: true, info: 'Modo simulado.' }
    if (creds.simulated !== true) {
      try {
        connection = (await adapterFor(account.provider, account.channel).connect?.(account, creds)) || { ok: true }
      } catch (e: any) {
        connection = { ok: false, error: e?.message || String(e) }
      }
    }
    await audit(req.tenant.id, req.user.id, 'CHANNEL_CREATE', 'ChannelAccount', account.id, { channel: b.channel, provider: b.provider, unofficial: !meta.official })
    res.status(201).json({ account: publicAccount(account), connection })
  }),
)

r.patch(
  '/channels/:id',
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.channelAccount.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Canal não encontrado.')
    const b = ChannelSchema.partial().parse(req.body)
    const data: any = {}
    if (b.label) data.label = b.label
    if (b.externalId !== undefined) data.externalId = b.externalId
    if (b.settings) data.settings = { ...((found.settings as object) || {}), ...b.settings }
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive
    if (b.credentials) data.encryptedCredentials = encryptJson({ ...(decryptJson(found.encryptedCredentials) || {}), ...b.credentials })
    if (b.isDefault) {
      await prisma.channelAccount.updateMany({ where: { tenantId: req.tenant.id, channel: found.channel }, data: { isDefault: false } })
      data.isDefault = true
    }
    const account = await prisma.channelAccount.update({ where: { id: found.id }, data })
    await audit(req.tenant.id, req.user.id, 'CHANNEL_UPDATE', 'ChannelAccount', account.id, { fields: Object.keys(data) })
    res.json(publicAccount(account))
  }),
)

r.delete(
  '/channels/:id',
  requireRole('OWNER', 'ADMIN'),
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.channelAccount.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Canal não encontrado.')
    await prisma.channelAccount.delete({ where: { id: found.id } })
    await audit(req.tenant.id, req.user.id, 'CHANNEL_DELETE', 'ChannelAccount', found.id)
    res.json({ ok: true })
  }),
)

// Testa conexão e, opcionalmente, envia uma mensagem de teste.
r.post(
  '/channels/:id/test',
  ah(async (req: AuthedRequest, res) => {
    const account = await prisma.channelAccount.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!account) throw notFound('Canal não encontrado.')
    const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
    let connection: { ok: boolean; info?: string; error?: string }
    try {
      connection = creds.simulated ? { ok: true, info: 'Modo simulado.' } : (await adapterFor(account.provider, account.channel).connect?.(account, creds)) || { ok: true }
    } catch (e: any) {
      connection = { ok: false, error: e?.message || String(e) }
    }
    let send: unknown = null
    if (req.body?.destination && account.channel !== 'VOICE') {
      const r2 = await sendMessage({
        tenant: req.tenant,
        channel: account.channel as Channel,
        destination: req.body.destination,
        text: String(req.body.text || 'Mensagem de teste do REVAH.'),
        channelAccountId: account.id,
        userId: req.user.id,
        template: req.body.template || null,
      })
      send = { ok: r2.ok, status: r2.message.status, error: r2.ok ? null : r2.error }
    }
    res.json({ connection, send })
  }),
)

export default r
