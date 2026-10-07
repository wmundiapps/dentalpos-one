import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

// Retorno de pacientes ausentes: encontra quem não comparece há X dias (e não tem consulta futura) e envia um contato
// de acompanhamento por e-mail/WhatsApp com o link da agenda online. Sem tabela nova: a configuração fica na flag da clínica
// e o histórico/controle de repetição usa as próprias mensagens enviadas (RevahMessage, marcadas com [RETORNO]).
export const FLAG_KEY = 'ABSENCE_RECALL'
export const PERIODS_DAYS = [7, 15, 30, 45, 60, 75, 90, 120, 150, 180, 210, 365, 548, 730, 913, 1095] as const
export const MARKER = '[RETORNO]'
const DAY = 86400000
const START_HOUR_BRT = 9
const DEFAULT_DAILY_LIMIT = 30
const MAX_DAILY_LIMIT = 200
let running = false

export type AbsenceSettings = { enabled: boolean; periodDays: number; channels: RevahChannel[]; dailyLimit: number }
export type Candidate = { patientId: string; name: string; email: string | null; phone: string; lastVisit: string; daysAway: number }

export const brtDay = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const startOfTodayBrt = (now = new Date()) => new Date(new Date(`${brtDay(now)}T00:00:00-03:00`).getTime())

export async function loadSettings(clinicId: string): Promise<AbsenceSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const m = (row?.metadata || {}) as { periodDays?: number; channels?: string[]; dailyLimit?: number }
  const channels = (Array.isArray(m.channels) ? m.channels : ['EMAIL']).filter((c): c is RevahChannel => c === 'EMAIL' || c === 'WHATSAPP')
  return {
    enabled: row?.enabled === true,
    periodDays: (PERIODS_DAYS as readonly number[]).includes(Number(m.periodDays)) ? Number(m.periodDays) : 90,
    channels: channels.length ? channels : ['EMAIL'],
    dailyLimit: Math.min(MAX_DAILY_LIMIT, Math.max(1, Math.round(Number(m.dailyLimit) || DEFAULT_DAILY_LIMIT))),
  }
}

export async function saveSettings(clinicId: string, tenantId: string, s: AbsenceSettings) {
  const metadata = { periodDays: s.periodDays, channels: s.channels, dailyLimit: s.dailyLimit }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: s.enabled, metadata },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: s.enabled, rolloutStage: 'GA', metadata },
  })
}

// Pacientes ativos cuja última consulta realizada foi há pelo menos `periodDays`, sem nenhuma consulta futura marcada.
export async function findCandidates(clinicId: string, tenantId: string, periodDays: number, now = new Date()): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - periodDays * DAY)
  const rows = await prisma.$queryRaw<Array<{ id: string; fullName: string; email: string | null; phone: string; last: Date }>>`
    SELECT p."id", p."fullName", p."email", p."phone", MAX(a."scheduledAt") AS last
    FROM "Patient" p
    JOIN "Appointment" a ON a."patientId" = p."id" AND a."clinicId" = ${clinicId} AND a."tenantId" = ${tenantId} AND a."status" = 'COMPLETED'
    WHERE p."clinicId" = ${clinicId} AND p."tenantId" = ${tenantId} AND p."isActive" = true AND COALESCE(p."status", 'Ativo') <> 'Inativo'
      AND NOT EXISTS (SELECT 1 FROM "Appointment" f WHERE f."patientId" = p."id" AND f."scheduledAt" > ${now} AND f."status" NOT IN ('CANCELLED', 'NO_SHOW'))
    GROUP BY p."id", p."fullName", p."email", p."phone"
    HAVING MAX(a."scheduledAt") <= ${cutoff}
    ORDER BY MAX(a."scheduledAt") ASC
    LIMIT 2000`
  return rows.map((r) => ({ patientId: r.id, name: r.fullName, email: r.email, phone: r.phone, lastVisit: r.last.toISOString(), daysAway: Math.floor((now.getTime() - r.last.getTime()) / DAY) }))
}

export function bookingLink(clinicId: string) {
  const base = String(process.env.PUBLIC_APP_URL || '').trim() || 'https://app.dentalpos.com.br'
  return `${base.replace(/\/$/, '')}/agendamento-online?clinicId=${encodeURIComponent(clinicId)}`
}

export function buildMessage(clinicName: string, patientName: string, link: string) {
  const first = patientName.trim().split(/\s+/)[0] || 'paciente'
  return `${MARKER} Olá, ${first}! Este é um e-mail de acompanhamento da ${clinicName}. Sentimos a sua falta e queremos cuidar do seu sorriso. Para agendar o seu retorno, escolha o dia e o horário que preferir na nossa agenda online: ${link}\n\nSe preferir, responda esta mensagem ou ligue para a clínica. Cuidar da saúde bucal com regularidade evita tratamentos mais complexos. Se não quiser receber este tipo de contato, é só nos avisar.`
}

async function sendOne(clinicId: string, tenantId: string, channel: RevahChannel, destination: string, name: string, message: string) {
  const sender = await prisma.revahSender.findFirst({ where: { clinicId, tenantId, channel, isDefault: true, isActive: true } })
  const platformKey = channel === 'EMAIL' && !sender ? String(process.env.RESEND_API_KEY || '').trim() : ''
  if (!sender && !platformKey) return { ok: false as const, reason: `Sem remetente ativo para ${channel}.` }
  let credentials: Record<string, unknown> = {}
  if (sender) {
    try { credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} } catch { return { ok: false as const, reason: 'Credenciais do canal não puderam ser abertas.' } }
  } else credentials = { apiKey: platformKey }
  if (!Object.keys(credentials).length || credentials.simulated === true) return { ok: false as const, reason: `Canal ${channel} ainda sem credenciais reais.` }
  const address = sender ? sender.address : 'DentalPos One <contato@dentalpos.com.br>'
  try {
    const result = await dispatchRevah(channel, destination, message.replace(MARKER, '').trim(), channel === 'EMAIL' ? { ...credentials, subject: 'Acompanhamento: vamos agendar o seu retorno?' } : credentials, address)
    if (result.simulated) return { ok: false as const, reason: `Provedor ${result.provider} em modo simulado.` }
    await prisma.revahMessage.create({ data: { clinicId, tenantId, senderId: sender?.id ?? null, channel, destination, content: message, contactName: name, provider: result.provider, providerMessageId: result.providerMessageId, status: 'SENT', sentAt: new Date() } })
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : 'Falha no envio.' }
  }
}

export type RunResult = { candidates: number; eligible: number; sent: number; skipped: number; failures: string[]; dryRun: boolean }

// Envia (ou simula) os contatos de hoje. Nunca repete o contato para o mesmo paciente dentro do período escolhido.
export async function runForClinic(clinicId: string, tenantId: string, opts: { dryRun?: boolean; now?: Date } = {}): Promise<RunResult> {
  const now = opts.now || new Date()
  const settings = await loadSettings(clinicId)
  const clinic = await prisma.clinic.findFirst({ where: { id: clinicId }, select: { name: true, displayName: true } })
  const clinicName = clinic?.displayName || clinic?.name || 'clínica'
  const candidates = await findCandidates(clinicId, tenantId, settings.periodDays, now)
  const sentToday = await prisma.revahMessage.count({ where: { clinicId, content: { startsWith: MARKER }, createdAt: { gte: startOfTodayBrt(now) } } })
  let budget = Math.max(0, settings.dailyLimit - sentToday)

  const since = new Date(now.getTime() - settings.periodDays * DAY)
  const recent = await prisma.revahMessage.findMany({ where: { clinicId, content: { startsWith: MARKER }, createdAt: { gte: since }, status: 'SENT' }, select: { destination: true } })
  const already = new Set(recent.map((r) => r.destination.toLowerCase()))

  const result: RunResult = { candidates: candidates.length, eligible: 0, sent: 0, skipped: 0, failures: [], dryRun: Boolean(opts.dryRun) }
  const link = bookingLink(clinicId)
  for (const c of candidates) {
    const targets: Array<{ channel: RevahChannel; destination: string }> = []
    if (settings.channels.includes('EMAIL') && c.email) targets.push({ channel: 'EMAIL', destination: c.email })
    if (settings.channels.includes('WHATSAPP') && c.phone) targets.push({ channel: 'WHATSAPP', destination: c.phone })
    const fresh = targets.filter((t) => !already.has(t.destination.toLowerCase()))
    if (!fresh.length) { result.skipped += 1; continue }
    result.eligible += 1
    if (opts.dryRun) continue
    if (budget <= 0) continue
    const message = buildMessage(clinicName, c.name, link)
    let any = false
    for (const t of fresh) {
      const r = await sendOne(clinicId, tenantId, t.channel, t.destination, c.name, message)
      if (r.ok) { any = true; already.add(t.destination.toLowerCase()) } else if (result.failures.length < 5 && !result.failures.includes(r.reason)) result.failures.push(r.reason)
    }
    if (any) { result.sent += 1; budget -= 1 }
  }
  return result
}

// Contatos enviados hoje (alerta da recepção).
export async function sentToday(clinicId: string, now = new Date()) {
  const rows = await prisma.revahMessage.findMany({
    where: { clinicId, content: { startsWith: MARKER }, createdAt: { gte: startOfTodayBrt(now) } },
    select: { contactName: true, channel: true, status: true }, orderBy: { createdAt: 'desc' }, take: 200,
  })
  const sent = rows.filter((r) => r.status === 'SENT')
  return { emails: sent.filter((r) => r.channel === 'EMAIL').length, whatsapps: sent.filter((r) => r.channel === 'WHATSAPP').length, names: [...new Set(sent.map((r) => r.contactName))].slice(0, 20) }
}

// Chamado pelo cron diário: percorre as clínicas com o retorno automático ligado.
export async function processAbsenceRecalls(now = new Date()) {
  if (running) return
  running = true
  try {
    if (new Date(now.getTime() - 3 * 3600000).getUTCHours() < START_HOUR_BRT) return
    const flags = await prisma.tenantFeatureFlag.findMany({ where: { key: FLAG_KEY, enabled: true }, select: { clinicId: true, tenantId: true } })
    for (const f of flags) await runForClinic(f.clinicId, f.tenantId, { now }).catch((e) => console.error('Retorno de ausentes:', e))
  } finally { running = false }
}
