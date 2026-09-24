import { prisma } from '../lib/prisma'
import type { Channel } from '../lib/normalize'

// Palavras/frases que indicam pedido para não receber mais mensagens/ligações.
const OPT_OUT_PATTERNS: RegExp[] = [
  /^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover|unsubscribe)\s*[.!]*\s*$/i,
  /n[aã]o\s+(quero|desejo|gostaria\s+de)\s+(mais\s+)?(receber|ser\s+contactad[oa]|ser\s+contatad[oa]|mensage|liga[cç])/i,
  /(para|pare|parem)\s+de\s+(me\s+)?(mandar|enviar|ligar|mensage)/i,
  /(me\s+)?(tir[ae]|remov[ae]|exclu[ai])\s+(meu\s+(n[uú]mero|contato|e-?mail)|da\s+(sua\s+)?lista)/i,
  /n[aã]o\s+me\s+(ligu?e|ligue\s+mais|mande\s+mais|envie\s+mais|perturbe)/i,
]

export function detectOptOut(text: string | null | undefined): boolean {
  const t = String(text || '').trim()
  if (!t || t.length > 280) return false
  return OPT_OUT_PATTERNS.some((re) => re.test(t))
}

export async function isSuppressed(tenantId: string, channel: Channel, value: string | null | undefined) {
  if (!value) return false
  const row = await prisma.suppression.findUnique({ where: { tenantId_channel_value: { tenantId, channel, value } } })
  return Boolean(row)
}

export async function suppressedSet(tenantId: string, channel: Channel, values: string[]) {
  if (!values.length) return new Set<string>()
  const rows = await prisma.suppression.findMany({ where: { tenantId, channel, value: { in: values } }, select: { value: true } })
  return new Set(rows.map((r) => r.value))
}

export async function suppress(tenantId: string, channel: Channel, value: string, reason: string, opts: { contactId?: string | null; detail?: string } = {}) {
  const row = await prisma.suppression.upsert({
    where: { tenantId_channel_value: { tenantId, channel, value } },
    create: { tenantId, channel, value, reason, contactId: opts.contactId || null, detail: opts.detail?.slice(0, 500) },
    update: {},
  })
  if (opts.contactId) {
    await prisma.consent.create({
      data: { tenantId, contactId: opts.contactId, channel, granted: false, source: reason, evidence: opts.detail?.slice(0, 500) },
    })
  }
  return row
}

export async function unsuppress(tenantId: string, channel: Channel, value: string, contactId?: string | null, evidence?: string) {
  await prisma.suppression.deleteMany({ where: { tenantId, channel, value } })
  if (contactId) await prisma.consent.create({ data: { tenantId, contactId, channel, granted: true, source: 'MANUAL', evidence } })
}
