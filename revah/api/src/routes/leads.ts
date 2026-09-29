import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah } from '../lib/errors'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { acceptTerms, importLeads, leadsAccess, publicLead, runSearch } from '../services/leads'
import { companyBaseStatus, findSegments } from '../services/leads/providers'
import { linkedinAuthUrl, linkedinAvailable, syncLinkedinSource } from '../services/leads/linkedin'
import { config } from '../config'
import { notFound } from '../lib/errors'

const r = Router()

r.get('/leads/access', ah(async (req: AuthedRequest, res) => {
  const a = await leadsAccess(req.tenant)
  res.json({ addonActive: a.addonActive, contractAccepted: a.contractAccepted, acceptedAt: a.contract?.acceptedAt || null, terms: { version: a.terms.version, text: a.terms.text } })
}))

r.post('/leads/terms/accept', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = z.object({ signerName: z.string().trim().min(3), signerDocument: z.string().min(11), agree: z.literal(true) }).parse(req.body)
  const c = await acceptTerms(req.tenant, req.user, { ...b, ip: req.ip, userAgent: String(req.headers['user-agent'] || '') })
  await audit(req.tenant.id, req.user.id, 'LEADS_TERMS_ACCEPTED', 'LeadsContract', c.id, { version: c.termsVersion })
  res.status(201).json({ ok: true, acceptedAt: c.acceptedAt, version: c.termsVersion })
}))

// Tipos de busca expostos ao cliente — sem revelar as fontes.
r.post('/leads/search', ah(async (req: AuthedRequest, res) => {
  const b = z
    .object({
      kind: z.enum(['COMPANY', 'LOCAL', 'SEGMENT']),
      documents: z.array(z.string()).max(50).optional(),
      query: z.string().max(200).optional(),
      city: z.string().max(120).optional(),
      uf: z.string().length(2).optional(),
      cnaes: z.array(z.string().max(7)).max(20).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .parse(req.body)
  if (b.kind === 'LOCAL' && b.limit) b.limit = Math.min(b.limit, 60)
  res.json(await runSearch(req.tenant, req.user, b))
}))

// Lista de segmentos (CNAE) para a busca por segmento.
r.get('/leads/segments', ah(async (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim()
  res.json(q.length < 2 ? [] : (await findSegments(q, 30)).map((s) => ({ code: s.code, description: s.description })))
}))

r.get('/leads/base', ah(async (_req: AuthedRequest, res) => {
  res.json(await companyBaseStatus())
}))

r.get('/leads', ah(async (req: AuthedRequest, res) => {
  const status = String(req.query.status || '')
  const rows = await prisma.lead.findMany({
    where: { tenantId: req.tenant.id, ...(['NEW', 'IMPORTED', 'DISCARDED'].includes(status) ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  res.json(rows.map(publicLead))
}))

r.post('/leads/import', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ ids: z.array(z.string()).min(1).max(1000), tags: z.array(z.string()).optional() }).parse(req.body)
  const out = await importLeads(req.tenant, b.ids, b.tags)
  await audit(req.tenant.id, req.user.id, 'LEADS_IMPORT', 'Lead', undefined, out)
  res.json(out)
}))

r.post('/leads/discard', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ ids: z.array(z.string()).min(1).max(1000) }).parse(req.body)
  const r2 = await prisma.lead.updateMany({ where: { tenantId: req.tenant.id, id: { in: b.ids }, status: 'NEW' }, data: { status: 'DISCARDED' } })
  res.json({ discarded: r2.count })
}))

// Fontes conectadas (formulários de anúncios do LinkedIn). O Meta Lead Ads chega pela conexão da página em Canais.
r.get('/leads/sources', ah(async (req: AuthedRequest, res) => {
  const rows = await prisma.leadSource.findMany({ where: { tenantId: req.tenant.id }, orderBy: { createdAt: 'asc' } })
  res.json({
    linkedinAvailable: linkedinAvailable(),
    placesAvailable: Boolean(config.leads.googlePlacesKey),
    sources: rows.map(({ encryptedCredentials: _c, ...s }) => s),
  })
}))

r.post('/leads/sources/linkedin/connect', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  res.json({ url: linkedinAuthUrl(req.tenant.id, req.user.id) })
}))

r.post('/leads/sources/:id/sync', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const s = await prisma.leadSource.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!s) throw notFound()
  res.json({ imported: await syncLinkedinSource(s) })
}))

r.delete('/leads/sources/:id', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const out = await prisma.leadSource.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!out.count) throw notFound()
  await audit(req.tenant.id, req.user.id, 'LEADS_SOURCE_REMOVED', 'LeadSource', req.params.id)
  res.json({ ok: true })
}))

export default r
