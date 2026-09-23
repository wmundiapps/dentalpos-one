import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { decryptJson } from '../lib/crypto'
import { ah, badRequest, notFound, paymentRequired } from '../lib/errors'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { limitsFor } from '../services/plans'
import { getVoiceSettings, queueCall } from '../services/voice/engine'
import { cancelCall } from '../services/voice/twilio'
import { DEFAULT_WINDOWS, nextAllowedTime, validateWindows, type CallWindow } from '../services/voice/windows'

const r = Router()

r.get('/voice/settings', ah(async (req: AuthedRequest, res) => {
  const s = await getVoiceSettings(req.tenant.id)
  const next = nextAllowedTime(new Date(), (s.allowedWindows as unknown as CallWindow[]) || DEFAULT_WINDOWS, req.tenant.timezone, s.skipHolidays)
  res.json({ ...s, planAllowsVoice: limitsFor(req.tenant).voice, nextAllowedAt: next, timezone: req.tenant.timezone })
}))

const SettingsSchema = z.object({
  enabled: z.boolean().optional(),
  allowedWindows: z.array(z.object({ days: z.array(z.number().int().min(0).max(6)), start: z.string(), end: z.string() })).optional(),
  skipHolidays: z.boolean().optional(),
  recordCalls: z.boolean().optional(),
  recordingNotice: z.string().min(10).max(500).optional(),
  greeting: z.string().min(3).max(500).optional(),
  agentInstructions: z.string().max(4000).optional(),
  transferNumber: z.string().max(30).nullable().optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  retryDelayMinutes: z.number().int().min(15).max(60 * 24 * 7).optional(),
  maxConcurrent: z.number().int().min(1).max(50).optional(),
  maxTurns: z.number().int().min(2).max(30).optional(),
  voice: z.string().max(60).optional(),
})

r.put('/voice/settings', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = SettingsSchema.parse(req.body)
  if (b.enabled && !limitsFor(req.tenant).voice) throw paymentRequired('Ligações automáticas estão disponíveis a partir do plano PRO.', 'PLAN_FEATURE')
  let windows: CallWindow[] | undefined
  if (b.allowedWindows) {
    try {
      windows = validateWindows(b.allowedWindows)
    } catch (e: any) {
      throw badRequest(e.message)
    }
  }
  if (b.recordCalls && !/grava/i.test(b.recordingNotice || (await getVoiceSettings(req.tenant.id)).recordingNotice)) {
    throw badRequest('Com gravação ligada, o aviso precisa informar que a ligação será gravada.')
  }
  await getVoiceSettings(req.tenant.id)
  const s = await prisma.voiceSettings.update({
    where: { tenantId: req.tenant.id },
    data: { ...b, ...(windows ? { allowedWindows: windows as any } : {}), transferNumber: b.transferNumber === undefined ? undefined : b.transferNumber ? `+${b.transferNumber.replace(/\D/g, '')}` : null },
  })
  await audit(req.tenant.id, req.user.id, 'VOICE_SETTINGS', 'VoiceSettings', s.id, b)
  res.json(s)
}))

r.get('/voice/calls', ah(async (req: AuthedRequest, res) => {
  const status = String(req.query.status || '')
  res.json(
    await prisma.call.findMany({
      where: { tenantId: req.tenant.id, ...(status ? { status } : {}) },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  )
}))

r.get('/voice/calls/:id', ah(async (req: AuthedRequest, res) => {
  const call = await prisma.call.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id }, include: { turns: { orderBy: { createdAt: 'asc' } }, contact: true } })
  if (!call) throw notFound('Ligação não encontrada.')
  res.json(call)
}))

// Agenda uma ligação (entra na fila e respeita horários permitidos).
r.post('/voice/calls', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ contactId: z.string(), purpose: z.string().min(1).max(300), script: z.string().max(4000).optional(), at: z.string().datetime().optional() }).parse(req.body)
  if (!limitsFor(req.tenant).voice) throw paymentRequired('Ligações automáticas estão disponíveis a partir do plano PRO.', 'PLAN_FEATURE')
  const contact = await prisma.contact.findFirst({ where: { id: b.contactId, tenantId: req.tenant.id } })
  if (!contact?.phone) throw badRequest('Contato sem telefone.')
  const call = await queueCall(req.tenant, { contact, purpose: b.purpose, script: b.script, runAt: b.at ? new Date(b.at) : undefined })
  await audit(req.tenant.id, req.user.id, 'CALL_QUEUED', 'Call', call.id)
  res.status(201).json(call)
}))

r.post('/voice/calls/:id/cancel', ah(async (req: AuthedRequest, res) => {
  const call = await prisma.call.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!call) throw notFound('Ligação não encontrada.')
  if (call.status === 'QUEUED') {
    await prisma.call.update({ where: { id: call.id }, data: { status: 'CANCELED' } })
  } else if (['RINGING', 'IN_PROGRESS'].includes(call.status)) {
    if (call.providerCallSid && call.channelAccountId) {
      const acc = await prisma.channelAccount.findUnique({ where: { id: call.channelAccountId } })
      const creds = decryptJson<any>(acc?.encryptedCredentials)
      if (creds?.accountSid) await cancelCall(creds, call.providerCallSid).catch(() => null)
    }
    await prisma.call.update({ where: { id: call.id }, data: { status: 'CANCELED', endedAt: new Date() } })
  } else throw badRequest('Esta ligação já foi finalizada.')
  res.json({ ok: true })
}))

export default r
