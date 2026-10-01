import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

export const LAB_CHANNELS = ['WHATSAPP', 'SMS', 'TELEGRAM'] as const
// O texto de "antes da entrega" diz "amanhã": o aviso sai 1 dia antes. Ajuste aqui se a clínica preferir 2 dias.
export const BEFORE_DUE_DAYS = 1
export const FOLLOW_UP_DAYS = 2
const DAY = 86400000
let running = false

type Snapshot = { patientName: string; workType: string; teeth?: string | null; dueDateISO?: string | null; dentistName: string; clinicName: string }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function labMessage(type: string, s: Snapshot) {
  if (type === 'ON_CREATE') {
    const head = `Pac ${s.patientName} — ${s.workType}${s.teeth ? ` no ${s.teeth}` : ''}${s.dueDateISO ? ` — para dia ${dm(s.dueDateISO)}` : ''}`
    return `${head}\nClínica ${s.clinicName} — ${s.dentistName}.`
  }
  if (type === 'FOLLOW_UP') return `Este é um lembrete sobre o trabalho do paciente ${s.patientName} para honrarmos o prazo com o paciente.`
  if (type === 'BEFORE_DUE') return `O trabalho do paciente ${s.patientName} tem entrega prevista para amanhã, confira se o mesmo já está em andamento.`
  return `Hoje é dia de entregar o trabalho do paciente ${s.patientName} na clínica ${s.clinicName} para o ${s.dentistName}. Agradecemos pelos trabalhos executados.`
}

// 08:00 no horário de Brasília (UTC-3) do dia informado (AAAA-MM-DD).
const at8Brt = (iso: string) => new Date(`${iso}T11:00:00.000Z`)
const shiftDay = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00.000Z`).getTime() + days * DAY).toISOString().slice(0, 10)

export function planNotifications(input: { isNew: boolean; createdAt: Date; dueDateISO?: string | null; now?: Date }) {
  const now = (input.now || new Date()).getTime()
  const plan: Array<{ type: string; scheduledFor: Date }> = []
  if (input.isNew) plan.push({ type: 'ON_CREATE', scheduledFor: new Date(now) })
  const due = input.dueDateISO && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDateISO) ? input.dueDateISO : null
  const followUp = new Date(input.createdAt.getTime() + FOLLOW_UP_DAYS * DAY)
  if (followUp.getTime() > now && (!due || followUp.getTime() < at8Brt(due).getTime())) plan.push({ type: 'FOLLOW_UP', scheduledFor: followUp })
  if (due) {
    const before = at8Brt(shiftDay(due, -BEFORE_DUE_DAYS))
    if (before.getTime() > now) plan.push({ type: 'BEFORE_DUE', scheduledFor: before })
    const onDay = at8Brt(due)
    if (onDay.getTime() > now) plan.push({ type: 'ON_DUE_DAY', scheduledFor: onDay })
  }
  return plan
}

async function postpone(id: string, message: string, scheduledFor: Date) {
  // Depois de 24h tentando, desiste e marca como falha para o gestor ver.
  if (Date.now() - scheduledFor.getTime() > DAY) {
    await prisma.labNotification.update({ where: { id }, data: { status: 'FAILED', errorMessage: message } })
    return
  }
  await prisma.labNotification.update({ where: { id }, data: { scheduledFor: new Date(Date.now() + 10 * 60 * 1000), errorMessage: message } })
}

export async function processDueLabNotifications(clinicId?: string) {
  if (running) return
  running = true
  try {
    const rows = await prisma.labNotification.findMany({
      where: { status: 'PENDING', scheduledFor: { lte: new Date() }, ...(clinicId ? { clinicId } : {}) },
      orderBy: { scheduledFor: 'asc' },
      take: 50
    })
    for (const row of rows) {
      const channel = row.channel as RevahChannel
      const member = await prisma.teamMember.findFirst({ where: { id: row.labMemberId, clinicId: row.clinicId, isActive: true } })
      if (!member) { await prisma.labNotification.update({ where: { id: row.id }, data: { status: 'CANCELLED', errorMessage: 'Laboratório inativado ou removido.' } }); continue }
      const destination = channel === 'TELEGRAM' ? member.telegramChatId || '' : member.phone || ''
      if (!destination) { await postpone(row.id, channel === 'TELEGRAM' ? 'Laboratório sem Telegram (chat ID) cadastrado.' : 'Laboratório sem telefone cadastrado.', row.scheduledFor); continue }
      const sender = await prisma.revahSender.findFirst({ where: { clinicId: row.clinicId, tenantId: row.tenantId, channel, isDefault: true, isActive: true } })
      if (!sender) { await postpone(row.id, `Configure um remetente ativo para ${channel}.`, row.scheduledFor); continue }
      let credentials: Record<string, unknown> = {}
      try { credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {} }
      catch { await postpone(row.id, `Credenciais de ${channel} não puderam ser abertas.`, row.scheduledFor); continue }
      if (!Object.keys(credentials).length || credentials.simulated === true) { await postpone(row.id, `Credenciais reais de ${channel} ainda não configuradas.`, row.scheduledFor); continue }
      try {
        // WhatsApp somente pela API oficial da Meta (dispatchRevah).
        const result = await dispatchRevah(channel, destination, row.message, credentials, sender.address)
        if (result.simulated) { await postpone(row.id, `O provedor ${result.provider} está em modo simulado.`, row.scheduledFor); continue }
        await prisma.$transaction([
          prisma.labNotification.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), errorMessage: null } }),
          prisma.revahMessage.create({ data: { clinicId: row.clinicId, tenantId: row.tenantId, senderId: sender.id, channel, destination, content: row.message, contactName: member.fullName, provider: result.provider, providerMessageId: result.providerMessageId, status: 'SENT', sentAt: new Date() } })
        ])
      } catch (error) {
        await postpone(row.id, error instanceof Error ? error.message : 'Falha no envio.', row.scheduledFor)
      }
    }
  } finally {
    running = false
  }
}
