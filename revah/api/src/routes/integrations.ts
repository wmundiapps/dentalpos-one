import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, badRequest } from '../lib/errors'
import { isChannel } from '../lib/normalize'
import { requireApiKey, type AuthedRequest } from '../middleware/auth'
import { emitEvent } from '../services/automations'
import { upsertContact } from '../services/contacts'
import { ingestDentalposEvent, provisionClinic, setLicense, syncPatients, verifyServerSignature } from '../services/dentalpos'
import { sendMessage } from '../services/messaging'
import { trialStatus } from '../services/plans'

const r = Router()

// --- DentalPos One: servidor-a-servidor com segredo compartilhado ---------
r.post(
  '/integrations/dentalpos/provision',
  ah(async (req: AuthedRequest, res) => {
    verifyServerSignature(req.rawBody, req.headers['x-revah-timestamp'] as string, req.headers['x-revah-signature'] as string)
    res.json(await provisionClinic(req.body))
  }),
)

r.post(
  '/integrations/dentalpos/license',
  ah(async (req: AuthedRequest, res) => {
    verifyServerSignature(req.rawBody, req.headers['x-revah-timestamp'] as string, req.headers['x-revah-signature'] as string)
    res.json(await setLicense(req.body))
  }),
)

// --- DentalPos One: por clínica, com a chave de API do tenant --------------
r.post(
  '/integrations/dentalpos/events',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [req.body]
    if (events.length > 500) throw badRequest('Envie no máximo 500 eventos por vez.')
    const results = []
    for (const e of events) {
      try {
        results.push({ id: e?.id, ...(await ingestDentalposEvent(req.tenant, e)) })
      } catch (err: any) {
        results.push({ id: e?.id, error: err?.message || String(err) })
      }
    }
    res.json(Array.isArray(req.body?.events) ? { results } : results[0])
  }),
)

r.post(
  '/integrations/dentalpos/patients/sync',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => res.json(await syncPatients(req.tenant, req.body?.patients))),
)

r.get(
  '/integrations/dentalpos/status',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const t = req.tenant
    const channels = await prisma.channelAccount.findMany({ where: { tenantId: t.id, isActive: true }, select: { channel: true, provider: true, label: true } })
    res.json({ tenantId: t.id, plan: t.plan, status: t.status, trial: trialStatus(t), channels })
  }),
)

// --- API pública v1 (qualquer sistema) --------------------------------------
r.post(
  '/v1/contacts',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const b = z
      .object({ name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), company: z.string().optional(), externalRef: z.string().optional(), tags: z.array(z.string()).optional(), customFields: z.record(z.any()).optional() })
      .parse(req.body)
    const out = await upsertContact(req.tenant.id, { ...b, source: 'API' })
    res.status(out.created ? 201 : 200).json(out)
  }),
)

r.post(
  '/v1/messages',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const b = z
      .object({ channel: z.string(), to: z.string(), text: z.string().max(4096).default(''), subject: z.string().optional(), template: z.object({ name: z.string(), language: z.string().optional(), params: z.array(z.string()).optional() }).optional() })
      .parse(req.body)
    if (!isChannel(b.channel) || b.channel === 'VOICE') throw badRequest('Canal inválido.')
    const out = await sendMessage({ tenant: req.tenant, channel: b.channel, destination: b.to, text: b.text, subject: b.subject, template: b.template })
    res.status(out.ok ? 201 : 422).json({ ok: out.ok, id: out.message.id, status: out.message.status, error: out.ok ? null : out.error, code: out.ok ? null : out.code })
  }),
)

r.post(
  '/v1/events',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ type: z.string().min(1).max(120), contact: z.object({ phone: z.string().optional(), email: z.string().optional(), name: z.string().optional(), externalRef: z.string().optional() }), data: z.record(z.any()).optional() }).parse(req.body)
    const { contact } = await upsertContact(req.tenant.id, { ...b.contact, source: 'API' })
    res.json({ contactId: contact.id, actionsScheduled: await emitEvent(req.tenant.id, `api.${b.type}`, { contactId: contact.id, data: b.data || {} }) })
  }),
)

r.get(
  '/v1/messages/:id',
  requireApiKey,
  ah(async (req: AuthedRequest, res) => {
    const m = await prisma.message.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id }, select: { id: true, channel: true, status: true, error: true, createdAt: true, sentAt: true } })
    if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' })
    res.json(m)
  }),
)

export default r
