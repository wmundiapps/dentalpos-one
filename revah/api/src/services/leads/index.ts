import type { Lead, Tenant, User } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { sha256 } from '../../lib/crypto'
import { suppress } from '../suppression'
import { badRequest, paymentRequired } from '../../lib/errors'
import { emitEvent } from '../automations'
import { upsertContact } from '../contacts'
import { findSegments, lookupCompany, searchCompanies, searchLocalBusinesses, type RawLead } from './providers'
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

// "Não quero receber" do REVAH Leads, por cliente: hash do CNPJ, telefone e e-mail (o dado em si não fica guardado).
export const leadBlockHash = (kind: 'cnpj' | 'phone' | 'email', value: string) => sha256(`lead-block:${kind}:${value.trim().toLowerCase()}`)

function hashesOf(r: { document?: string | null; phone?: string | null; email?: string | null }) {
  return [
    r.document ? leadBlockHash('cnpj', r.document) : null,
    r.phone ? leadBlockHash('phone', r.phone) : null,
    r.email ? leadBlockHash('email', r.email) : null,
  ].filter(Boolean) as string[]
}

// Tira da lista quem pediu para sair: bloqueio do Leads (hash) e a lista de bloqueio dos canais do cliente.
export async function withoutBlocked<T extends { document?: string | null; phone?: string | null; email?: string | null }>(tenantId: string, rows: T[]) {
  if (!rows.length) return rows
  const hashes = rows.flatMap(hashesOf)
  const blocked = new Set((await prisma.leadBlock.findMany({ where: { tenantId, hash: { in: hashes } }, select: { hash: true } })).map((b) => b.hash))
  const values = rows.flatMap((r) => [r.phone, r.email]).filter(Boolean) as string[]
  const suppressed = new Set((await prisma.suppression.findMany({ where: { tenantId, value: { in: values } }, select: { value: true } })).map((s) => s.value))
  return rows.filter((r) => !hashesOf(r).some((h) => blocked.has(h)) && !(r.phone && suppressed.has(r.phone)) && !(r.email && suppressed.has(r.email)))
}

// Marca "não quero receber": bloqueia para sempre nas buscas deste cliente, coloca o telefone e o e-mail
// na lista de bloqueio dos canais e apaga o contato do lead.
export async function optOutLeads(tenant: Tenant, ids: string[]) {
  const leads = await prisma.lead.findMany({ where: { tenantId: tenant.id, id: { in: ids } } })
  for (const l of leads) {
    await prisma.leadBlock.createMany({ data: hashesOf(l).map((hash) => ({ tenantId: tenant.id, hash })), skipDuplicates: true })
    if (l.phone) for (const ch of ['WHATSAPP', 'SMS', 'VOICE'] as const) await suppress(tenant.id, ch, l.phone, 'OPT_OUT', { contactId: l.contactId, detail: 'REVAH Leads: pediu para não receber' })
    if (l.email) await suppress(tenant.id, 'EMAIL', l.email, 'OPT_OUT', { contactId: l.contactId, detail: 'REVAH Leads: pediu para não receber' })
    await prisma.lead.update({ where: { id: l.id }, data: { status: 'OPTED_OUT', phone: null, email: null } })
  }
  return { optedOut: leads.length }
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

export async function runSearch(
  tenant: Tenant,
  user: User,
  input: { kind: 'COMPANY' | 'LOCAL' | 'SEGMENT'; documents?: string[]; query?: string; city?: string; uf?: string; cnaes?: string[]; limit?: number; mei?: 'ALL' | 'ONLY' | 'EXCLUDE'; audienceId?: string },
) {
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
    raws = await withoutBlocked(tenant.id, raws)
  } else if (input.kind === 'SEGMENT') {
    // Público salvo do cliente: usa os segmentos e o local guardados (o que vier na busca tem prioridade).
    if (input.audienceId) {
      const a = await prisma.leadAudience.findFirst({ where: { id: input.audienceId, tenantId: tenant.id } })
      if (!a) throw badRequest('Público não encontrado.')
      input = { ...input, cnaes: input.cnaes?.length ? input.cnaes : a.cnaes, uf: input.uf || a.uf || undefined, city: input.city || a.city || undefined, mei: input.mei || (a.meiFilter as any) }
    }
    let cnaes = (input.cnaes || []).map((c) => c.replace(/\D/g, '')).filter((c) => c.length >= 2).slice(0, 20)
    if (!cnaes.length && input.query?.trim()) cnaes = (await findSegments(input.query.trim(), 20)).map((s) => s.code)
    if (!cnaes.length) throw badRequest('Nenhum segmento encontrado. Escolha um segmento da lista.')
    if (!input.uf && !input.city) throw badRequest('Informe o estado ou a cidade.')
    origin = 'cnpj_public'
    // Não repete empresas que esta conta já recebeu.
    const seen = await prisma.lead.findMany({ where: { tenantId: tenant.id, origin: 'cnpj_public' }, select: { originRef: true }, take: 20000 })
    const limit = input.limit || 50
    // Busca um pouco a mais para repor quem está na lista de "não quero receber".
    const found = await searchCompanies({ cnaes, uf: input.uf, city: input.city, limit: Math.ceil(limit * 1.3) + 10, excludeRefs: seen.map((s) => s.originRef!).filter(Boolean), mei: input.mei })
    raws = (await withoutBlocked(tenant.id, found)).slice(0, limit)
  } else {
    if (!input.query?.trim()) throw badRequest('Informe o segmento ou termo de busca.')
    origin = 'places'
    raws = await withoutBlocked(tenant.id, await searchLocalBusinesses(input.query.trim(), input.city, input.limit || 20))
  }
  const search = await prisma.leadSearch.create({
    data: { tenantId: tenant.id, userId: user.id, kind: input.kind, query: { documents: input.documents, query: input.query, city: input.city, uf: input.uf, cnaes: input.cnaes } as any, origin, resultCount: raws.length },
  })
  const leads = await saveLeads(tenant.id, search.id, raws)
  return { searchId: search.id, leads: leads.map(publicLead) }
}

export async function ingestAdLead(tenantId: string, raw: RawLead) {
  const [lead] = await saveLeads(tenantId, null, [raw])
  return lead
}

// Lead de formulário de anúncio (Meta, LinkedIn): salva e já envia ao CRM quando tem contato.
export async function ingestAndImportAdLead(tenantId: string, raw: RawLead, tag: string, origem: string) {
  const existing = await prisma.lead.findUnique({ where: { tenantId_origin_originRef: { tenantId, origin: raw.origin, originRef: raw.originRef } } })
  if (existing?.status === 'IMPORTED') return existing
  const lead = await ingestAdLead(tenantId, raw)
  if (!raw.phone && !raw.email) return lead
  const { contact } = await upsertContact(tenantId, { name: raw.name, phone: raw.phone, email: raw.email, company: raw.company, source: 'LEADS', tags: [tag] }, { emit: false })
  await prisma.lead.update({ where: { id: lead.id }, data: { status: 'IMPORTED', contactId: contact.id } })
  await emitEvent(tenantId, 'lead.imported', { contactId: contact.id, data: { origem } })
  return lead
}

export async function importLeads(tenant: Tenant, ids: string[], tags: string[] = []) {
  await assertLeadsAccess(tenant)
  const all = await prisma.lead.findMany({ where: { tenantId: tenant.id, id: { in: ids }, status: 'NEW' } })
  const leads = await withoutBlocked(tenant.id, all)
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
  return { imported, skipped: all.length - imported }
}
