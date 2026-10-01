import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

export const LAB_CHANNELS = ['WHATSAPP', 'SMS', 'TELEGRAM'] as const
const DAY = 86400000
const DELIVERED = ['Entregue', 'Liberado']
// Depois de tantos dias de atraso o aviso diário para (a ordem continua no sistema).
const MAX_OVERDUE_DAYS = 60
let running = false
let runningDaily = false

type Snapshot = { patientName: string; workType: string; teeth?: string | null; dueDateISO?: string | null; dentistName: string; clinicName: string; status?: string }

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Dia (AAAA-MM-DD) no horário de Brasília e diferença em dias de calendário.
export const brtDay = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10)
export function daysUntil(dueISO: string, today: string) {
  return Math.round((new Date(`${dueISO}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / DAY)
}

// Nível de risco conforme a data de entrega se aproxima. Texto simples (sem emoji) para funcionar também em SMS.
export function riskLevel(daysLeft: number) {
  if (daysLeft < 0) return { key: 'ATRASADO', tag: '[ATRASADO]' }
  if (daysLeft === 0) return { key: 'HOJE', tag: '[ENTREGA HOJE]' }
  if (daysLeft === 1) return { key: 'ALTO', tag: '[RISCO ALTO]' }
  if (daysLeft <= 3) return { key: 'ATENCAO', tag: '[ATENÇÃO]' }
  return { key: 'NO_PRAZO', tag: '[NO PRAZO]' }
}

const workLine = (s: Snapshot) => `${s.workType}${s.teeth ? ` no ${s.teeth}` : ''}`

export function labMessage(type: string, s: Snapshot, today?: string) {
  if (type === 'ON_CREATE') {
    const head = `Pac ${s.patientName} — ${workLine(s)}${s.dueDateISO ? ` — para dia ${dm(s.dueDateISO)}` : ''}`
    return `${head}\nClínica ${s.clinicName} — ${s.dentistName}.`
  }
  // Aviso diário: o nível de risco muda conforme chega a data de entrega.
  if (!s.dueDateISO || !today) {
    return `[ACOMPANHAMENTO] Lembrete sobre o trabalho do paciente ${s.patientName} (${workLine(s)}) para honrarmos o prazo com o paciente. Status: ${s.status || 'em andamento'}.`
  }
  const left = daysUntil(s.dueDateISO, today)
  const risk = riskLevel(left)
  const due = dm(s.dueDateISO)
  if (left < 0) return `${risk.tag} O trabalho do paciente ${s.patientName} (${workLine(s)}) está atrasado há ${plural(-left, 'dia', 'dias')} (entrega era ${due}). Status: ${s.status || '-'}. Informe a nova previsão de entrega com urgência.`
  if (left === 0) return `${risk.tag} Hoje é dia de entregar o trabalho do paciente ${s.patientName} (${workLine(s)}) na clínica ${s.clinicName} para o ${s.dentistName}. Agradecemos pelos trabalhos executados.`
  if (left === 1) return `${risk.tag} O trabalho do paciente ${s.patientName} (${workLine(s)}) tem entrega prevista para amanhã (${due}), confira se o mesmo já está em andamento. Status: ${s.status || '-'}.`
  return `${risk.tag} Trabalho do paciente ${s.patientName} (${workLine(s)}): faltam ${plural(left, 'dia', 'dias')} para a entrega em ${due}. Status: ${s.status || '-'}. Confira se está em andamento para honrarmos o prazo com o paciente.`
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


// Uma vez por dia (a partir das 08:00 de Brasília), cada ordem com avisos ligados e ainda não entregue recebe o aviso
// do dia, com o risco calculado agora. Atrasadas continuam recebendo todo dia até a entrega.
export async function processDailyLabRisk(clinicId?: string, nowOverride?: Date) {
  if (runningDaily) return
  runningDaily = true
  try {
    const now = nowOverride || new Date()
    const brtHour = new Date(now.getTime() - 3 * 3600000).getUTCHours()
    if (brtHour < 8) return
    const today = brtDay(now)
    const startOfToday = new Date(`${today}T00:00:00-03:00`)
    const orders = await prisma.labOrder.findMany({
      where: { deletedAt: null, deliveredAt: null, notifyLabMemberId: { not: null }, NOT: { notifyChannels: { isEmpty: true } }, ...(clinicId ? { clinicId } : {}) },
      take: 500
    })
    const clinicNames = new Map<string, string>()
    for (const order of orders) {
      if (DELIVERED.includes(order.status)) continue
      const dueISO = order.dueDate ? brtDay(order.dueDate) : null
      if (dueISO && daysUntil(dueISO, today) < -MAX_OVERDUE_DAYS) continue
      if (!clinicNames.has(order.clinicId)) {
        const clinic = await prisma.clinic.findFirst({ where: { id: order.clinicId }, select: { name: true } })
        clinicNames.set(order.clinicId, clinic?.name || 'DentalPos')
      }
      const data = (order.data || {}) as Record<string, unknown>
      const snapshot: Snapshot = {
        patientName: order.patientName, workType: order.workType, teeth: data.teeth ? String(data.teeth) : null, dueDateISO: dueISO,
        dentistName: order.dentistName || 'o dentista responsável', clinicName: clinicNames.get(order.clinicId) || 'DentalPos', status: order.status
      }
      for (const channel of order.notifyChannels) {
        const already = await prisma.labNotification.findFirst({
          where: { clinicId: order.clinicId, workRef: order.localId, channel, type: { in: ['ON_CREATE', 'DAILY'] }, status: { not: 'CANCELLED' }, createdAt: { gte: startOfToday } },
          select: { id: true }
        })
        if (already) continue
        await prisma.labNotification.create({
          data: { clinicId: order.clinicId, tenantId: order.tenantId, workRef: order.localId, labMemberId: order.notifyLabMemberId as string, type: 'DAILY', channel, message: labMessage('DAILY', snapshot, today), scheduledFor: now }
        })
      }
    }
  } finally {
    runningDaily = false
  }
}
