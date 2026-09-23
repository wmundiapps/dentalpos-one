import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, badRequest, notFound } from '../lib/errors'
import type { AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { DENTALPOS_AUTOMATION_TEMPLATES, emitEvent, TRIGGERS } from '../services/automations'

const r = Router()

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_message'),
    channel: z.enum(['WHATSAPP', 'SMS', 'TELEGRAM', 'EMAIL', 'INSTAGRAM', 'MESSENGER']),
    template: z.string().min(1).max(4096),
    subject: z.string().max(200).optional(),
    waTemplate: z.object({ name: z.string(), language: z.string().optional(), params: z.array(z.string()).optional() }).optional(),
    optOutHint: z.boolean().optional(),
    delayMinutes: z.number().int().min(0).max(60 * 24 * 60).optional(),
  }),
  z.object({ type: z.literal('place_call'), purpose: z.string().min(1).max(300), script: z.string().min(1).max(4000), delayMinutes: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('add_tag'), tag: z.string().min(1).max(60), delayMinutes: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('remove_tag'), tag: z.string().min(1).max(60), delayMinutes: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('webhook'), url: z.string().url(), delayMinutes: z.number().int().min(0).optional() }),
])

const AutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.string().min(1).max(120),
  conditions: z.object({ tag: z.string().optional(), equals: z.record(z.union([z.string(), z.number(), z.boolean()])).optional() }).nullable().optional(),
  actions: z.array(ActionSchema).min(1).max(10),
  isActive: z.boolean().optional(),
})

r.get('/automations/triggers', (_req, res) => res.json(TRIGGERS))

r.get('/automations', ah(async (req: AuthedRequest, res) => {
  res.json(await prisma.automation.findMany({ where: { tenantId: req.tenant.id }, orderBy: { createdAt: 'desc' } }))
}))

r.post('/automations', ah(async (req: AuthedRequest, res) => {
  const b = AutomationSchema.parse(req.body)
  const a = await prisma.automation.create({ data: { tenantId: req.tenant.id, name: b.name, trigger: b.trigger, conditions: (b.conditions as any) || undefined, actions: b.actions as any, isActive: b.isActive ?? true } })
  await audit(req.tenant.id, req.user.id, 'AUTOMATION_CREATE', 'Automation', a.id)
  res.status(201).json(a)
}))

r.patch('/automations/:id', ah(async (req: AuthedRequest, res) => {
  const found = await prisma.automation.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!found) throw notFound('Automação não encontrada.')
  const b = AutomationSchema.partial().parse(req.body)
  res.json(
    await prisma.automation.update({
      where: { id: found.id },
      data: {
        ...(b.name ? { name: b.name } : {}),
        ...(b.trigger ? { trigger: b.trigger } : {}),
        ...(b.conditions !== undefined ? { conditions: (b.conditions as any) ?? undefined } : {}),
        ...(b.actions ? { actions: b.actions as any } : {}),
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
      },
    }),
  )
}))

r.delete('/automations/:id', ah(async (req: AuthedRequest, res) => {
  await prisma.automation.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  res.json({ ok: true })
}))

// Instala os modelos prontos para clínicas do DentalPos One.
r.post('/automations/templates/dentalpos', ah(async (req: AuthedRequest, res) => {
  let created = 0
  for (const t of DENTALPOS_AUTOMATION_TEMPLATES) {
    const exists = await prisma.automation.findFirst({ where: { tenantId: req.tenant.id, trigger: t.trigger, name: t.name } })
    if (exists) continue
    await prisma.automation.create({ data: { tenantId: req.tenant.id, name: t.name, trigger: t.trigger, actions: t.actions as any } })
    created++
  }
  res.json({ created })
}))

// Dispara manualmente um gatilho para testar (ex.: com um contato de teste).
r.post('/automations/test-event', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ trigger: z.string(), contactId: z.string(), data: z.record(z.any()).optional() }).parse(req.body)
  const c = await prisma.contact.findFirst({ where: { id: b.contactId, tenantId: req.tenant.id } })
  if (!c) throw badRequest('Contato inválido.')
  res.json({ scheduled: await emitEvent(req.tenant.id, b.trigger, { contactId: c.id, data: b.data || {} }) })
}))

export default r
