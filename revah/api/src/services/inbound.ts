import type { ChannelAccount, Tenant } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { Channel } from '../lib/normalize'
import { decideChatReply } from './ai'
import { emitEvent } from './automations'
import { findOrCreateByChannel } from './contacts'
import { notifyIntegration } from './integrationOut'
import { ensureConversation, sendMessage } from './messaging'
import { limitsFor } from './plans'
import { detectOptOut, isSuppressed, suppress, unsuppress } from './suppression'

export interface InboundInput {
  tenant: Tenant
  account: ChannelAccount
  channel: Channel
  address: string
  name?: string | null
  text: string
  providerMessageId?: string | null
  mediaUrl?: string | null
  metadata?: Record<string, unknown>
}

const OPT_IN = /^\s*(voltar|reativar|quero\s+receber|aceito\s+receber)\s*[.!]*\s*$/i

export async function getBotSettings(tenantId: string) {
  return prisma.botSettings.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
}

export async function handleInbound(input: InboundInput) {
  const { tenant, account, channel, address } = input
  if (input.providerMessageId) {
    const dup = await prisma.message.findFirst({ where: { tenantId: tenant.id, providerMessageId: input.providerMessageId, direction: 'IN' } })
    if (dup) return { duplicate: true }
  }
  const contact = await findOrCreateByChannel(tenant.id, channel, address, input.name)
  const conv = await ensureConversation(tenant.id, contact.id, channel, account.id)
  const now = new Date()
  const conversation = await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastInboundAt: now, lastMessageAt: now, unreadCount: { increment: 1 }, ...(conv.status === 'CLOSED' ? { status: 'BOT' } : {}) },
  })
  const text = (input.text || '').trim()
  const message = await prisma.message.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      conversationId: conversation.id,
      channel,
      provider: account.provider,
      direction: 'IN',
      content: text || (input.mediaUrl ? '[mídia]' : '[mensagem sem texto]'),
      mediaUrl: input.mediaUrl || null,
      status: 'RECEIVED',
      providerMessageId: input.providerMessageId || null,
      metadata: (input.metadata as any) || undefined,
    },
  })
  await prisma.contact.update({ where: { id: contact.id }, data: { lastInteractionAt: now } })

  const bot = await getBotSettings(tenant.id)

  // Consentimento: pedido de saída entra na suppression list do canal.
  if (detectOptOut(text)) {
    if (!(await isSuppressed(tenant.id, channel, address))) {
      await sendMessage({ tenant, channel, contact, text: bot.optOutConfirmation, skipUsageCheck: true, metadata: { system: 'opt_out_confirmation' } }).catch(() => null)
      await suppress(tenant.id, channel, address, 'KEYWORD', { contactId: contact.id, detail: text })
      await notifyIntegration(tenant, 'revah.opt_out', { contactId: contact.id, externalRef: contact.externalRef, channel })
    }
    await prisma.conversation.update({ where: { id: conversation.id }, data: { intent: 'OPT_OUT', status: 'CLOSED' } })
    return { message, optOut: true }
  }
  if (OPT_IN.test(text) && (await isSuppressed(tenant.id, channel, address))) {
    await unsuppress(tenant.id, channel, address, contact.id, `Contato pediu para voltar a receber: "${text}"`)
    await sendMessage({ tenant, channel, contact, text: 'Pronto! Você voltará a receber nossas mensagens por aqui.', skipUsageCheck: true }).catch(() => null)
    return { message, optIn: true }
  }

  await emitEvent(tenant.id, 'message.received', { contactId: contact.id, data: { channel, text } })

  const botEnabledOnAccount = (account.settings as any)?.botEnabled !== false
  if (conversation.status !== 'BOT' || !bot.aiEnabled || !botEnabledOnAccount || !text) return { message }

  const decision = await decideChatReply({ bot, channel, tenantId: tenant.id, contactId: contact.id, incoming: text, level: limitsFor(tenant).ai })
  if (decision.optOut) {
    await sendMessage({ tenant, channel, contact, text: bot.optOutConfirmation, skipUsageCheck: true }).catch(() => null)
    await suppress(tenant.id, channel, address, 'KEYWORD', { contactId: contact.id, detail: text })
    await notifyIntegration(tenant, 'revah.opt_out', { contactId: contact.id, externalRef: contact.externalRef, channel })
    await prisma.conversation.update({ where: { id: conversation.id }, data: { intent: 'OPT_OUT', status: 'CLOSED' } })
    return { message, optOut: true }
  }
  if (decision.reply) {
    await sendMessage({ tenant, channel, contact, text: decision.reply, aiGenerated: true, skipUsageCheck: true, metadata: { intent: decision.intent } }).catch((e) =>
      console.error('[revah] falha ao responder pelo bot', e?.message),
    )
  }
  if (decision.appointment) {
    const a = decision.appointment
    const body = `Pedido de agendamento pelo ${channel}: ${[a.preferredDate, a.preferredTime].filter(Boolean).join(' às ') || 'data a combinar'}${a.notes ? ` — ${a.notes}` : ''}`
    await prisma.note.create({ data: { tenantId: tenant.id, contactId: contact.id, kind: 'APPOINTMENT_REQUEST', body } })
    await notifyIntegration(tenant, 'revah.appointment_requested', {
      contactId: contact.id,
      externalRef: contact.externalRef,
      name: contact.name,
      phone: contact.phone,
      preferredDate: a.preferredDate,
      preferredTime: a.preferredTime,
      notes: a.notes,
      channel,
    })
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { intent: decision.intent, ...(decision.handoff ? { status: 'HUMAN' } : {}) },
  })
  return { message, decision }
}
