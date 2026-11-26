import { createHmac } from 'crypto'
import { prisma } from '../lib/prisma'

// Lista de "não quero receber" por impressão digital (HMAC) de CNPJ, telefone e e-mail.
// Quem sai fica bloqueado para sempre, mesmo que o arquivo da Receita seja importado de novo,
// e os contatos pessoais dele são apagados do registro. Usa a mesma tabela de bloqueio (chave "h:<tipo>:<hash>").

const pepper = () => process.env.PROSPECT_HASH_PEPPER || process.env.JWT_SECRET || 'dentalpos-prospect'
const digitsOf = (v?: string | null) => String(v || '').replace(/\D/g, '')

export type BlockKind = 'cnpj' | 'phone' | 'email'

export function blockKey(kind: BlockKind, value: string): string | null {
  const v = kind === 'email' ? String(value || '').trim().toLowerCase() : digitsOf(value)
  if (!v) return null
  // Telefone: DDD + número, sem o 55 do país
  const normalized = kind === 'phone' ? (v.length > 11 && v.startsWith('55') ? v.slice(2) : v) : v
  return `h:${kind}:${createHmac('sha256', pepper()).update(`${kind}:${normalized}`).digest('hex')}`
}

type ContactLike = { cnpj?: string | null; email?: string | null; phone1?: string | null; phone2?: string | null }

export function contactKeys(c: ContactLike): string[] {
  return [
    c.cnpj ? blockKey('cnpj', c.cnpj) : null,
    c.email ? blockKey('email', c.email) : null,
    c.phone1 ? blockKey('phone', c.phone1) : null,
    c.phone2 ? blockKey('phone', c.phone2) : null,
  ].filter((k): k is string => Boolean(k))
}

export async function blockedKeySet(items: ContactLike[]): Promise<Set<string>> {
  const keys = [...new Set(items.flatMap(contactKeys))]
  if (!keys.length) return new Set()
  const rows = await prisma.prospectSuppression.findMany({ where: { email: { in: keys } }, select: { email: true } })
  return new Set(rows.map((r) => r.email))
}

export function isBlockedBy(set: Set<string>, c: ContactLike): boolean {
  return contactKeys(c).some((k) => set.has(k))
}

export async function blockContacts(c: ContactLike, reason: string) {
  for (const key of contactKeys(c)) {
    await prisma.prospectSuppression.upsert({ where: { email: key }, update: { reason }, create: { email: key, reason } })
  }
}

// Celular com WhatsApp: DDD + 9 + 8 dígitos. Devolve com o 55 do país, pronto para o wa.me.
export function whatsappNumber(...phones: Array<string | null | undefined>): string | null {
  for (const p of phones) {
    let d = digitsOf(p)
    if (d.length === 10 && '6789'.includes(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`
    if (d.length === 11 && d[2] === '9') return `55${d}`
  }
  return null
}

// Convites só entre 8h e 21h (horário de Brasília)
export function insideSendWindow(now = new Date()): boolean {
  const hour = (now.getUTCHours() - 3 + 24) % 24
  return hour >= 8 && hour < 21
}
