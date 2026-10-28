import { importedOriginsToSkip } from './importedHold'
import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { getDemoAccess } from './demoAccessService'
import { sendManagerDigest } from '../controllers/pendingAlertController'
import { notifyPartners } from './stockPartnerService'
import { sendCashClose } from './dailyCashService'
import { sendMissingPunchAlerts } from './hrTimeAlertService'

// Acompanhamento de pacientes sem agendar e de pacientes devendo:
// - lista semanal por e-mail (segunda-feira) e nos painéis da recepção e clínico;
// - resumo diário de pacientes devendo por e-mail ao responsável;
// - aviso diário ao paciente devedor, sem valor: pede só que entre em contato com a clínica.
// Configuração na flag da clínica (sem tabela nova); o controle de "uma vez por dia" fica na própria flag.
export const FLAG_KEY = 'FOLLOWUP_DIGEST'
export const NOTICE_MARKER = '[PENDENCIA]'
const DAY = 86400000
const SENDER = 'CompletoDonto <contato@dentalpos.com.br>'
const WEEKLY_HOUR_BRT = 8
const DAILY_HOUR_BRT = 8
const NOTICE_HOUR_BRT = 9
const NOTICE_MAX_PER_RUN = 100
let running = false

export const brtDay = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const brtHour = (d: Date) => new Date(d.getTime() - 3 * 3600000).getUTCHours()
const brtWeekday = (d: Date) => new Date(d.getTime() - 3 * 3600000).getUTCDay() // 0 = domingo, 1 = segunda
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type FollowUpSettings = {
  weeklyList: boolean
  dailyDebtors: boolean
  debtorNotice: boolean
  skipImported: boolean
  emails: string[]
  lastWeekly: string | null
  lastDaily: string | null
}

export async function loadSettings(clinicId: string): Promise<FollowUpSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as Partial<FollowUpSettings>
  return {
    weeklyList: m.weeklyList !== false,
    dailyDebtors: m.dailyDebtors !== false,
    debtorNotice: m.debtorNotice !== false,
    skipImported: m.skipImported !== false,
    emails: Array.isArray(m.emails) ? m.emails.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)).slice(0, 10) : [],
    lastWeekly: m.lastWeekly || null,
    lastDaily: m.lastDaily || null,
  }
}

export async function saveSettings(clinicId: string, tenantId: string, s: FollowUpSettings) {
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: true, metadata: s as never },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: true, rolloutStage: 'GA', metadata: s as never },
  })
}

// Clínicas contratadas (as de demonstração não recebem envios automáticos).
export type Clinic = { id: string; tenantId: string; name: string; phone: string; email: string }

export async function paidClinics(): Promise<Clinic[]> {
  const clinics = await prisma.clinic.findMany({ where: { isActive: true, NOT: { plan: { startsWith: 'DEMO' } } }, select: { id: true, tenantId: true, name: true, displayName: true, phone: true, email: true }, take: 500 })
  const out: Clinic[] = []
  for (const c of clinics) {
    try { if ((await getDemoAccess(c.id)).isDemo) continue } catch { continue }
    out.push({ id: c.id, tenantId: c.tenantId, name: c.displayName || c.name, phone: c.phone, email: c.email })
  }
  return out
}

export async function ownerEmails(clinicId: string, tenantId: string, s: FollowUpSettings): Promise<string[]> {
  if (s.emails.length) return s.emails
  const admins = await prisma.user.findMany({ where: { clinicId, tenantId, isActive: true, role: 'ADMIN' }, select: { email: true }, take: 5 })
  return [...new Set(admins.map((a) => a.email.toLowerCase()).filter((e) => EMAIL_RE.test(e)))]
}

// ---------------- pacientes sem agendar ----------------
export type UnscheduledKind = 'FALTOU' | 'CANCELOU' | 'SEM_RETORNO'
export type UnscheduledPatient = { id: string; name: string; phone: string; email: string | null; kind: UnscheduledKind; lastVisit: string; daysAway: number }
export const KIND_LABEL: Record<UnscheduledKind, string> = { FALTOU: 'Faltaram e não remarcaram', CANCELOU: 'Cancelaram e não remarcaram', SEM_RETORNO: 'Atendidos sem próxima consulta marcada' }

// Último contato de cada paciente (consulta realizada, falta ou cancelamento) e nenhuma consulta futura marcada.
export async function unscheduledPatients(clinicId: string, tenantId: string, opts: { now?: Date; minDays?: number; maxMonths?: number } = {}): Promise<UnscheduledPatient[]> {
  const now = opts.now || new Date()
  const from = new Date(now.getTime() - (opts.maxMonths ?? 24) * 30 * DAY)
  const until = new Date(now.getTime() - (opts.minDays ?? 3) * DAY)
  const rows = await prisma.$queryRaw<Array<{ id: string; fullName: string; phone: string | null; email: string | null; last: Date; status: string }>>`
    SELECT p."id", p."fullName", p."phone", p."email", l."last", l."status"
    FROM (
      SELECT DISTINCT ON (a."patientId") a."patientId", a."scheduledAt" AS "last", a."status"
      FROM "Appointment" a
      WHERE a."clinicId" = ${clinicId} AND a."tenantId" = ${tenantId} AND a."scheduledAt" <= ${now} AND a."status" IN ('COMPLETED', 'NO_SHOW', 'CANCELLED')
      ORDER BY a."patientId", a."scheduledAt" DESC
    ) l
    JOIN "Patient" p ON p."id" = l."patientId"
    WHERE p."clinicId" = ${clinicId} AND p."tenantId" = ${tenantId} AND p."isActive" = true AND COALESCE(p."status", 'Ativo') <> 'Inativo'
      AND l."last" <= ${until} AND l."last" >= ${from}
      AND NOT EXISTS (SELECT 1 FROM "Appointment" f WHERE f."patientId" = p."id" AND f."scheduledAt" > ${now} AND f."status" NOT IN ('CANCELLED', 'NO_SHOW'))
    ORDER BY l."last" DESC
    LIMIT 1500`
  const kindOf = (s: string): UnscheduledKind => (s === 'NO_SHOW' ? 'FALTOU' : s === 'CANCELLED' ? 'CANCELOU' : 'SEM_RETORNO')
  return rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.phone || '', email: r.email, kind: kindOf(r.status), lastVisit: r.last.toISOString(), daysAway: Math.floor((now.getTime() - r.last.getTime()) / DAY) }))
}

export function groupUnscheduled(list: UnscheduledPatient[]) {
  const order: UnscheduledKind[] = ['FALTOU', 'CANCELOU', 'SEM_RETORNO']
  return order.map((kind) => ({ kind, label: KIND_LABEL[kind], total: list.filter((p) => p.kind === kind).length, patients: list.filter((p) => p.kind === kind) }))
}

// ---------------- pacientes devendo ----------------
export type Debtor = { patientId: string; name: string; phone: string; email: string | null; total: number; count: number; oldestISO: string; daysOverdue: number }

export async function debtors(clinicId: string, tenantId: string, now = new Date()): Promise<Debtor[]> {
  const skip = await importedOriginsToSkip(clinicId)
  const entries = await prisma.financialEntry.findMany({
    where: { clinicId, tenantId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, patientId: { not: null }, dueDate: { lt: now }, ...(skip.length ? { origin: { notIn: skip } } : {}) },
    select: { patientId: true, amount: true, dueDate: true, patient: { select: { fullName: true, phone: true, email: true, isActive: true } } },
    take: 3000,
  })
  const today = brtDay(now)
  const byPatient = new Map<string, Debtor>()
  for (const e of entries) {
    if (!e.patientId || !e.patient || !e.patient.isActive) continue
    const dueISO = e.dueDate.toISOString().slice(0, 10)
    if (dueISO >= today) continue
    const days = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${dueISO}T12:00:00Z`).getTime()) / DAY)
    const cur = byPatient.get(e.patientId) || { patientId: e.patientId, name: e.patient.fullName, phone: e.patient.phone || '', email: e.patient.email, total: 0, count: 0, oldestISO: dueISO, daysOverdue: 0 }
    cur.total += Number(e.amount)
    cur.count += 1
    if (dueISO < cur.oldestISO) cur.oldestISO = dueISO
    cur.daysOverdue = Math.max(cur.daysOverdue, days)
    byPatient.set(e.patientId, cur)
  }
  return [...byPatient.values()].sort((a, b) => b.daysOverdue - a.daysOverdue)
}

// ---------------- e-mails ----------------
export async function sendMail(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return false
  try {
    const r = await dispatchRevah('EMAIL', to, body, { apiKey, subject }, SENDER)
    return !r.simulated
  } catch (error) {
    console.error('Falha ao enviar e-mail de acompanhamento:', error)
    return false
  }
}

const panelLink = () => `${(String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.completodonto.com.br').replace(/\/$/, '')}/painel-atendimentos`

export function weeklyBody(clinicName: string, list: UnscheduledPatient[]) {
  const groups = groupUnscheduled(list)
  const lines = [`Resumo semanal da ${clinicName}: pacientes que ficaram sem agendar (${list.length}).`, '']
  for (const g of groups) {
    lines.push(`${g.label}: ${g.total}`)
    for (const p of g.patients.slice(0, 40)) lines.push(`• ${p.name}${p.phone ? ` — ${p.phone}` : ''} — último contato há ${p.daysAway} dia(s) (${dmy(p.lastVisit.slice(0, 10))})`)
    if (g.total > 40) lines.push(`… e mais ${g.total - 40} no painel.`)
    lines.push('')
  }
  lines.push(`Veja a lista completa e entre em contato pelo painel: ${panelLink()}`)
  return lines.join('\n')
}

export function debtorsBody(clinicName: string, list: Debtor[]) {
  const total = list.reduce((a, d) => a + d.total, 0)
  const lines = [`Pacientes com pagamento em atraso na ${clinicName}: ${list.length} paciente(s), ${brl(total)} no total.`, '']
  for (const d of list.slice(0, 80)) lines.push(`• ${d.name}${d.phone ? ` — ${d.phone}` : ''} — ${brl(d.total)} (${d.count} lançamento(s), mais antigo vencido em ${dmy(d.oldestISO)}, há ${d.daysOverdue} dia(s))`)
  if (list.length > 80) lines.push(`… e mais ${list.length - 80} no Contas a Receber.`)
  lines.push('', 'Hoje cada paciente da lista que tem e-mail cadastrado recebeu um aviso pedindo que entre em contato com a clínica (sem citar valores).')
  return lines.join('\n')
}

export function noticeBody(clinicName: string, patientName: string, clinicPhone: string, clinicEmail: string) {
  const first = patientName.trim().split(/\s+/)[0] || 'paciente'
  const d = clinicPhone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  const fmt = d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : clinicPhone
  const contact = fmt ? `pelo WhatsApp ou telefone ${fmt}` : clinicEmail ? `pelo e-mail ${clinicEmail}` : ''
  return `Olá, ${first}! A ${clinicName} gostaria de falar com você sobre um assunto do seu interesse. Por favor, retorne ${contact ? `${contact}` : "entrando em contato com a clínica"}, em horário comercial. Obrigado!\n\nSe você já entrou em contato conosco, desconsidere esta mensagem.`
}

export async function sendWeeklyList(c: Clinic, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now || new Date()
  const s = await loadSettings(c.id)
  if (!opts.force && (!s.weeklyList || brtWeekday(now) !== 1 || brtHour(now) < WEEKLY_HOUR_BRT || s.lastWeekly === brtDay(now))) return { skipped: true }
  const to = await ownerEmails(c.id, c.tenantId, s)
  if (!to.length) return { skipped: true, reason: 'sem e-mail de destino' }
  const list = await unscheduledPatients(c.id, c.tenantId, { now })
  const body = weeklyBody(c.name, list)
  let sent = 0
  for (const address of to) if (await sendMail(address, `Pacientes sem agendar (${list.length}) — resumo semanal`, body)) sent += 1
  if (sent && !opts.force) await saveSettings(c.id, c.tenantId, { ...s, lastWeekly: brtDay(now) })
  return { skipped: false, patients: list.length, sent }
}

export async function sendDailyDebtors(c: Clinic, opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now || new Date()
  const s = await loadSettings(c.id)
  if (!opts.force && (!s.dailyDebtors || brtHour(now) < DAILY_HOUR_BRT || s.lastDaily === brtDay(now))) return { skipped: true }
  const list = await debtors(c.id, c.tenantId, now)
  const to = await ownerEmails(c.id, c.tenantId, s)
  let sent = 0
  if (list.length && to.length) {
    const body = debtorsBody(c.name, list)
    for (const address of to) if (await sendMail(address, `Pacientes devendo (${list.length}) — resumo diário`, body)) sent += 1
  }
  if (!opts.force) await saveSettings(c.id, c.tenantId, { ...s, lastDaily: brtDay(now) })
  return { skipped: false, patients: list.length, sent }
}

// Um aviso por paciente por dia, sem valores, só pedindo contato com a clínica.
export async function sendDebtorNotices(c: Clinic, opts: { now?: Date } = {}) {
  const now = opts.now || new Date()
  const s = await loadSettings(c.id)
  if (!s.debtorNotice || brtHour(now) < NOTICE_HOUR_BRT) return { skipped: true }
  const today = new Date(`${brtDay(now)}T00:00:00-03:00`)
  const doneToday = new Set((await prisma.revahMessage.findMany({ where: { clinicId: c.id, content: { startsWith: NOTICE_MARKER }, createdAt: { gte: today } }, select: { destination: true }, take: 2000 })).map((m) => m.destination.toLowerCase()))
  let sent = 0
  for (const d of await debtors(c.id, c.tenantId, now)) {
    if (sent >= NOTICE_MAX_PER_RUN) break
    if (!d.email || !EMAIL_RE.test(d.email) || doneToday.has(d.email.toLowerCase())) continue
    const body = noticeBody(c.name, d.name, c.phone, c.email)
    if (await sendMail(d.email, `Mensagem da ${c.name}: entre em contato conosco`, body)) {
      sent += 1
      await prisma.revahMessage.create({ data: { clinicId: c.id, tenantId: c.tenantId, senderId: null, channel: 'EMAIL', destination: d.email, content: `${NOTICE_MARKER} ${body}`, contactName: d.name, provider: 'RESEND', providerMessageId: `followup-${Date.now()}`, status: 'SENT', sentAt: new Date() } }).catch(() => undefined)
    }
  }
  return { skipped: false, sent }
}

// Chamado de hora em hora pela rotina agendada (cada tarefa só roda uma vez por dia/semana).
export async function processFollowUps(now = new Date()) {
  if (running) return
  running = true
  try {
    for (const c of await paidClinics()) {
      await sendWeeklyList(c, { now }).catch((e) => console.error('Lista semanal:', e))
      await sendDailyDebtors(c, { now }).catch((e) => console.error('Resumo de devedores:', e))
      await sendDebtorNotices(c, { now }).catch((e) => console.error('Aviso a devedores:', e))
      await sendManagerDigest(c.id, c.tenantId, now).catch((e) => console.error('Resumo de pendências ao gestor:', e))
      await notifyPartners(c, now).catch((e) => console.error('Aviso a parceiros de estoque:', e))
      await sendCashClose(c, { now }).catch((e) => console.error('Fechamento de caixa:', e))
      await sendMissingPunchAlerts(c, { now }).catch((e) => console.error('Aviso de ponto:', e))
    }
  } finally { running = false }
}
