import { Router } from 'express'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { ah, badRequest, notFound } from '../lib/errors'
import { parseCsv, pickField } from '../lib/csv'
import { CHANNELS, isChannel, normalizeDestination } from '../lib/normalize'
import type { AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { applyTags, contactTimeline, removeTags, upsertContact } from '../services/contacts'
import { suppress, unsuppress } from '../services/suppression'

const r = Router()

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  telegramChatId: z.string().max(80).nullable().optional(),
  instagramId: z.string().max(80).nullable().optional(),
  messengerId: z.string().max(80).nullable().optional(),
  document: z.string().max(30).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  customFields: z.record(z.any()).nullable().optional(),
  tags: z.array(z.string().max(60)).optional(),
})

r.get(
  '/contacts',
  ah(async (req: AuthedRequest, res) => {
    const q = String(req.query.q || '').trim()
    const tagId = String(req.query.tagId || '')
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)))
    const where: Prisma.ContactWhereInput = {
      tenantId: req.tenant.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q.toLowerCase() } },
              { phone: { contains: q.replace(/\D/g, '') || q } },
              { company: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(tagId ? { tags: { some: { tagId } } } : {}),
    }
    const [total, items] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        include: { tags: { include: { tag: true } } },
        orderBy: [{ lastInteractionAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    res.json({ total, page, pageSize, items: items.map((c) => ({ ...c, tags: c.tags.map((t) => t.tag) })) })
  }),
)

r.post(
  '/contacts',
  ah(async (req: AuthedRequest, res) => {
    const b = ContactSchema.parse(req.body)
    if (!b.phone && !b.email && !b.telegramChatId && !b.instagramId && !b.messengerId) throw badRequest('Informe ao menos um telefone, e-mail ou identificador de canal.')
    const { contact, created } = await upsertContact(req.tenant.id, { ...b, source: 'MANUAL' })
    if (b.phone && !contact.phone) throw badRequest('Telefone inválido.')
    await audit(req.tenant.id, req.user.id, created ? 'CONTACT_CREATE' : 'CONTACT_MERGE', 'Contact', contact.id)
    res.status(created ? 201 : 200).json({ contact, created })
  }),
)

r.get(
  '/contacts/:id',
  ah(async (req: AuthedRequest, res) => {
    const contact = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id }, include: { tags: { include: { tag: true } } } })
    if (!contact) throw notFound('Contato não encontrado.')
    const [suppressions, consents] = await Promise.all([
      prisma.suppression.findMany({ where: { tenantId: req.tenant.id, OR: [{ contactId: contact.id }, { value: { in: [contact.phone, contact.email, contact.telegramChatId].filter(Boolean) as string[] } }] } }),
      prisma.consent.findMany({ where: { tenantId: req.tenant.id, contactId: contact.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ])
    res.json({ ...contact, tags: contact.tags.map((t) => t.tag), suppressions, consents })
  }),
)

r.patch(
  '/contacts/:id',
  ah(async (req: AuthedRequest, res) => {
    const b = ContactSchema.parse(req.body)
    const found = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Contato não encontrado.')
    const data: Prisma.ContactUpdateInput = {}
    if (b.name !== undefined) data.name = b.name
    if (b.phone !== undefined) {
      const p = b.phone ? normalizeDestination('WHATSAPP', b.phone) : null
      if (b.phone && !p) throw badRequest('Telefone inválido.')
      data.phone = p
    }
    if (b.email !== undefined) {
      const e = b.email ? normalizeDestination('EMAIL', b.email) : null
      if (b.email && !e) throw badRequest('E-mail inválido.')
      data.email = e
    }
    for (const k of ['telegramChatId', 'instagramId', 'messengerId', 'company', 'notes'] as const) if (b[k] !== undefined) (data as any)[k] = b[k]
    if (b.document !== undefined) data.document = b.document?.replace(/\D/g, '') || null
    if (b.customFields !== undefined) data.customFields = (b.customFields as any) ?? undefined
    const contact = await prisma.contact.update({ where: { id: found.id }, data })
    if (b.tags) {
      const current = await prisma.contactTag.findMany({ where: { contactId: found.id }, include: { tag: true } })
      const toRemove = current.filter((t) => !b.tags!.includes(t.tag.name)).map((t) => t.tag.name)
      if (toRemove.length) await removeTags(req.tenant.id, found.id, toRemove)
      await applyTags(req.tenant.id, found.id, b.tags)
    }
    await audit(req.tenant.id, req.user.id, 'CONTACT_UPDATE', 'Contact', contact.id)
    res.json(contact)
  }),
)

r.delete(
  '/contacts/:id',
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Contato não encontrado.')
    // A suppression list é mantida mesmo após excluir o contato (evita reenvio após reimportação).
    await prisma.contact.delete({ where: { id: found.id } })
    await audit(req.tenant.id, req.user.id, 'CONTACT_DELETE', 'Contact', found.id, { name: found.name })
    res.json({ ok: true })
  }),
)

r.get(
  '/contacts/:id/timeline',
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Contato não encontrado.')
    res.json(await contactTimeline(req.tenant.id, found.id))
  }),
)

r.post(
  '/contacts/:id/notes',
  ah(async (req: AuthedRequest, res) => {
    const body = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body).body
    const found = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Contato não encontrado.')
    res.status(201).json(await prisma.note.create({ data: { tenantId: req.tenant.id, contactId: found.id, userId: req.user.id, body } }))
  }),
)

// Opt-out / opt-in manual por canal.
r.post(
  '/contacts/:id/consent',
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ channel: z.string(), granted: z.boolean(), evidence: z.string().max(500).optional() }).parse(req.body)
    if (!isChannel(b.channel)) throw badRequest('Canal inválido.')
    const c = await prisma.contact.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!c) throw notFound('Contato não encontrado.')
    const field = { WHATSAPP: c.phone, SMS: c.phone, VOICE: c.phone, EMAIL: c.email, TELEGRAM: c.telegramChatId, INSTAGRAM: c.instagramId, MESSENGER: c.messengerId }[b.channel]
    if (!field) throw badRequest('Contato não tem endereço neste canal.')
    if (b.granted) {
      if (!b.evidence) throw badRequest('Para reativar, registre a evidência do consentimento (ex.: "cliente pediu por WhatsApp em 10/09").')
      await unsuppress(req.tenant.id, b.channel, field, c.id, b.evidence)
    } else await suppress(req.tenant.id, b.channel, field, 'MANUAL', { contactId: c.id, detail: b.evidence || `Registrado por ${req.user.name}` })
    await audit(req.tenant.id, req.user.id, b.granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED', 'Contact', c.id, b)
    res.json({ ok: true })
  }),
)

// Importação CSV (texto do arquivo no corpo).
r.post(
  '/contacts/import',
  ah(async (req: AuthedRequest, res) => {
    const b = z.object({ csv: z.string().min(1).max(5_000_000), tags: z.array(z.string()).optional() }).parse(req.body)
    const rows = parseCsv(b.csv)
    if (!rows.length) throw badRequest('Arquivo vazio ou sem cabeçalho.')
    if (rows.length > 20_000) throw badRequest('Importe no máximo 20.000 linhas por vez.')
    let created = 0
    let updated = 0
    const invalid: { line: number; reason: string }[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const phone = pickField(row, 'phone')
      const email = pickField(row, 'email')
      const pn = phone ? normalizeDestination('WHATSAPP', phone) : null
      const em = email ? normalizeDestination('EMAIL', email) : null
      if (!pn && !em) {
        invalid.push({ line: i + 2, reason: 'Sem telefone ou e-mail válido' })
        continue
      }
      const rowTags = pickField(row, 'tags')
        .split(/[|,]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const r2 = await upsertContact(
        req.tenant.id,
        { name: pickField(row, 'name'), phone: pn, email: em, company: pickField(row, 'company'), document: pickField(row, 'document'), source: 'IMPORT', tags: [...(b.tags || []), ...rowTags] },
        { emit: false },
      )
      if (r2.created) created++
      else updated++
    }
    await audit(req.tenant.id, req.user.id, 'CONTACT_IMPORT', 'Contact', undefined, { created, updated, invalid: invalid.length })
    res.json({ created, updated, invalid })
  }),
)

r.get('/tags', ah(async (req: AuthedRequest, res) => {
  const tags = await prisma.tag.findMany({ where: { tenantId: req.tenant.id }, include: { _count: { select: { contacts: true } } }, orderBy: { name: 'asc' } })
  res.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color, contacts: t._count.contacts })))
}))

r.post('/tags', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(60), color: z.string().max(20).optional() }).parse(req.body)
  res.status(201).json(await prisma.tag.upsert({ where: { tenantId_name: { tenantId: req.tenant.id, name: b.name } }, create: { tenantId: req.tenant.id, ...b }, update: { color: b.color } }))
}))

r.delete('/tags/:id', ah(async (req: AuthedRequest, res) => {
  await prisma.tag.deleteMany({ where: { id: req.params.id, tenantId: req.tenant.id } })
  res.json({ ok: true })
}))

r.post('/contacts/bulk-tag', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ contactIds: z.array(z.string()).min(1).max(5000), add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }).parse(req.body)
  const ids = (await prisma.contact.findMany({ where: { tenantId: req.tenant.id, id: { in: b.contactIds } }, select: { id: true } })).map((c) => c.id)
  for (const id of ids) {
    if (b.add?.length) await applyTags(req.tenant.id, id, b.add)
    if (b.remove?.length) await removeTags(req.tenant.id, id, b.remove)
  }
  res.json({ updated: ids.length })
}))

// Suppression list (bloqueios por canal).
r.get('/suppressions', ah(async (req: AuthedRequest, res) => {
  const channel = String(req.query.channel || '')
  res.json(
    await prisma.suppression.findMany({
      where: { tenantId: req.tenant.id, ...(isChannel(channel) ? { channel } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  )
}))

r.post('/suppressions', ah(async (req: AuthedRequest, res) => {
  const b = z.object({ channel: z.enum(CHANNELS as [string, ...string[]]), values: z.array(z.string()).min(1).max(20000), reason: z.string().max(200).optional() }).parse(req.body)
  let added = 0
  for (const raw of b.values) {
    const v = normalizeDestination(b.channel as any, raw)
    if (!v) continue
    await suppress(req.tenant.id, b.channel as any, v, 'IMPORT', { detail: b.reason })
    added++
  }
  await audit(req.tenant.id, req.user.id, 'SUPPRESSION_IMPORT', 'Suppression', undefined, { channel: b.channel, added })
  res.json({ added })
}))

export default r
