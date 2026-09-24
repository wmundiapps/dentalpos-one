import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { randomToken } from '../lib/crypto'
import { ah, badRequest, conflict, notFound } from '../lib/errors'
import { normalizeEmail } from '../lib/normalize'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { aiAvailable } from '../services/ai'
import { createApiKey } from '../services/apiKeys'
import { audit } from '../services/audit'
import { getBotSettings } from '../services/inbound'
import { assertCanAddIntegration, assertCanAddUser, limitsFor, monthlyUsage, trialStatus } from '../services/plans'
import { sendSystemEmail } from '../services/systemEmail'

const r = Router()

r.get('/dashboard', ah(async (req: AuthedRequest, res) => {
  const t = req.tenant.id
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [contacts, openConversations, waitingHuman, campaigns, usage, channels, calls, byChannel, suppressions] = await Promise.all([
    prisma.contact.count({ where: { tenantId: t } }),
    prisma.conversation.count({ where: { tenantId: t, status: { in: ['BOT', 'HUMAN'] } } }),
    prisma.conversation.count({ where: { tenantId: t, status: 'HUMAN', unreadCount: { gt: 0 } } }),
    prisma.campaign.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'desc' }, take: 5 }),
    monthlyUsage(t),
    prisma.channelAccount.findMany({ where: { tenantId: t }, select: { id: true, channel: true, provider: true, label: true, isActive: true } }),
    prisma.call.groupBy({ by: ['outcome'], where: { tenantId: t, createdAt: { gte: since } }, _count: true }),
    prisma.message.groupBy({ by: ['channel', 'direction'], where: { tenantId: t, createdAt: { gte: since } }, _count: true }),
    prisma.suppression.count({ where: { tenantId: t } }),
  ])
  res.json({
    contacts,
    openConversations,
    waitingHuman,
    recentCampaigns: campaigns,
    usage,
    limits: limitsFor(req.tenant),
    trial: trialStatus(req.tenant),
    channels,
    callsByOutcome: calls.map((c) => ({ outcome: c.outcome || 'PENDENTE', count: c._count })),
    messagesByChannel: byChannel.map((m) => ({ channel: m.channel, direction: m.direction, count: m._count })),
    suppressions,
    aiEnabled: aiAvailable(),
  })
}))

r.get('/settings/company', ah(async (req: AuthedRequest, res) => {
  const t = req.tenant
  res.json({ id: t.id, name: t.name, document: t.document, phone: t.phone, timezone: t.timezone, plan: t.plan, status: t.status, source: t.source, createdAt: t.createdAt })
}))

r.patch('/settings/company', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(120).optional(), document: z.string().max(20).optional(), phone: z.string().max(30).optional(), timezone: z.string().max(60).optional() }).parse(req.body)
  if (b.timezone) {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: b.timezone })
    } catch {
      throw badRequest('Fuso horário inválido.')
    }
  }
  res.json(await prisma.tenant.update({ where: { id: req.tenant.id }, data: { ...b, document: b.document?.replace(/\D/g, '') } }))
}))

r.get('/settings/bot', ah(async (req: AuthedRequest, res) => res.json({ ...(await getBotSettings(req.tenant.id)), aiConfigured: aiAvailable() })))

r.put('/settings/bot', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z
    .object({
      aiEnabled: z.boolean().optional(),
      agentName: z.string().trim().min(1).max(60).optional(),
      businessInfo: z.string().max(8000).optional(),
      instructions: z.string().max(4000).optional(),
      handoffMessage: z.string().min(5).max(500).optional(),
      optOutConfirmation: z.string().min(5).max(500).optional(),
      schedulingEnabled: z.boolean().optional(),
    })
    .parse(req.body)
  await getBotSettings(req.tenant.id)
  res.json(await prisma.botSettings.update({ where: { tenantId: req.tenant.id }, data: b }))
}))

// Equipe
r.get('/users', ah(async (req: AuthedRequest, res) => {
  res.json(await prisma.user.findMany({ where: { tenantId: req.tenant.id }, select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }))
}))

r.post('/users', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().trim().min(2), email: z.string().email(), role: z.enum(['ADMIN', 'AGENT']) }).parse(req.body)
  await assertCanAddUser(req.tenant)
  const email = normalizeEmail(b.email)!
  if (await prisma.user.findUnique({ where: { email } })) throw conflict('Este e-mail já tem conta no REVAH.', 'EMAIL_IN_USE')
  const temp = randomToken(9)
  const user = await prisma.user.create({ data: { tenantId: req.tenant.id, name: b.name, email, role: b.role, passwordHash: await bcrypt.hash(temp, 11) } })
  const sent = await sendSystemEmail(email, 'Seu acesso ao REVAH', `Olá, ${b.name}!\n\n${req.user.name} convidou você para ${req.tenant.name} no REVAH.\n\nAcesse ${config.appUrl}/login\nE-mail: ${email}\nSenha provisória: ${temp}\n\nTroque a senha no primeiro acesso.`)
  await audit(req.tenant.id, req.user.id, 'USER_CREATE', 'User', user.id, { role: b.role })
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, temporaryPassword: sent ? null : temp })
}))

r.patch('/users/:id', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ role: z.enum(['ADMIN', 'AGENT']).optional(), isActive: z.boolean().optional(), name: z.string().min(2).optional() }).parse(req.body)
  const u = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!u) throw notFound('Usuário não encontrado.')
  if (u.role === 'OWNER') throw badRequest('O proprietário da conta não pode ser alterado por aqui.')
  const updated = await prisma.user.update({ where: { id: u.id }, data: b, select: { id: true, name: true, email: true, role: true, isActive: true } })
  await audit(req.tenant.id, req.user.id, 'USER_UPDATE', 'User', u.id, b)
  res.json(updated)
}))

// Chaves de API
r.get('/settings/api-keys', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  res.json(await prisma.apiKey.findMany({ where: { tenantId: req.tenant.id }, select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } }))
}))

r.post('/settings/api-keys', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const name = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body).name
  await assertCanAddIntegration(req.tenant)
  const key = await createApiKey(req.tenant.id, name)
  await audit(req.tenant.id, req.user.id, 'API_KEY_CREATE', 'ApiKey', key.id)
  res.status(201).json(key)
}))

r.delete('/settings/api-keys/:id', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  await prisma.apiKey.updateMany({ where: { id: req.params.id, tenantId: req.tenant.id }, data: { revokedAt: new Date() } })
  await audit(req.tenant.id, req.user.id, 'API_KEY_REVOKE', 'ApiKey', req.params.id)
  res.json({ ok: true })
}))

// Webhook de saída (notificações do REVAH para o sistema integrado).
r.get('/settings/integration', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  res.json({ webhookUrl: req.tenant.integrationWebhookUrl, hasSecret: Boolean(req.tenant.integrationSecret), source: req.tenant.source, externalRef: req.tenant.externalRef })
}))

r.put('/settings/integration', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ webhookUrl: z.string().url().nullable(), rotateSecret: z.boolean().optional() }).parse(req.body)
  const secret = b.rotateSecret || !req.tenant.integrationSecret ? randomToken(32) : undefined
  await prisma.tenant.update({ where: { id: req.tenant.id }, data: { integrationWebhookUrl: b.webhookUrl, ...(secret ? { integrationSecret: secret } : {}) } })
  res.json({ webhookUrl: b.webhookUrl, secret: secret || null })
}))

r.get('/audit', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  res.json(await prisma.auditLog.findMany({ where: { tenantId: req.tenant.id }, orderBy: { createdAt: 'desc' }, take: 300 }))
}))

export default r
