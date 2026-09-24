import type { Lead, Tenant, User } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { badRequest, paymentRequired } from '../../lib/errors'
import { emitEvent } from '../automations'
import { upsertContact } from '../contacts'
import { lookupCompany, searchLocalBusinesses, type RawLead } from './providers'
import { currentTerms } from './terms'

// Resposta pública: sem origem/fonte.
export function publicLead(l: Lead) {
  const { origin: _o, originRef: _r, ...rest } = l
  return rest
}

export async function leadsAccess(tenant: Tenant) {
  const terms = currentTerms()
  const contract = await prisma.leadsContract.findFirst({ where: { tenantId: tenant.id, termsVersion: terms.version }, orderBy: { acceptedAt: 'desc' } })
  return { addonActive: tenant.leadsAddonActive, contractAccepted: Boolean(contract), contract, terms }
}

export async function assertLeadsAccess(tenant: Tenant) {
  const a = await leadsAccess(tenant)
  if (!a.addonActive) throw paymentRequired('O REVAH Leads é um add-on contratado à parte. Fale com o comercial ou contrate em Assinatura.', 'LEADS_ADDON_REQUIRED')
  if (!a.contractAccepted) throw paymentRequired('Aceite o termo de responsabilidade do REVAH Leads para continuar.', 'LEADS_TERMS_REQUIRED')
}

export async function acceptTerms(tenant: Tenant, user: User, p: { signerName: string; signerDocument: string; ip?: string; userAgent?: string }) {
  const t = currentTerms()
  return prisma.leadsContract.create({
    data: { tenantId: tenant.id, userId: user.id, signerName: p.signerName, signerDocument: p.signerDocument.replace(/\D/g, ''), termsVersion: t.version, termsHash: t.hash, ip: p.ip, userAgent: p.userAgent?.slice(0, 300) },
  })
}

async function saveLeads(tenantId: string, searchId: string | null, raws: RawLead[]) {
  const out: Lead[] = []
  for (const r of raws) {
    const lead = await prisma.lead.upsert({
      where: { tenantId_origin_originRef: { tenantId, origin: r.origin, originRef: r.originRef } },
      create: { tenantId, searchId, ...r },
      update: { searchId: searchId ?? undefined, name: r.name, phone: r.phone ?? undefined, email: r.email ?? undefined },
    })
    out.push(lead)
  }
  return out
}

export async function runSearch(tenant: Tenant, user: User, input: { kind: 'COMPANY' | 'LOCAL'; documents?: string[]; query?: string; city?: string; limit?: number }) {
  await assertLeadsAccess(tenant)
  let raws: RawLead[] = []
  let origin = ''
  if (input.kind === 'COMPANY') {
    const docs = (input.documents || []).map((d) => d.replace(/\D/g, '')).filter((d) => d.length === 14).slice(0, 50)
    if (!docs.length) throw badRequest('Informe ao menos um CNPJ válido.')
    origin = 'cnpj_public'
    for (const doc of docs) {
      const r = await lookupCompany(doc).catch(() => null)
      if (r) raws.push(r)
    }
  } else {
    if (!input.query?.trim()) throw badRequest('Informe o segmento ou termo de busca.')
    origin = 'places'
    raws = await searchLocalBusinesses(input.query.trim(), input.city, input.limit || 20)
  }
  const search = await prisma.leadSearch.create({
    data: { tenantId: tenant.id, userId: user.id, kind: input.kind, query: { documents: input.documents, query: input.query, city: input.city } as any, origin, resultCount: raws.length },
  })
  const leads = await saveLeads(tenant.id, search.id, raws)
  return { searchId: search.id, leads: leads.map(publicLead) }
}

export async function ingestAdLead(tenantId: string, raw: RawLead) {
  const [lead] = await saveLeads(tenantId, null, [raw])
  return lead
}

export async function importLeads(tenant: Tenant, ids: string[], tags: string[] = []) {
  await assertLeadsAccess(tenant)
  const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id, id: { in: ids }, status: 'NEW' } })
  let imported = 0
  for (const l of leads) {
    if (!l.phone && !l.email) continue
    const { contact } = await upsertContact(
      tenant.id,
      { name: l.name, company: l.company, document: l.document, phone: l.phone, email: l.email, source: 'LEADS', tags: ['Leads', ...tags], customFields: { cidade: l.city, uf: l.state, segmento: l.category, site: l.website } },
      { emit: false },
    )
    await prisma.lead.update({ where: { id: l.id }, data: { status: 'IMPORTED', contactId: contact.id } })
    await emitEvent(tenant.id, 'lead.imported', { contactId: contact.id, data: { segmento: l.category } })
    imported++
  }
  return { imported, skipped: leads.length - imported }
}
