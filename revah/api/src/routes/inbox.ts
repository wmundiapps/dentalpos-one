import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, badRequest, notFound } from '../lib/errors'
import { isChannel, type Channel } from '../lib/normalize'
import type { AuthedRequest } from '../middleware/auth'
import { sendMessage } from '../services/messaging'

const r = Router()

r.get(
  '/conversations',
  ah(async (req: AuthedRequest, res) => {
    const status = String(req.query.status || '')
    const channel = String(req.query.channel || '')
    const mine = req.query.mine === '1'
    const q = String(req.query.q || '').trim()
    const rows = await prisma.conversation.findMany({
      where: {
        tenantId: req.tenant.id,
        ...(['BOT', 'HUMAN', 'CLOSED'].includes(status) ? { status } : status === 'OPEN' ? { status: { in: ['BOT', 'HUMAN'] } } : {}),
        ...(isChannel(channel) ? { channel } : {}),
        ...(mine ? { assignedUserId: req.user.id } : {}),
        ...(q ? { contact: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } } : {}),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    })
    res.json(rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] || null })))
  }),
)

r.get(
  '/conversations/:id',
  ah(async (req: AuthedRequest, res) => {
    const conv = await prisma.conversation.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { contact: { include: { tags: { include: { tag: true } } } }, channelAccount: { select: { id: true, label: true, provider: true } } },
    })
    if (!conv) throw notFound('Conversa não encontrada.')
    const messages = await prisma.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' }, take: 500 })
    // Outras conversas do mesmo cliente (visão multicanal).
    const otherChannels = await prisma.conversation.findMany({ where: { tenantId: req.tenant.id, contactId: conv.contactId, id: { not: conv.id } }, select: { id: true, channel: true, status: true, lastMessageAt: true } })
    await prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } })
    res.json({ ...conv, contact: { ...conv.contact, tags: conv.contact.tags.map((t) => t.tag) }, messages, otherChannels })
  }),
)

r.post(
  '/conversations/:id/messages',
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ text: z.string().trim().min(1).max(4096), template: z.object({ name: z.string(), language: z.string().optional(), params: z.array(z.string()).optional() }).optional() }).parse(req.body)
    const conv = await prisma.conversation.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id }, include: { contact: true } })
    if (!conv) throw notFound('Conversa não encontrada.')
    // Atendente respondeu: a conversa passa para atendimento humano.
    if (conv.status !== 'HUMAN') await prisma.conversation.update({ where: { id: conv.id }, data: { status: 'HUMAN', assignedUserId: conv.assignedUserId || req.user.id } })
    const out = await sendMessage({
      tenant: req.tenant,
      channel: conv.channel as Channel,
      contact: conv.contact,
      text: b.text,
      template: b.template || null,
      channelAccountId: conv.channelAccountId,
      userId: req.user.id,
    })
    res.status(out.ok ? 201 : 422).json(out.ok ? out.message : { error: out.error, code: out.code, message: out.message })
  }),
)

r.post(
  '/conversations/:id/status',
  ah(async (req: AuthedRequest, res) => {
    const status = String(req.body?.status || '')
    if (!['BOT', 'HUMAN', 'CLOSED'].includes(status)) throw badRequest('Status inválido.')
    const conv = await prisma.conversation.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!conv) throw notFound('Conversa não encontrada.')
    res.json(await prisma.conversation.update({ where: { id: conv.id }, data: { status, ...(status === 'HUMAN' && !conv.assignedUserId ? { assignedUserId: req.user.id } : {}) } }))
  }),
)

r.post(
  '/conversations/:id/assign',
  ah(async (req: AuthedRequest, res) => {
    const userId = req.body?.userId ? String(req.body.userId) : null
    if (userId && !(await prisma.user.findFirst({ where: { id: userId, tenantId: req.tenant.id } }))) throw badRequest('Usuário inválido.')
    const conv = await prisma.conversation.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!conv) throw notFound('Conversa não encontrada.')
    res.json(await prisma.conversation.update({ where: { id: conv.id }, data: { assignedUserId: userId, ...(userId ? { status: 'HUMAN' } : {}) } }))
  }),
)

// Inicia conversa com um contato (ex.: a partir do CRM).
r.post(
  '/conversations',
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ contactId: z.string(), channel: z.string(), text: z.string().trim().min(1).max(4096), template: z.any().optional() }).parse(req.body)
    if (!isChannel(b.channel) || b.channel === 'VOICE') throw badRequest('Canal inválido.')
    const contact = await prisma.contact.findFirst({ where: { id: b.contactId, tenantId: req.tenant.id } })
    if (!contact) throw notFound('Contato não encontrado.')
    const out = await sendMessage({ tenant: req.tenant, channel: b.channel, contact, text: b.text, template: b.template || null, userId: req.user.id })
    if (out.message.conversationId) await prisma.conversation.update({ where: { id: out.message.conversationId }, data: { status: 'HUMAN', assignedUserId: req.user.id } })
    res.status(out.ok ? 201 : 422).json(out.ok ? { conversationId: out.message.conversationId, message: out.message } : { error: out.error, code: out.code })
  }),
)

export default r
