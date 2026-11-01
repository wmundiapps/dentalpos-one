import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'

// Lembretes de vencimento: contas a pagar, impostos, recibos da Receita Saude, alvara, teste da autoclave,
// validade de produtos, documentos da equipe e do dentista. Mesma lista alimenta o e-mail e a tela de abertura.
// E-mail: 4 avisos por item (10, 7 e 1 dia antes e no dia), a partir das 9h de Brasilia.

export const OFFSETS = [10, 7, 1, 0]
export const KINDS: Record<string, string> = {
  ALVARA: 'Alvará',
  AUTOCLAVE: 'Teste da autoclave',
  IMPOSTO: 'Imposto',
  RECIBOS_RECEITA: 'Recibos na Receita Saúde',
  OUTRO: 'Outro vencimento',
}
export const RECURRENCES = ['NONE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']
const SETTINGS_KEY = 'DUE_REMINDERS'
const DAY = 86_400_000

export interface DueItem {
  clinicId: string
  source: string
  kind: string
  id: string
  title: string
  dueDate: string
  daysLeft: number
  path: string
  recurrence: string
  accountant: boolean
}

export interface DueSettings { enabled: boolean; emails: string[]; receitaSaudeDay: number }

const ymd = (d: Date) => d.toISOString().slice(0, 10)
export const todayBR = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const hourBR = (now = new Date()) => Number(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })) % 24
const diffDays = (due: string, today: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)
const addDays = (s: string, n: number) => ymd(new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY))
const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (s: string) => s.split('-').reverse().join('/')

export function nextDue(due: string, recurrence: string) {
  if (recurrence === 'WEEKLY') return addDays(due, 7)
  const months = recurrence === 'MONTHLY' ? 1 : recurrence === 'QUARTERLY' ? 3 : recurrence === 'SEMIANNUAL' ? 6 : recurrence === 'YEARLY' ? 12 : 0
  if (!months) return due
  const d = new Date(`${due}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return ymd(d)
}

// ---------- configuracao por clinica ----------

export function parseSettings(meta: unknown): DueSettings {
  const m = (meta || {}) as { enabled?: unknown; emails?: unknown; receitaSaudeDay?: unknown }
  const emails = Array.isArray(m.emails) ? m.emails.map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 6) : []
  const day = Math.round(Number(m.receitaSaudeDay))
  // Sem prazo configurado usa dia 5 do mes seguinte (conservador): confirme a data certa com o contador.
  return { enabled: m.enabled !== false, emails, receitaSaudeDay: day >= 1 && day <= 28 ? day : 5 }
}

export async function getSettings(clinicId: string) {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: SETTINGS_KEY } } })
  return parseSettings(row?.metadata)
}

export async function saveSettings(clinicId: string, tenantId: string, input: any) {
  const s = parseSettings(input)
  const metadata = { enabled: s.enabled, emails: s.emails, receitaSaudeDay: s.receitaSaudeDay }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: SETTINGS_KEY } },
    update: { enabled: true, metadata },
    create: { clinicId, tenantId, key: SETTINGS_KEY, enabled: true, rolloutStage: 'GA', metadata },
  })
  return s
}

// ---------- coleta dos vencimentos ----------

export async function collectItems(opts: { clinicId?: string; today: string; horizon: number; back: number }): Promise<DueItem[]> {
  const { today } = opts
  const from = new Date(`${addDays(today, -opts.back)}T00:00:00Z`)
  const to = new Date(`${addDays(today, opts.horizon)}T23:59:59Z`)
  const scope = opts.clinicId ? { clinicId: opts.clinicId } : {}
  const out: DueItem[] = []
  const push = (i: Omit<DueItem, 'daysLeft'> & { dueDate: string }) => out.push({ ...i, daysLeft: diffDays(i.dueDate, today) })

  const [expenses, taxes, custom, products, hrDocs, doctorDocs, receitaDocs] = await Promise.all([
    prisma.financialEntry.findMany({ where: { ...scope, type: 'EXPENSE', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { gte: from, lte: to } }, take: 500 }),
    prisma.taxObligation.findMany({ where: { ...scope, status: { notIn: ['PAID', 'TRANSMITTED'] }, dueDate: { gte: from, lte: to } }, take: 300 }),
    prisma.dueReminder.findMany({ where: { ...scope, active: true, dueDate: { gte: from, lte: to } }, take: 500 }),
    prisma.salesProduct.findMany({ where: { ...scope, active: true, stockQuantity: { gt: 0 }, expiresAt: { gte: from, lte: to } }, take: 500 }),
    prisma.hRDocument.findMany({ where: { ...scope, expiresAt: { gte: from, lte: to } }, take: 300 }),
    prisma.doctorDocument.findMany({ where: { ...scope, deletedAt: null, expiresAt: { gte: from, lte: to } }, take: 300 }),
    prisma.fiscalDocument.findMany({ where: { ...scope, status: 'AGUARDANDO_RECEITA_SAUDE' }, select: { clinicId: true, paymentDate: true, createdAt: true }, take: 3000 }),
  ])

  for (const e of expenses) push({ clinicId: e.clinicId, source: 'EXPENSE', kind: 'CONTA', id: e.id, title: `Conta a pagar: ${e.description}${e.personName ? ` (${e.personName})` : ''} — ${brl(e.amount)}`, dueDate: ymd(e.dueDate), path: '/financeiro?tipo=Despesa', recurrence: 'NONE', accountant: false })
  for (const t of taxes) push({ clinicId: t.clinicId, source: 'TAX', kind: 'IMPOSTO', id: t.id, title: `Imposto: ${t.name} (competência ${t.competence})${t.estimatedValue ? ` — ${brl(t.finalValue ?? t.estimatedValue)}` : ''}`, dueDate: ymd(t.dueDate), path: '/contabil-fiscal', recurrence: 'NONE', accountant: true })
  for (const c of custom) push({ clinicId: c.clinicId, source: 'CUSTOM', kind: c.kind, id: c.id, title: `${KINDS[c.kind] || 'Vencimento'}: ${c.title}`, dueDate: ymd(c.dueDate), path: '/configuracoes', recurrence: c.recurrence, accountant: c.kind === 'IMPOSTO' || c.kind === 'RECIBOS_RECEITA' })
  for (const p of products) if (p.expiresAt) push({ clinicId: p.clinicId, source: 'PRODUCT', kind: 'PRODUTO', id: p.id, title: `Validade do produto: ${p.name} (${Number(p.stockQuantity)} em estoque)`, dueDate: ymd(p.expiresAt), path: '/estoque', recurrence: 'NONE', accountant: false })
  for (const d of hrDocs) if (d.expiresAt) push({ clinicId: d.clinicId, source: 'HR_DOC', kind: 'DOCUMENTO', id: d.id, title: `Documento da equipe vence: ${d.title}`, dueDate: ymd(d.expiresAt), path: '/rh', recurrence: 'NONE', accountant: false })
  for (const d of doctorDocs) if (d.expiresAt) push({ clinicId: d.clinicId, source: 'DOCTOR_DOC', kind: 'DOCUMENTO', id: d.id, title: `Documento do dentista vence: ${d.title}`, dueDate: ymd(d.expiresAt), path: '/equipe', recurrence: 'NONE', accountant: false })

  // Recibos pendentes na Receita Saude: um aviso por competencia, no dia configurado do mes seguinte.
  if (receitaDocs.length) {
    const flags = await prisma.tenantFeatureFlag.findMany({ where: { key: SETTINGS_KEY, clinicId: { in: [...new Set(receitaDocs.map(r => r.clinicId))] } } })
    const days = new Map(flags.map(f => [f.clinicId, parseSettings(f.metadata).receitaSaudeDay]))
    const groups = new Map<string, { clinicId: string; competence: string; due: string; count: number }>()
    for (const r of receitaDocs) {
      const base = (r.paymentDate || r.createdAt)
      const y = base.getUTCFullYear()
      const m = base.getUTCMonth()
      const due = ymd(new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, days.get(r.clinicId) ?? 5)))
      const key = `${r.clinicId}:${due}`
      const g = groups.get(key) || { clinicId: r.clinicId, competence: `${String(m + 1).padStart(2, '0')}/${y}`, due, count: 0 }
      g.count += 1
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      const left = diffDays(g.due, today)
      if (left < -opts.back || left > opts.horizon) continue
      push({ clinicId: g.clinicId, source: 'RECEITA', kind: 'RECIBOS_RECEITA', id: g.due, title: `Lançar ${g.count} recibo(s) no Receita Saúde (competência ${g.competence})`, dueDate: g.due, path: '/automacao-fiscal', recurrence: 'NONE', accountant: true })
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title, 'pt-BR'))
}

// ---------- lembretes cadastrados pela clinica ----------

export async function listCustom(clinicId: string) {
  const rows = await prisma.dueReminder.findMany({ where: { clinicId, active: true }, orderBy: { dueDate: 'asc' } })
  return rows.map(r => ({ id: r.id, kind: r.kind, title: r.title, dueDate: ymd(r.dueDate), recurrence: r.recurrence, notes: r.notes, lastDoneAt: r.lastDoneAt }))
}

function cleanCustom(input: any) {
  const kind = KINDS[String(input?.kind)] ? String(input.kind) : 'OUTRO'
  const title = String(input?.title || '').trim().slice(0, 120)
  const due = String(input?.dueDate || '').slice(0, 10)
  const recurrence = RECURRENCES.includes(String(input?.recurrence)) ? String(input.recurrence) : 'NONE'
  if (title.length < 2) throw new Error('Informe o nome do vencimento.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) throw new Error('Informe a data de vencimento.')
  return { kind, title, due, recurrence, notes: String(input?.notes || '').trim().slice(0, 300) || null }
}

export async function createCustom(clinicId: string, tenantId: string, input: any) {
  const c = cleanCustom(input)
  const row = await prisma.dueReminder.create({ data: { id: randomUUID(), clinicId, tenantId, kind: c.kind, title: c.title, dueDate: new Date(`${c.due}T00:00:00Z`), recurrence: c.recurrence, notes: c.notes } })
  return row.id
}

export async function updateCustom(clinicId: string, id: string, input: any) {
  const own = await prisma.dueReminder.findFirst({ where: { id, clinicId } })
  if (!own) throw new Error('Lembrete não encontrado.')
  // Nunca apaga: "arquivar" so desliga o aviso.
  if (input?.active === false && Object.keys(input).length === 1) {
    await prisma.dueReminder.update({ where: { id }, data: { active: false, updatedAt: new Date() } })
    return
  }
  const c = cleanCustom({ kind: own.kind, title: own.title, dueDate: ymd(own.dueDate), recurrence: own.recurrence, ...input })
  await prisma.dueReminder.update({ where: { id }, data: { kind: c.kind, title: c.title, dueDate: new Date(`${c.due}T00:00:00Z`), recurrence: c.recurrence, notes: c.notes, active: input?.active !== false, updatedAt: new Date() } })
}

// "Feito": se repete, vai para a proxima data futura; se nao, arquiva.
export async function markDone(clinicId: string, id: string) {
  const own = await prisma.dueReminder.findFirst({ where: { id, clinicId, active: true } })
  if (!own) throw new Error('Lembrete não encontrado.')
  const today = todayBR()
  if (own.recurrence === 'NONE') {
    await prisma.dueReminder.update({ where: { id }, data: { active: false, lastDoneAt: new Date(), updatedAt: new Date() } })
    return null
  }
  let due = ymd(own.dueDate)
  let guard = 0
  do { due = nextDue(due, own.recurrence); guard += 1 } while (diffDays(due, today) < 0 && guard < 400)
  await prisma.dueReminder.update({ where: { id }, data: { dueDate: new Date(`${due}T00:00:00Z`), lastDoneAt: new Date(), updatedAt: new Date() } })
  return due
}

// ---------- e-mail das 9h ----------

function whenLabel(daysLeft: number) {
  if (daysLeft === 0) return 'VENCE HOJE'
  if (daysLeft === 1) return 'Vence amanhã'
  return `Vence em ${daysLeft} dias`
}

async function recipientsOf(clinicId: string, clinicEmail: string | null, settings: DueSettings) {
  const [admins, rule] = await Promise.all([
    prisma.user.findMany({ where: { clinicId, role: 'ADMIN', isActive: true }, select: { email: true }, take: 5 }),
    prisma.fiscalRule.findUnique({ where: { clinicId }, select: { adminEmail: true, accountantEmail: true } }),
  ])
  const all = [clinicEmail, ...admins.map(a => a.email), rule?.adminEmail, ...settings.emails].map(e => String(e || '').trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  return { main: [...new Set(all)].slice(0, 8), accountant: rule?.accountantEmail ? String(rule.accountantEmail).trim().toLowerCase() : null }
}

// Chamada pelo cron horario (08h-20h). So envia a partir das 9h de Brasilia e nunca repete o mesmo aviso.
export async function processDueReminders(now = new Date()) {
  if (hourBR(now) < 9) return { skipped: 'ANTES_DAS_9H' }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { skipped: 'SEM_RESEND' }
  const today = todayBR(now)

  const items = (await collectItems({ today, horizon: 10, back: 0 })).filter(i => OFFSETS.includes(i.daysLeft) && (i.recurrence !== 'WEEKLY' || i.daysLeft <= 1))
  if (!items.length) return { sent: 0 }
  const keyOf = (i: DueItem) => `${i.source}:${i.id}:${i.dueDate}:${i.daysLeft}`
  const done = new Set((await prisma.dueReminderLog.findMany({ where: { key: { in: items.map(keyOf) } }, select: { key: true } })).map(l => l.key))
  const fresh = items.filter(i => !done.has(keyOf(i)))
  if (!fresh.length) return { sent: 0 }

  const byClinic = new Map<string, DueItem[]>()
  for (const i of fresh) byClinic.set(i.clinicId, [...(byClinic.get(i.clinicId) || []), i])

  let sent = 0
  for (const [clinicId, list] of byClinic) {
    try {
      const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true, email: true, isActive: true } })
      if (!clinic?.isActive) continue
      const settings = await getSettings(clinicId)
      if (!settings.enabled) continue
      const rec = await recipientsOf(clinicId, clinic.email, settings)
      const build = (rows: DueItem[]) => {
        const lines = rows.map(i => `• ${whenLabel(i.daysLeft)} (${brDate(i.dueDate)}): ${i.title}`)
        return [`Olá! Estes são os vencimentos de ${clinic.name} que pedem atenção:`, '', ...lines, '', 'Veja todos na tela de abertura do DentalPos: https://app.dentalpos.com.br/', '', 'Você recebe cada aviso 10 dias, 7 dias, 1 dia antes e no dia do vencimento, às 9h (horário de Brasília).'].join('\n')
      }
      const subject = (n: number) => `Vencimentos: ${n} aviso${n > 1 ? 's' : ''} — ${clinic.name}`
      for (const to of rec.main) await dispatchRevah('EMAIL', to, build(list), { apiKey, from: 'DentalPos <contato@dentalpos.com.br>', subject: subject(list.length) })
      const acc = list.filter(i => i.accountant)
      if (rec.accountant && acc.length && !rec.main.includes(rec.accountant)) await dispatchRevah('EMAIL', rec.accountant, build(acc), { apiKey, from: 'DentalPos <contato@dentalpos.com.br>', subject: subject(acc.length) })
      await prisma.dueReminderLog.createMany({ data: list.map(i => ({ id: randomUUID(), clinicId, key: keyOf(i) })), skipDuplicates: true })
      sent += list.length
    } catch (error) {
      console.error('Falha ao enviar lembretes de vencimento:', error instanceof Error ? error.message : 'erro')
    }
  }
  return { sent }
}
