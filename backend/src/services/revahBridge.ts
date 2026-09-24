// Ponte DentalPos One -> REVAH. Toda a comunicação passa pelo @revah/dentalpos-one-adapter
// (API assinada, SSO e eventos). Nenhuma tabela do REVAH é acessada daqui.
import { RevahClient, verifyRevahWebhook, type RevahEvent, type RevahPlan } from '@revah/dentalpos-one-adapter'
import { prisma } from '../lib/prisma'
import { decryptSecret, encryptSecret } from './secretVault'

export const REVAH_FLAG = 'REVAH'

interface RevahFlagMetadata {
  revahTenantId?: string
  plan?: RevahPlan
  encryptedApiKey?: string
  encryptedWebhookSecret?: string
  provisionedAt?: string
  lastSyncAt?: string
  lastSyncResult?: unknown
}

export function revahConfigured() {
  return Boolean(process.env.REVAH_API_URL && process.env.REVAH_SHARED_SECRET)
}

let client: RevahClient | null = null
export function revah() {
  if (!revahConfigured()) throw new Error('Integração REVAH não configurada (REVAH_API_URL / REVAH_SHARED_SECRET).')
  if (!client) {
    client = new RevahClient({ apiUrl: process.env.REVAH_API_URL!, appUrl: process.env.REVAH_APP_URL, sharedSecret: process.env.REVAH_SHARED_SECRET })
  }
  return client
}

export async function getRevahFlag(clinicId: string) {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: REVAH_FLAG } } })
  return { row, meta: ((row?.metadata as RevahFlagMetadata | null) || {}) as RevahFlagMetadata }
}

async function saveMeta(clinicId: string, tenantId: string, patch: Partial<RevahFlagMetadata>, enabled?: boolean) {
  const { meta } = await getRevahFlag(clinicId)
  const metadata = { ...meta, ...patch } as any
  return prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: REVAH_FLAG } },
    create: { clinicId, tenantId, key: REVAH_FLAG, enabled: enabled ?? false, rolloutStage: 'GA', metadata },
    update: { metadata, ...(enabled === undefined ? {} : { enabled }) },
  })
}

function webhookUrl(clinicId: string) {
  const base = (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '')
  return base ? `${base}/revah-bridge/webhook/${clinicId}` : undefined
}

// Cria a empresa da clínica no REVAH (idempotente) e guarda a chave criptografada.
export async function ensureProvisioned(clinicId: string, plan?: RevahPlan) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } })
  const { meta } = await getRevahFlag(clinicId)
  if (meta.encryptedApiKey && meta.revahTenantId && !plan) return meta
  const owner = await prisma.user.findFirst({ where: { clinicId, role: { in: ['OWNER', 'ADMIN', 'owner', 'admin'] } }, orderBy: { createdAt: 'asc' } })
  const result = await revah().provisionClinic({
    clinicId,
    clinicName: clinic.displayName || clinic.name,
    ownerEmail: owner?.email || clinic.email,
    ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : clinic.name,
    document: clinic.cnpj,
    plan: plan || meta.plan || 'PRO',
    webhookUrl: webhookUrl(clinicId),
    rotateApiKey: !meta.encryptedApiKey,
  })
  const patch: Partial<RevahFlagMetadata> = { revahTenantId: result.tenantId, plan: result.plan, provisionedAt: meta.provisionedAt || new Date().toISOString() }
  if (result.apiKey) patch.encryptedApiKey = encryptSecret(result.apiKey)
  if (result.webhookSecret) patch.encryptedWebhookSecret = encryptSecret(result.webhookSecret)
  await saveMeta(clinicId, clinic.tenantId, patch)
  return { ...meta, ...patch }
}

// Licença (feature flag): liga/desliga o Marketing para a clínica nos dois sistemas.
export async function setRevahLicense(clinicId: string, active: boolean, plan?: RevahPlan) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } })
  if (active) await ensureProvisioned(clinicId, plan)
  const { meta } = await getRevahFlag(clinicId)
  if (meta.revahTenantId) await revah().setLicense(clinicId, active, plan)
  return saveMeta(clinicId, clinic.tenantId, plan ? { plan } : {}, active)
}

export async function revahSsoUrl(user: { id: string; clinicId: string; role: string }) {
  const { row } = await getRevahFlag(user.clinicId)
  if (!row?.enabled) return null
  await ensureProvisioned(user.clinicId)
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const role = ['OWNER', 'ADMIN'].includes(String(user.role).toUpperCase()) ? String(user.role).toUpperCase() : 'AGENT'
  return revah().ssoUrl({ clinicId: user.clinicId, email: u.email, name: `${u.firstName} ${u.lastName}`.trim(), role })
}

// ---------------------------------------------------------------------------
// Eventos: agendamento, lembrete, falta, orçamento pendente, cobrança, recall e pós-operatório.
// Os ids são estáveis: o REVAH ignora eventos repetidos, então a varredura pode rodar sempre.
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo'
const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ })
const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NO_SHOW = ['NO_SHOW', 'MISSED', 'FALTOU', 'AUSENTE']
const CLOSED = ['CANCELLED', 'CANCELED', ...NO_SHOW]
const DONE = ['COMPLETED', 'FINALIZED', 'DONE', 'CONCLUIDO']
const POSTOP = /(cirurg|exodont|extra[cç]|implante|enxerto|siso|periodontal|canal|endodont)/i

function patientOf(p: { id: string; fullName: string; phone: string; email: string | null; cpf: string | null; birthDate: Date | null }) {
  return { id: p.id, name: p.fullName, phone: p.phone, email: p.email, document: p.cpf, birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null }
}

async function doctorNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>()
  const docs = await prisma.doctor.findMany({ where: { id: { in: ids } }, include: { user: { select: { firstName: true, lastName: true } } } })
  return new Map(docs.map((d) => [d.id, `${d.user.firstName} ${d.user.lastName}`.trim()]))
}

export async function collectRevahEvents(clinicId: string, since: Date, now = new Date()): Promise<RevahEvent[]> {
  const events: RevahEvent[] = []
  const tomorrowStart = new Date(now)
  tomorrowStart.setHours(24, 0, 0, 0)
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 86_400_000)
  const yesterday = new Date(now.getTime() - 86_400_000)

  const [created, tomorrow, noShows, canceled, completed] = await Promise.all([
    prisma.appointment.findMany({ where: { clinicId, createdAt: { gte: since }, scheduledAt: { gt: now }, status: { notIn: CLOSED } }, include: { patient: true }, take: 500 }),
    prisma.appointment.findMany({ where: { clinicId, scheduledAt: { gte: tomorrowStart, lt: tomorrowEnd }, status: { notIn: CLOSED } }, include: { patient: true }, take: 1000 }),
    prisma.appointment.findMany({ where: { clinicId, status: { in: NO_SHOW }, updatedAt: { gte: since } }, include: { patient: true }, take: 500 }),
    prisma.appointment.findMany({ where: { clinicId, status: { in: ['CANCELLED', 'CANCELED'] }, updatedAt: { gte: since } }, include: { patient: true }, take: 500 }),
    prisma.appointment.findMany({ where: { clinicId, status: { in: DONE }, scheduledAt: { gte: new Date(yesterday.getTime() - 86_400_000), lt: now } }, include: { patient: true }, take: 500 }),
  ])
  const names = await doctorNames([...new Set([...created, ...tomorrow].map((a) => a.doctorId))])
  const apptData = (a: { scheduledAt: Date; doctorId: string; procedure: string }) => ({ data: fmtDate(a.scheduledAt), hora: fmtTime(a.scheduledAt), profissional: names.get(a.doctorId) || '', procedimento: a.procedure })

  for (const a of created) events.push({ id: `appt:${a.id}:scheduled:${a.scheduledAt.toISOString()}`, type: 'appointment.scheduled', patient: patientOf(a.patient), data: apptData(a) })
  for (const a of tomorrow) events.push({ id: `appt:${a.id}:reminder:${a.scheduledAt.toISOString().slice(0, 10)}`, type: 'appointment.reminder', patient: patientOf(a.patient), data: apptData(a) })
  for (const a of noShows) events.push({ id: `appt:${a.id}:no_show`, type: 'appointment.no_show', patient: patientOf(a.patient), data: { data: fmtDate(a.scheduledAt), hora: fmtTime(a.scheduledAt), procedimento: a.procedure } })
  for (const a of canceled) events.push({ id: `appt:${a.id}:canceled`, type: 'appointment.canceled', patient: patientOf(a.patient), data: { data: fmtDate(a.scheduledAt), hora: fmtTime(a.scheduledAt) } })
  for (const a of completed) {
    if (POSTOP.test(a.procedure)) events.push({ id: `appt:${a.id}:postop`, type: 'postop.followup', patient: patientOf(a.patient), data: { procedimento: a.procedure, data: fmtDate(a.scheduledAt) } })
  }

  // Orçamento pendente há 2+ dias (até 30 dias).
  const budgets = await prisma.budget.findMany({
    where: { clinicId, status: 'PENDING', createdAt: { lte: new Date(now.getTime() - 2 * 86_400_000), gte: new Date(now.getTime() - 30 * 86_400_000) } },
    include: { patient: true },
    take: 500,
  })
  for (const b of budgets) events.push({ id: `budget:${b.id}:pending`, type: 'budget.pending', patient: patientOf(b.patient), data: { procedimento: b.description, valor: money(b.totalAmount) } })

  // Cobrança: 2 dias antes do vencimento e 3 dias após (se ainda em aberto).
  const in2 = new Date(now.getTime() + 2 * 86_400_000)
  const ago3 = new Date(now.getTime() - 3 * 86_400_000)
  const dayRange = (d: Date) => {
    const s = new Date(d)
    s.setHours(0, 0, 0, 0)
    return { gte: s, lt: new Date(s.getTime() + 86_400_000) }
  }
  for (const [stage, range] of [['antes', dayRange(in2)], ['atraso', dayRange(ago3)]] as const) {
    const entries = await prisma.financialEntry.findMany({
      where: { clinicId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, patientId: { not: null }, dueDate: range },
      include: { patient: true },
      take: 1000,
    })
    for (const f of entries) {
      if (!f.patient) continue
      events.push({
        id: `fin:${f.id}:${stage}:${f.dueDate.toISOString().slice(0, 10)}`,
        type: 'billing.due',
        patient: patientOf(f.patient),
        data: { valor: money(f.amount), vencimento: fmtDate(f.dueDate), link_pagamento: f.documentUrl || '', situacao: stage === 'atraso' ? 'em atraso' : 'a vencer' },
      })
    }
  }

  // Recall: última consulta concluída há ~6 meses e nada agendado no futuro.
  const recallFrom = new Date(now.getTime() - 187 * 86_400_000)
  const recallTo = new Date(now.getTime() - 180 * 86_400_000)
  const candidates = await prisma.appointment.findMany({ where: { clinicId, status: { in: DONE }, scheduledAt: { gte: recallFrom, lt: recallTo } }, include: { patient: true }, take: 1000 })
  const seen = new Set<string>()
  for (const a of candidates) {
    if (seen.has(a.patientId)) continue
    seen.add(a.patientId)
    const later = await prisma.appointment.count({ where: { clinicId, patientId: a.patientId, scheduledAt: { gt: a.scheduledAt } } })
    if (later) continue
    events.push({ id: `recall:${a.patientId}:${now.toISOString().slice(0, 7)}`, type: 'recall.due', patient: patientOf(a.patient), data: { data: fmtDate(a.scheduledAt) } })
  }
  return events
}

export async function syncClinicWithRevah(clinicId: string) {
  const { row, meta } = await getRevahFlag(clinicId)
  if (!row?.enabled) return { skipped: 'desativado' }
  const provisioned = await ensureProvisioned(clinicId)
  const apiKey = decryptSecret<string>(provisioned.encryptedApiKey)
  if (!apiKey) return { skipped: 'sem chave' }
  const since = meta.lastSyncAt ? new Date(new Date(meta.lastSyncAt).getTime() - 10 * 60_000) : new Date(Date.now() - 86_400_000)
  const startedAt = new Date()
  const events = await collectRevahEvents(clinicId, since, startedAt)
  let sent = 0
  let errors = 0
  for (let i = 0; i < events.length; i += 200) {
    const r = await revah().sendEvents(apiKey, events.slice(i, i + 200))
    sent += r.results.filter((x) => !x.error).length
    errors += r.results.filter((x) => x.error).length
  }
  const result = { events: events.length, sent, errors }
  await saveMeta(clinicId, row.tenantId, { lastSyncAt: startedAt.toISOString(), lastSyncResult: result })
  return result
}

export async function syncAllClinics() {
  const flags = await prisma.tenantFeatureFlag.findMany({ where: { key: REVAH_FLAG, enabled: true }, select: { clinicId: true } })
  const out: Record<string, unknown> = {}
  for (const f of flags) {
    try {
      out[f.clinicId] = await syncClinicWithRevah(f.clinicId)
    } catch (e: any) {
      out[f.clinicId] = { error: e?.message || String(e) }
    }
  }
  return out
}

export async function verifyWebhookForClinic(clinicId: string, raw: Buffer | undefined, ts?: string, sig?: string) {
  const { meta } = await getRevahFlag(clinicId)
  const secret = decryptSecret<string>(meta.encryptedWebhookSecret)
  return Boolean(raw && secret && verifyRevahWebhook(raw, ts, sig, secret))
}
