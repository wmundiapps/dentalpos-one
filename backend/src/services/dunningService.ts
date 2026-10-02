import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

// Régua de cobrança do paciente: todo dia do 1º ao 15º dia de atraso, depois no 20º e no 30º, e por fim o aviso de que
// a cobrança saiu da base administrativa e está com o departamento jurídico (a partir do 31º dia, uma única vez).
export const FLAG_KEY = 'DUNNING'
export const DUNNING_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const
const DAY = 86400000
const LEGAL_FROM = 31
const LEGAL_UNTIL = 60
const START_HOUR_BRT = 9
let running = false

export type DunningSettings = { enabled: boolean; since: string | null; includeOlder: boolean; channel: RevahChannel }

export const brtDay = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
const daysBetween = (fromISO: string, toISO: string) => Math.round((new Date(`${toISO}T12:00:00Z`).getTime() - new Date(`${fromISO}T12:00:00Z`).getTime()) / DAY)
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function stageFor(daysOverdue: number): string | null {
  if (daysOverdue >= 1 && daysOverdue <= 15) return `D${daysOverdue}`
  if (daysOverdue === 20) return 'D20'
  if (daysOverdue === 30) return 'D30'
  if (daysOverdue >= LEGAL_FROM && daysOverdue <= LEGAL_UNTIL) return 'LEGAL'
  return null
}

export type DunningCtx = { patientName: string; clinicName: string; amount: number; dueISO: string; daysOverdue: number; link?: string | null }

export function dunningMessage(stage: string, c: DunningCtx) {
  const first = c.patientName.trim().split(/\s+/)[0] || 'paciente'
  const base = `${c.clinicName}: ${first}, o pagamento de ${brl(c.amount)} com vencimento em ${dmy(c.dueISO)}`
  const pay = c.link ? ` Para pagar agora: ${c.link}` : ' Para regularizar, fale com a nossa recepção.'
  if (stage === 'LEGAL') {
    return `${c.clinicName}: ${first}, como não identificamos a regularização do pagamento de ${brl(c.amount)} (vencimento em ${dmy(c.dueISO)}), informamos que a cobrança saiu da base administrativa e foi encaminhada ao nosso departamento jurídico para as providências cabíveis.${pay} Se já pagou, desconsidere e nos envie o comprovante.`
  }
  if (stage === 'D30') return `${base} está em atraso há 30 dias. Precisamos regularizar com urgência para evitar o encaminhamento da cobrança ao departamento jurídico.${pay} Se já pagou, envie o comprovante.`
  if (stage === 'D20') return `${base} está em atraso há 20 dias. Pedimos que regularize o quanto antes.${pay} Se já pagou, envie o comprovante.`
  if (c.daysOverdue === 1) return `${base} venceu ontem. Lembrete amigável para regularizar.${pay} Se já pagou, desconsidere esta mensagem.`
  return `${base} está em atraso há ${c.daysOverdue} dias.${pay} Se já pagou, desconsidere esta mensagem.`
}

export async function loadDunningSettings(clinicId: string): Promise<DunningSettings> {
  const row = await prisma.tenantFeatureFlag.findUnique({ where: { clinicId_key: { clinicId, key: FLAG_KEY } } })
  const meta = (row?.metadata || {}) as { since?: string; includeOlder?: boolean; channel?: string }
  const channel = (DUNNING_CHANNELS as readonly string[]).includes(String(meta.channel)) ? (meta.channel as RevahChannel) : 'WHATSAPP'
  // Padrão desligado: a régua só começa a enviar quando o gestor liga.
  return { enabled: row ? row.enabled : false, since: meta.since || null, includeOlder: Boolean(meta.includeOlder), channel }
}

export async function saveDunningSettings(clinicId: string, tenantId: string, s: DunningSettings) {
  const metadata = { since: s.since, includeOlder: s.includeOlder, channel: s.channel }
  await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId, key: FLAG_KEY } },
    update: { enabled: s.enabled, metadata },
    create: { clinicId, tenantId, key: FLAG_KEY, enabled: s.enabled, rolloutStage: 'GA', metadata }
  })
}

type Candidate = { entryId: string; patientId: string; patientName: string; phone: string; email: string | null; amount: number; dueISO: string; daysOverdue: number; stage: string }

// Lançamentos a receber em atraso que têm aviso a enviar hoje (sem duplicar o que já foi enviado).
export async function dunningCandidates(clinicId: string, tenantId: string, settings: DunningSettings, now = new Date()): Promise<Candidate[]> {
  const today = brtDay(now)
  const from = new Date(now.getTime() - (LEGAL_UNTIL + 3) * DAY)
  const entries = await prisma.financialEntry.findMany({
    where: { clinicId, tenantId, type: 'INCOME', status: { notIn: ['PAID', 'CANCELLED'] }, patientId: { not: null }, dueDate: { gte: from, lt: now } },
    select: { id: true, patientId: true, amount: true, dueDate: true, patient: { select: { fullName: true, phone: true, email: true } } },
    take: 1000
  })
  const out: Candidate[] = []
  for (const e of entries) {
    if (!e.patientId || !e.patient) continue
    // Datas do vencimento ficam ao meio-dia de Brasília; as antigas à meia-noite UTC. O dia UTC vale para as duas.
    const dueISO = e.dueDate.toISOString().slice(0, 10)
    if (!settings.includeOlder && settings.since && dueISO < settings.since) continue
    const daysOverdue = daysBetween(dueISO, today)
    const stage = stageFor(daysOverdue)
    if (!stage) continue
    out.push({ entryId: e.id, patientId: e.patientId, patientName: e.patient.fullName, phone: e.patient.phone || '', email: e.patient.email, amount: Number(e.amount), dueISO, daysOverdue, stage })
  }
  if (!out.length) return out
  const done = await prisma.dunningNotice.findMany({ where: { financialEntryId: { in: out.map(c => c.entryId) } }, select: { financialEntryId: true, stage: true } })
  const sent = new Set(done.map(d => `${d.financialEntryId}:${d.stage}`))
  return out.filter(c => !sent.has(`${c.entryId}:${c.stage}`))
}

async function sendNotice(notice: { id: string; clinicId: string; tenantId: string; channel: string; message: string; scheduledFor: Date; financialEntryId: string }, destination: string, contactName: string) {
  const channel = notice.channel as RevahChannel
  const fail = async (message: string) => {
    // Tenta de novo a cada 30 minutos por até 24h; depois desiste e deixa FAILED para o gestor ver.
    if (Date.now() - notice.scheduledFor.getTime() > DAY) await prisma.dunningNotice.update({ where: { id: notice.id }, data: { status: 'FAILED', errorMessage: message } })
    else await prisma.dunningNotice.update({ where: { id: notice.id }, data: { errorMessage: message, scheduledFor: new Date(Date.now() + 30 * 60 * 1000) } })
  }
  const sender = await prisma.revahSender.findFirst({ where: { clinicId: notice.clinicId, tenantId: notice.tenantId, channel, isDefault: true, isActive: true } })
  if (!sender) return fail(`Configure um remetente ativo para ${channel}.`)
  let credentials: Record<string, unknown> = {}
  try { credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} } catch { return fail(`Credenciais de ${channel} não puderam ser abertas.`) }
  if (!Object.keys(credentials).length || credentials.simulated === true) return fail(`Credenciais reais de ${channel} ainda não configuradas.`)
  try {
    const result = await dispatchRevah(channel, destination, notice.message, credentials, sender.address)
    if (result.simulated) return fail(`O provedor ${result.provider} está em modo simulado.`)
    await prisma.$transaction([
      prisma.dunningNotice.update({ where: { id: notice.id }, data: { status: 'SENT', sentAt: new Date(), errorMessage: null } }),
      prisma.revahMessage.create({ data: { clinicId: notice.clinicId, tenantId: notice.tenantId, senderId: sender.id, channel, destination, content: notice.message, contactName, provider: result.provider, providerMessageId: result.providerMessageId, status: 'SENT', sentAt: new Date() } })
    ])
  } catch (error) {
    await fail(error instanceof Error ? error.message : 'Falha no envio.')
  }
}

export async function processDunning(clinicId?: string, nowOverride?: Date) {
  if (running) return
  running = true
  try {
    const now = nowOverride || new Date()
    if (new Date(now.getTime() - 3 * 3600000).getUTCHours() < START_HOUR_BRT) return
    const flags = await prisma.tenantFeatureFlag.findMany({ where: { key: FLAG_KEY, enabled: true, ...(clinicId ? { clinicId } : {}) }, select: { clinicId: true, tenantId: true } })
    for (const flag of flags) {
      const settings = await loadDunningSettings(flag.clinicId)
      if (!settings.enabled) continue
      const clinic = await prisma.clinic.findFirst({ where: { id: flag.clinicId }, select: { name: true } })
      const clinicName = clinic?.name || 'Clínica'
      // 1) cria os avisos de hoje
      for (const c of await dunningCandidates(flag.clinicId, flag.tenantId, settings, now)) {
        const charge = await prisma.receivableCharge.findFirst({ where: { clinicId: flag.clinicId, financialEntryId: c.entryId, status: { notIn: ['PAGO', 'CANCELADO'] } }, select: { invoiceUrl: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
        const destination = settings.channel === 'EMAIL' ? c.email || '' : c.phone
        const message = dunningMessage(c.stage, { patientName: c.patientName, clinicName, amount: c.amount, dueISO: c.dueISO, daysOverdue: c.daysOverdue, link: charge?.invoiceUrl })
        await prisma.dunningNotice.create({
          data: {
            clinicId: flag.clinicId, tenantId: flag.tenantId, financialEntryId: c.entryId, patientId: c.patientId, stage: c.stage, channel: settings.channel, message, scheduledFor: now,
            ...(destination ? {} : { status: 'FAILED', errorMessage: settings.channel === 'EMAIL' ? 'Paciente sem e-mail cadastrado.' : 'Paciente sem telefone cadastrado.' })
          }
        }).catch(() => null) // índice único: outro processo já criou este aviso
      }
      // 2) envia os pendentes (inclui tentativas anteriores que falharam)
      const pending = await prisma.dunningNotice.findMany({ where: { clinicId: flag.clinicId, status: 'PENDING', scheduledFor: { lte: now } }, orderBy: { scheduledFor: 'asc' }, take: 100 })
      for (const n of pending) {
        const entry = await prisma.financialEntry.findFirst({ where: { id: n.financialEntryId, clinicId: n.clinicId }, select: { status: true, patient: { select: { fullName: true, phone: true, email: true } } } })
        if (!entry || ['PAID', 'CANCELLED'].includes(entry.status)) { await prisma.dunningNotice.update({ where: { id: n.id }, data: { status: 'CANCELLED', errorMessage: 'Lançamento quitado ou cancelado.' } }); continue }
        const destination = n.channel === 'EMAIL' ? entry.patient?.email || '' : entry.patient?.phone || ''
        if (!destination) { await prisma.dunningNotice.update({ where: { id: n.id }, data: { status: 'FAILED', errorMessage: 'Paciente sem contato cadastrado.' } }); continue }
        await sendNotice(n, destination, entry.patient?.fullName || '')
      }
    }
  } finally {
    running = false
  }
}
