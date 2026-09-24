import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, notFound, paymentRequired } from '../lib/errors'
import type { AuthedRequest } from '../middleware/auth'
import { assertCanAddTemplate, limitsFor } from '../services/plans'
import { TEMPLATE_LIBRARY } from '../services/templateLibrary'

const r = Router()

// Biblioteca: conteúdo completo liberado no teste de 14 dias e nos planos pagos.
r.get('/templates/library', (req, res) => {
  const t = (req as AuthedRequest).tenant
  const unlocked = t.status !== 'PENDING_PAYMENT'
  res.json({
    unlocked,
    items: TEMPLATE_LIBRARY.map((x) => ({
      ...x,
      body: unlocked ? x.body : `${x.body.slice(0, 40)}…`,
      variables: [...new Set(x.body.match(/\{\{\w+\}\}/g) || [])],
    })),
  })
})

r.get('/templates', ah(async (req: AuthedRequest, res) => {
  const items = await prisma.messageTemplate.findMany({ where: { tenantId: req.tenant.id }, orderBy: { name: 'asc' } })
  res.json({ items, limit: limitsFor(req.tenant).templates })
}))

const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  segment: z.string().trim().max(60).optional(),
  channel: z.string().nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(4096),
})

r.post('/templates', ah(async (req: AuthedRequest, res) => {
  const b = TemplateSchema.parse(req.body)
  await assertCanAddTemplate(req.tenant)
  res.status(201).json(await prisma.messageTemplate.create({ data: { tenantId: req.tenant.id, ...b, segment: b.segment || 'Geral' } }))
}))

// Copia um modelo da biblioteca para a empresa.
r.post('/templates/library/:key/use', ah(async (req: AuthedRequest, res) => {
  if (req.tenant.status === 'PENDING_PAYMENT') throw paymentRequired('Cadastre a forma de pagamento para liberar os modelos no teste de 14 dias.', 'PAYMENT_METHOD_REQUIRED')
  const item = TEMPLATE_LIBRARY.find((x) => x.key === req.params.key)
  if (!item) throw notFound('Modelo não encontrado.')
  await assertCanAddTemplate(req.tenant)
  res.status(201).json(await prisma.messageTemplate.create({ data: { tenantId: req.tenant.id, name: item.name, segment: item.segment, body: item.body } }))
}))

r.patch('/templates/:id', ah(async (req: AuthedRequest, res) => {
  const found = await prisma.messageTemplate.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!found) throw notFound('Template não encontrado.')
  res.json(await prisma.messageTemplate.update({ where: { id: found.id }, data: TemplateSchema.partial().parse(req.body) }))
}))

r.delete('/templates/:id', ah(async (req: AuthedRequest, res) => {
  await prisma.messageTemplate.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  res.json({ ok: true })
}))

export default r
