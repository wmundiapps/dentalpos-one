import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ah } from '../lib/errors'
import { requireRole, type AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { acceptTerms, assertLeadsAccess, importLeads, leadsAccess, optOutLeads, publicLead, runSearch } from '../services/leads'
import { exportLeadsXlsx } from '../services/leads/invites'
import { companyBaseStatus, findSegments } from '../services/leads/providers'
import { linkedinAuthUrl, linkedinAvailable, syncLinkedinSource } from '../services/leads/linkedin'
import { config } from '../config'
import { badRequest, notFound } from '../lib/errors'
import { assertCleanText } from '../lib/contentFilter'

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
      mei: z.enum(['ALL', 'ONLY', 'EXCLUDE']).optional(),
      audienceId: z.string().max(40).optional(),
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
    where: { tenantId: req.tenant.id, ...(['NEW', 'IMPORTED', 'DISCARDED', 'OPTED_OUT'].includes(status) ? { status } : {}) },
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

// Planilha com WhatsApp de um clique (o link passa pelo REVAH). ?porSegmento=3 traz uma amostra para começar.
r.get('/leads/export.xlsx', ah(async (req: AuthedRequest, res) => {
  await assertLeadsAccess(req.tenant)
  const q = z.object({ status: z.string().optional(), audienceId: z.string().max(40).optional(), porSegmento: z.coerce.number().int().min(1).max(20).optional() }).parse(req.query)
  const { buffer, count } = await exportLeadsXlsx(req.tenant, { status: q.status, audienceId: q.audienceId, perSegment: q.porSegmento })
  await audit(req.tenant.id, req.user.id, 'LEADS_EXPORT', 'Lead', undefined, { ...q, rows: count })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="revah-leads-${new Date().toISOString().slice(0, 10)}.xlsx"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(buffer)
}))

// "Não quero receber": bloqueia para sempre nas buscas deste cliente e nos canais (lista de bloqueio).
r.post('/leads/optout', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ ids: z.array(z.string()).min(1).max(1000) }).parse(req.body)
  const out = await optOutLeads(req.tenant, b.ids)
  await audit(req.tenant.id, req.user.id, 'LEADS_OPT_OUT', 'Lead', undefined, out)
  res.json(out)
}))

// Públicos salvos: segmentos (CNAE), local e texto de convite escolhidos por cada cliente.
const AudienceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  cnaes: z.array(z.string().regex(/^\d{2,7}$/)).min(1).max(20),
  uf: z.string().length(2).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  meiFilter: z.enum(['ALL', 'ONLY', 'EXCLUDE']).default('ALL'),
  inviteText: z.string().trim().max(1000).nullable().optional(),
})

r.get('/leads/audiences', ah(async (req: AuthedRequest, res) => {
  const rows = await prisma.leadAudience.findMany({ where: { tenantId: req.tenant.id }, orderBy: { name: 'asc' } })
  const names = new Map((await prisma.cnaeCode.findMany({ where: { code: { in: [...new Set(rows.flatMap((a) => a.cnaes))] } } })).map((c) => [c.code, c.description]))
  res.json(rows.map((a) => ({ ...a, segments: a.cnaes.map((code) => ({ code, description: names.get(code) || code })) })))
}))

r.post('/leads/audiences', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = AudienceSchema.parse(req.body)
  assertCleanText({ 'Texto de convite': b.inviteText })
  if ((await prisma.leadAudience.count({ where: { tenantId: req.tenant.id } })) >= 50) throw badRequest('Limite de 50 públicos salvos.')
  res.status(201).json(await prisma.leadAudience.create({ data: { ...b, uf: b.uf?.toUpperCase() || null, tenantId: req.tenant.id } }))
}))

r.put('/leads/audiences/:id', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const b = AudienceSchema.parse(req.body)
  assertCleanText({ 'Texto de convite': b.inviteText })
  const out = await prisma.leadAudience.updateMany({ where: { id: req.params.id, tenantId: req.tenant.id }, data: { ...b, uf: b.uf?.toUpperCase() || null } })
  if (!out.count) throw notFound()
  res.json(await prisma.leadAudience.findUnique({ where: { id: req.params.id } }))
}))

r.delete('/leads/audiences/:id', requireRole('OWNER', 'ADMIN'), ah(async (req: AuthedRequest, res) => {
  const out = await prisma.leadAudience.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  if (!out.count) throw notFound()
  res.json({ ok: true })
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
