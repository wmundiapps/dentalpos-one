import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { contactFieldFor, normalizeEmail, normalizePhone, type Channel } from '../lib/normalize'
import { emitEvent } from './automations'

export interface ContactInput {
  name?: string | null
  phone?: string | null
  email?: string | null
  telegramChatId?: string | null
  instagramId?: string | null
  messengerId?: string | null
  document?: string | null
  company?: string | null
  notes?: string | null
  customFields?: Record<string, unknown> | null
  source?: string
  externalRef?: string | null
  tags?: string[]
}

export function cleanContactInput(input: ContactInput) {
  const phone = input.phone ? normalizePhone(input.phone) : null
  const email = input.email ? normalizeEmail(input.email) : null
  return {
    name: (input.name || '').trim() || null,
    phone,
    email,
    telegramChatId: input.telegramChatId?.toString().trim() || null,
    instagramId: input.instagramId?.toString().trim() || null,
    messengerId: input.messengerId?.toString().trim() || null,
    document: input.document?.replace(/\D/g, '') || null,
    company: input.company?.trim() || null,
    notes: input.notes ?? null,
    customFields: input.customFields ?? null,
    externalRef: input.externalRef || null,
  }
}

export async function applyTags(tenantId: string, contactId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const tag = await prisma.tag.upsert({ where: { tenantId_name: { tenantId, name } }, create: { tenantId, name }, update: {} })
    await prisma.contactTag.upsert({ where: { contactId_tagId: { contactId, tagId: tag.id } }, create: { contactId, tagId: tag.id }, update: {} })
  }
}

export async function removeTags(tenantId: string, contactId: string, names: string[]) {
  const tags = await prisma.tag.findMany({ where: { tenantId, name: { in: names } } })
  if (tags.length) await prisma.contactTag.deleteMany({ where: { contactId, tagId: { in: tags.map((t) => t.id) } } })
}

// Cria ou atualiza evitando duplicados: externalRef > telefone > e-mail.
export async function upsertContact(tenantId: string, input: ContactInput, opts: { emit?: boolean } = {}) {
  const c = cleanContactInput(input)
  const or: Prisma.ContactWhereInput[] = []
  if (c.externalRef) or.push({ externalRef: c.externalRef })
  if (c.phone) or.push({ phone: c.phone })
  if (c.email) or.push({ email: c.email })
  if (c.telegramChatId) or.push({ telegramChatId: c.telegramChatId })
  if (c.instagramId) or.push({ instagramId: c.instagramId })
  if (c.messengerId) or.push({ messengerId: c.messengerId })
  const existing = or.length ? await prisma.contact.findFirst({ where: { tenantId, OR: or }, orderBy: { createdAt: 'asc' } }) : null

  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) if (v !== null && v !== undefined && v !== '') data[k] = v
  if (existing) {
    if (c.customFields) data.customFields = { ...((existing.customFields as object) || {}), ...c.customFields }
    const updated = await prisma.contact.update({ where: { id: existing.id }, data: data as Prisma.ContactUpdateInput })
    if (input.tags?.length) await applyTags(tenantId, updated.id, input.tags)
    return { contact: updated, created: false }
  }
  const created = await prisma.contact.create({
    data: {
      ...(data as any),
      tenantId,
      name: c.name || c.phone || c.email || 'Contato',
      source: input.source || 'MANUAL',
    },
  })
  if (input.tags?.length) await applyTags(tenantId, created.id, input.tags)
  if (opts.emit !== false) await emitEvent(tenantId, 'contact.created', { contactId: created.id, data: { source: created.source } })
  return { contact: created, created: true }
}

// Usado no inbound: acha o contato pelo endereço do canal ou cria um novo.
export async function findOrCreateByChannel(tenantId: string, channel: Channel, address: string, name?: string | null) {
  const field = contactFieldFor(channel)
  const existing = await prisma.contact.findFirst({ where: { tenantId, [field]: address } as Prisma.ContactWhereInput, orderBy: { createdAt: 'asc' } })
  if (existing) {
    if (name && (existing.name === existing.phone || existing.name === 'Contato')) {
      return prisma.contact.update({ where: { id: existing.id }, data: { name } })
    }
    return existing
  }
  const { contact } = await upsertContact(tenantId, { [field]: address, name: name || null, source: 'INBOUND' } as ContactInput)
  return contact
}

export function contactAddress(contact: Record<string, any>, channel: Channel): string | null {
  return contact[contactFieldFor(channel)] || null
}

// Histórico unificado: mensagens de todos os canais, ligações e notas.
export async function contactTimeline(tenantId: string, contactId: string, take = 200) {
  const [messages, calls, notes] = await Promise.all([
    prisma.message.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: 'desc' }, take }),
    prisma.call.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: 'desc' }, take: 50, include: { turns: { orderBy: { createdAt: 'asc' } } } }),
    prisma.note.findMany({ where: { tenantId, contactId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ])
  const items = [
    ...messages.map((m) => ({ type: 'message' as const, at: m.createdAt, data: m })),
    ...calls.map((c) => ({ type: 'call' as const, at: c.createdAt, data: c })),
    ...notes.map((n) => ({ type: 'note' as const, at: n.createdAt, data: n })),
  ]
  return items.sort((a, b) => b.at.getTime() - a.at.getTime())
}
