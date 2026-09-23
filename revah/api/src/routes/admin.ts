import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, notFound } from '../lib/errors'
import type { AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'

// Backoffice WMundi (REVAH_SUPERADMIN_EMAILS).
const r = Router()

r.get('/admin/tenants', ah(async (req, res) => {
  const q = String(req.query.q || '')
  const rows = await prisma.tenant.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { users: { some: { email: { contains: q.toLowerCase() } } } }] } : {},
    include: { subscription: true, _count: { select: { contacts: true, users: true, campaigns: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  res.json(rows.map(({ integrationSecret: _s, ...t }) => t))
}))

r.patch('/admin/tenants/:id', ah(async (req: AuthedRequest, res) => {
  const b = z
    .object({
      plan: z.enum(['TRIAL', 'START', 'PRO', 'ENTERPRISE']).optional(),
      status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED']).optional(),
      leadsAddonActive: z.boolean().optional(),
      trialCampaignsUsed: z.number().int().min(0).max(2).optional(),
    })
    .parse(req.body)
  const t = await prisma.tenant.findUnique({ where: { id: req.params.id } })
  if (!t) throw notFound()
  const updated = await prisma.tenant.update({ where: { id: t.id }, data: b })
  await audit(t.id, req.user.id, 'ADMIN_TENANT_UPDATE', 'Tenant', t.id, b)
  res.json(updated)
}))

r.get('/admin/sales-inquiries', ah(async (_req, res) => {
  res.json(await prisma.salesInquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }))
}))

r.get('/admin/billing-events', ah(async (_req, res) => {
  res.json(await prisma.billingEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, stripeEventId: true, type: true, status: true, error: true, createdAt: true } }))
}))

export default r
