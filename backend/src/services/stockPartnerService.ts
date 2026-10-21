import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { listCriticalStock } from './stock5787'
import type { Clinic } from './followUpService'

// Parcerias de estoque: com a autorização da clínica, empresas parceiras (ativas e em dia) são avisadas por e-mail
// quando itens do estoque ficam no mínimo ou abaixo. Contrapartida: meio salário mínimo por mês, paga pelo parceiro.
export const FLAG_KEY = 'STOCK_PARTNERS'
const SENDER = 'CompletoDonto <contato@dentalpos.com.br>'
const COOLDOWN_DAYS = 7
const MAX_ITEMS_PER_MAIL = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const minimumWage = () => {
  const v = Number(process.env.MINIMUM_WAGE_BRL)
  return Number.isFinite(v) && v > 0 ? v : 1621
}
export const defaultMonthlyFee = () => Math.round((minimumWage() / 2) * 100) / 100

export type PartnerSettings = { authorized: boolean; authorizedAt: string | null; authorizedBy: string | null }

export async function loadPartnerSettings(clinicId: string): Promise<PartnerSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as Partial<PartnerSettings>
  return { authorized: m.authorized === true, authorizedAt: m.authorizedAt || null, authorizedBy: m.authorizedBy || null }
}

export async function savePartnerSettings(clinicId: string, tenantId: string, s: PartnerSettings) {
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: s.authorized, metadata: s as never },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: s.authorized, rolloutStage: 'GA', metadata: s as never },
  })
}

export const partnerIsActive = (p: { status: string; paidUntil: Date | null }, now = new Date()) =>
  p.status === 'ATIVO' && (!p.paidUntil || p.paidUntil.getTime() >= now.getTime())

export function partnerMatches(categories: string[], productName: string) {
  if (!categories.length) return true
  const name = productName.toLowerCase()
  return categories.some((c) => c.trim() && name.includes(c.trim().toLowerCase()))
}

export function noticeBody(clinicName: string, phone: string, email: string, items: Array<{ name: string; quantity: number; minimum: number }>) {
  const lines = items.map((i) => `• ${i.name}: saldo ${i.quantity} (mínimo ${i.minimum})`)
  const contact = [phone ? `Telefone/WhatsApp: ${phone}` : '', email ? `E-mail: ${email}` : ''].filter(Boolean).join('\n')
  return `Olá! A clínica ${clinicName} autorizou o CompletoDonto a avisar parceiros quando o estoque fica baixo.\n\nItens para reposição:\n${lines.join('\n')}\n\nSe você pode atender, entre em contato direto com a clínica:\n${contact || 'responda a este e-mail'}\n\nVocê recebe este aviso por ser parceiro do CompletoDonto. Para deixar de receber, responda a este e-mail.`
}

async function sendMail(to: string, subject: string, body: string) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return false
  try { return !(await dispatchRevah('EMAIL', to, body, { apiKey, subject }, SENDER)).simulated } catch (e) { console.error('Aviso a parceiro de estoque falhou:', e); return false }
}

export async function notifyPartners(c: Clinic, now = new Date()) {
  const s = await loadPartnerSettings(c.id)
  if (!s.authorized) return { skipped: true }
  const partners = (await prisma.stockPartner.findMany({ where: { status: 'ATIVO' }, take: 200 })).filter((p) => partnerIsActive(p, now) && EMAIL_RE.test(p.email))
  if (!partners.length) return { skipped: true }
  const critical = await listCriticalStock(c.id, c.tenantId)
  if (!critical.length) return { skipped: true }
  const since = new Date(now.getTime() - COOLDOWN_DAYS * 86400000)
  let sent = 0
  for (const p of partners) {
    const recent = await prisma.stockPartnerNotice.findMany({ where: { clinicId: c.id, partnerId: p.id, sentAt: { gte: since } }, select: { productId: true } })
    const done = new Set(recent.map((r) => r.productId))
    const items = critical.filter((i) => !done.has(i.id) && partnerMatches(p.categories, i.name)).slice(0, MAX_ITEMS_PER_MAIL)
    if (!items.length) continue
    const body = noticeBody(c.name, c.phone, c.email, items.map((i) => ({ name: i.name, quantity: Number(i.stockQuantity), minimum: Number(i.minStock) })))
    if (await sendMail(p.email, `Estoque baixo na clínica ${c.name}: pedido de reposição`, body)) {
      sent += 1
      await prisma.stockPartnerNotice.createMany({ data: items.map((i) => ({ id: randomUUID(), clinicId: c.id, partnerId: p.id, productId: i.id })) })
    }
  }
  return { skipped: false, sent }
}
