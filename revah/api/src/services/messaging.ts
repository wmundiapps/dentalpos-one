import type { ChannelAccount, Contact, Tenant } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { decryptJson, signPayload } from '../lib/crypto'
import { badRequest, conflict } from '../lib/errors'
import { normalizeDestination, type Channel } from '../lib/normalize'
import { adapterFor } from './channels/providers'
import type { WaTemplate } from './channels/types'
import { findOrCreateByChannel, contactAddress } from './contacts'
import { assertCanSend } from './plans'
import { isSuppressed } from './suppression'

const WINDOW_MS = 24 * 60 * 60 * 1000
const OPT_OUT_HINT = 'Responda SAIR para não receber mais mensagens.'

export interface SendMessageInput {
  tenant: Tenant
  channel: Channel
  contact?: Contact | null
  destination?: string | null
  text: string
  subject?: string | null
  template?: WaTemplate | null
  channelAccountId?: string | null
  campaignId?: string | null
  userId?: string | null
  aiGenerated?: boolean
  appendOptOutHint?: boolean
  skipUsageCheck?: boolean
  metadata?: Record<string, unknown>
}

export async function pickChannelAccount(tenantId: string, channel: Channel, id?: string | null) {
  if (id) {
    const acc = await prisma.channelAccount.findFirst({ where: { id, tenantId, channel, isActive: true } })
    if (!acc) throw badRequest('Canal selecionado não está ativo.')
    return acc
  }
  const acc =
    (await prisma.channelAccount.findFirst({ where: { tenantId, channel, isActive: true, isDefault: true } })) ||
    (await prisma.channelAccount.findFirst({ where: { tenantId, channel, isActive: true }, orderBy: { createdAt: 'asc' } }))
  if (!acc) throw conflict(`Conecte um canal ${channel} antes de enviar.`, 'CHANNEL_NOT_CONNECTED')
  return acc
}

export function unsubscribeUrl(tenantId: string, channel: Channel, value: string) {
  return `${config.publicApiUrl}/public/unsubscribe/${signPayload({ t: tenantId, c: channel, v: value })}`
}

function withOptOutHint(channel: Channel, text: string) {
  if (!['WHATSAPP', 'SMS', 'TELEGRAM'].includes(channel)) return text
  if (/\bSAIR\b/i.test(text)) return text
  return `${text}\n\n${OPT_OUT_HINT}`
}

export async function ensureConversation(tenantId: string, contactId: string, channel: Channel, channelAccountId?: string | null) {
  return prisma.conversation.upsert({
    where: { tenantId_contactId_channel: { tenantId, contactId, channel } },
    create: { tenantId, contactId, channel, channelAccountId: channelAccountId || null },
    update: channelAccountId ? { channelAccountId } : {},
  })
}

export async function sendMessage(input: SendMessageInput) {
  const { tenant, channel } = input
  if (channel === 'VOICE') throw badRequest('Para voz, use o agendamento de ligações.')
  const text = (input.text || '').trim()
  if (!text && !input.template?.name) throw badRequest('Mensagem vazia.')

  let contact = input.contact || null
  const destination = normalizeDestination(channel, input.destination ?? (contact ? contactAddress(contact, channel) : null))
  if (!destination) throw badRequest('Destino inválido para este canal.')
  if (!contact) contact = await findOrCreateByChannel(tenant.id, channel, destination)

  const account: ChannelAccount = await pickChannelAccount(tenant.id, channel, input.channelAccountId)
  const conversation = await ensureConversation(tenant.id, contact.id, channel, account.id)
  const finalText = input.appendOptOutHint ? withOptOutHint(channel, text) : text

  const base = {
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    campaignId: input.campaignId || null,
    channel,
    provider: account.provider,
    direction: 'OUT',
    content: finalText || `[modelo ${input.template?.name}]`,
    subject: input.subject || null,
    aiGenerated: Boolean(input.aiGenerated),
    sentByUserId: input.userId || null,
    metadata: (input.metadata as any) || undefined,
  }

  if (await isSuppressed(tenant.id, channel, destination)) {
    const blocked = await prisma.message.create({ data: { ...base, status: 'BLOCKED', error: 'Contato pediu para não receber mensagens neste canal.' } })
    return { ok: false as const, message: blocked, error: blocked.error!, code: 'SUPPRESSED' }
  }

  if (!input.skipUsageCheck) await assertCanSend(tenant, 1)

  const withinWindow = conversation.lastInboundAt ? Date.now() - conversation.lastInboundAt.getTime() < WINDOW_MS : false
  const creds = decryptJson<Record<string, any>>(account.encryptedCredentials) || {}
  let template = input.template || null
  // Canal simulado não aplica a janela de 24h (útil no teste grátis).
  if (account.provider === 'META_CLOUD' && creds.simulated !== true) {
    if (!withinWindow && !template?.name) {
      const def = (account.settings as any)?.defaultTemplate as WaTemplate | undefined
      if (def?.name) template = { ...def, params: def.params?.length ? def.params : [finalText] }
      else {
        const failed = await prisma.message.create({
          data: { ...base, status: 'FAILED', error: 'Fora da janela de 24h do WhatsApp: é preciso usar um modelo aprovado pela Meta.' },
        })
        return { ok: false as const, message: failed, error: failed.error!, code: 'WHATSAPP_TEMPLATE_REQUIRED' }
      }
    }
    if (withinWindow && !input.template) template = null
  }
  if (['INSTAGRAM', 'MESSENGER'].includes(channel) && !withinWindow && creds.simulated !== true) {
    const failed = await prisma.message.create({
      data: { ...base, status: 'FAILED', error: 'Instagram/Messenger só permitem responder até 24h após a última mensagem do contato.' },
    })
    return { ok: false as const, message: failed, error: failed.error!, code: 'OUTSIDE_WINDOW' }
  }

  const queued = await prisma.message.create({ data: { ...base, status: 'QUEUED' } })
  try {
    let result
    if (creds.simulated === true) {
      result = { simulated: true, providerMessageId: `sim_${queued.id}` }
    } else {
      result = await adapterFor(account.provider, channel).send({
        account,
        creds,
        to: destination,
        text: finalText,
        subject: input.subject,
        template,
        unsubscribeUrl: channel === 'EMAIL' ? unsubscribeUrl(tenant.id, channel, destination) : null,
      })
    }
    const now = new Date()
    const message = await prisma.message.update({
      where: { id: queued.id },
      data: { status: result.simulated ? 'SIMULATED' : 'SENT', providerMessageId: result.providerMessageId || null, sentAt: now },
    })
    await Promise.all([
      prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } }),
      prisma.contact.update({ where: { id: contact.id }, data: { lastInteractionAt: now } }),
    ])
    return { ok: true as const, message }
  } catch (e: any) {
    const message = await prisma.message.update({ where: { id: queued.id }, data: { status: 'FAILED', error: String(e?.message || e).slice(0, 500) } })
    return { ok: false as const, message, error: message.error!, code: 'PROVIDER_ERROR' }
  }
}

// Atualiza status de entrega a partir dos callbacks dos provedores.
const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 }
export async function updateDeliveryStatus(providerMessageId: string, status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', error?: string) {
  if (!providerMessageId) return
  const msgs = await prisma.message.findMany({ where: { providerMessageId }, take: 5 })
  for (const m of msgs) {
    if ((STATUS_RANK[m.status] ?? 0) >= (STATUS_RANK[status] ?? 0) && status !== 'FAILED') continue
    await prisma.message.update({ where: { id: m.id }, data: { status, ...(error ? { error: error.slice(0, 500) } : {}) } })
  }
}
