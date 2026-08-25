import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const ctx = (req: AuthRequest) => ({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId })

export async function conversations(req: AuthRequest, res: Response) {
  const rows = await prisma.revahConversation.findMany({
    where: ctx(req),
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  })
  res.json(rows)
}

export async function conversation(req: AuthRequest, res: Response) {
  const row = await prisma.revahConversation.findFirst({
    where: { ...ctx(req), id: String(req.params.id) },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 300 } },
  })
  if (!row) return res.status(404).json({ error: 'Conversa não encontrada.' })
  res.json(row)
}

export async function createConversation(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const channel = String(req.body.channel || '').toUpperCase()
  if (!['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEGRAM', 'VOICE', 'EMAIL', 'SMS'].includes(channel)) {
    return res.status(400).json({ error: 'Canal não suportado.' })
  }
  const row = await prisma.revahConversation.create({ data: { ...c, channel, provider: req.body.provider || null, contactId: req.body.contactId || null, leadId: req.body.leadId || null, contactName: String(req.body.contactName || 'Contato'), destination: req.body.destination || null, status: 'BOT', metadata: req.body.metadata || {} } })
  res.status(201).json(row)
}

export async function handoff(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const found = await prisma.revahConversation.findFirst({ where: { ...c, id: String(req.params.id) } })
  if (!found) return res.status(404).json({ error: 'Conversa não encontrada.' })
  const row = await prisma.revahConversation.update({ where: { id: found.id }, data: { status: 'HUMAN', assignedUserId: req.user!.id } })
  res.json(row)
}

export async function sendMessage(req: AuthRequest, res: Response) {
  const c = ctx(req)
  const found = await prisma.revahConversation.findFirst({ where: { ...c, id: String(req.params.id) } })
  if (!found) return res.status(404).json({ error: 'Conversa não encontrada.' })
  const content = String(req.body.content || '').trim()
  if (!content) return res.status(400).json({ error: 'Mensagem vazia.' })

  // O registro é criado como QUEUED. O envio externo real deve passar pelo adapter do provedor,
  // com credenciais, consentimento/opt-out e validações do tenant.
  const message = await prisma.revahConversationMessage.create({ data: { ...c, conversationId: found.id, direction: 'OUTBOUND', channel: found.channel, provider: found.provider, content, status: 'QUEUED', aiGenerated: Boolean(req.body.aiGenerated), sentByUserId: req.user!.id } })
  await prisma.revahConversation.update({ where: { id: found.id }, data: { lastMessageAt: new Date() } })
  res.status(201).json(message)
}
