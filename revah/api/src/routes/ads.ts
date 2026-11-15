// REVAH Ads (add-on vendido à parte): planos de anúncio criados pela IA.
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah, notFound } from '../lib/errors'
import { assertCleanText } from '../lib/contentFilter'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { AD_GOALS, adsAccess, assertAdsAccess, generateAdPlan } from '../services/ads'
import { adsCreditCheckout, adsSubscriptionCheckout, adsWallet } from '../services/adsBilling'

const r = Router()

r.get('/ads/access', (req, res) => {
  const t = (req as AuthedRequest).tenant
  res.json({ ...adsAccess(t), subscriptionStatus: t.adsSubscriptionStatus, balanceCents: t.adsCreditCents, blocked: t.adsSpendBlocked })
})

// Cobrança em dólar pela Stripe: assinatura mensal e recarga pré-paga do saldo de gestão (5%).
r.post('/ads/subscribe', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  res.json(await adsSubscriptionCheckout(req.tenant, req.user))
}))

r.get('/ads/wallet', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  res.json(await adsWallet(req.tenant.id))
}))

r.post('/ads/credit', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ plannedSpendUsd: z.number().positive().max(1_000_000) }).parse(req.body)
  res.json(await adsCreditCheckout(req.tenant, req.user, b.plannedSpendUsd))
}))

const PlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  business: z.string().trim().min(10, 'Descreva o que a empresa vende e para quem (ao menos 10 letras).').max(1500),
  offer: z.string().trim().max(500).nullable().optional(),
  audience: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  goal: z.enum(AD_GOALS).default('MESSAGES'),
  dailyBudget: z.number().min(1).max(100000).nullable().optional(),
})

function clean(b: z.infer<typeof PlanSchema>) {
  assertCleanText({ 'Descrição do negócio': b.business, Oferta: b.offer, Público: b.audience })
}

r.get('/ads/plans', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  res.json(await prisma.adPlan.findMany({ where: { tenantId: req.tenant.id }, orderBy: { updatedAt: 'desc' }, take: 200 }))
}))

r.get('/ads/plans/:id', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  const p = await prisma.adPlan.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!p) throw notFound()
  res.json(p)
}))

r.post('/ads/plans', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  const b = PlanSchema.parse(req.body)
  clean(b)
  const p = await prisma.adPlan.create({ data: { ...b, tenantId: req.tenant.id } })
  await audit(req.tenant.id, req.user.id, 'ADS_PLAN_CREATE', 'AdPlan', p.id)
  res.status(201).json(p)
}))

r.put('/ads/plans/:id', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  const b = PlanSchema.parse(req.body)
  clean(b)
  const out = await prisma.adPlan.updateMany({ where: { id: req.params.id, tenantId: req.tenant.id }, data: b })
  if (!out.count) throw notFound()
  res.json(await prisma.adPlan.findUnique({ where: { id: req.params.id } }))
}))

r.delete('/ads/plans/:id', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  const out = await prisma.adPlan.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!out.count) throw notFound()
  res.json({ ok: true })
}))

r.post('/ads/plans/:id/generate', ah(async (req: AuthedRequest, res) => {
  assertAdsAccess(req.tenant)
  const p = await prisma.adPlan.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!p) throw notFound()
  res.json(await generateAdPlan(req.tenant, p))
}))

export default r
