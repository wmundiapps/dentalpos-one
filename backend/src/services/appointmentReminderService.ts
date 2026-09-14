import { prisma } from '../lib/prisma'
import { decryptSecret } from './secretVault'
import { dispatchRevah, type RevahChannel } from './revahProviderService'

const AUTOMATIC_CHANNELS = ['WHATSAPP', 'SMS', 'TELEGRAM'] as const
let running = false

function formatAppointmentDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatClinicAddress(clinic: { address?: string | null; city?: string | null; state?: string | null } | null | undefined) {
  if (!clinic) return ''
  return [clinic.address, clinic.city, clinic.state]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ')
}

function formatConsultationValue(value: number | null | undefined) {
  if (value === null || value === undefined) return ''
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDoctorName(doctor: { user?: { firstName: string; lastName: string } | null } | null | undefined) {
  if (!doctor?.user) return ''
  return `Dr(a). ${doctor.user.firstName} ${doctor.user.lastName}`.trim()
}

interface ReminderMessageContext {
  type: string
  patientName: string
  scheduledAt: Date
  status: string
  doctorName: string
  clinicAddress: string
  consultationValueLabel: string
}

function reminderMessage(context: ReminderMessageContext) {
  const { type, patientName, scheduledAt, status, doctorName, clinicAddress, consultationValueLabel } = context
  const when = formatAppointmentDate(scheduledAt)
  const withDoctor = doctorName ? ` com ${doctorName}` : ''
  const addressLine = clinicAddress ? ` Local: ${clinicAddress}.` : ''
  const valueLine = consultationValueLabel ? ` Valor da consulta: ${consultationValueLabel}.` : ''

  if (type === 'CONFIRMATION') {
    return `Olá ${patientName}. Sua consulta${withDoctor} está confirmada para ${when}.${addressLine}${valueLine} Se precisar alterar o horário, entre em contato com a clínica.`
  }
  if (type === 'ON_BOOKING' && status === 'WAITING') {
    return `Olá ${patientName}. Recebemos sua solicitação de agendamento${withDoctor} para ${when}. A clínica fará a confirmação.`
  }
  if (type === 'ON_BOOKING') {
    return `Olá ${patientName}. Seu agendamento${withDoctor} foi registrado para ${when}.${addressLine}${valueLine}`
  }
  if (type === 'ONE_DAY_BEFORE') {
    return `Olá ${patientName}. Lembramos que sua consulta${withDoctor} está prevista para amanhã, ${when}.${addressLine}`
  }
  return `Olá ${patientName}. Lembramos sua consulta${withDoctor} hoje, ${when}.${addressLine}`
}

async function postponeWithError(id: string, message: string) {
  const retry = new Date(Date.now() + 10 * 60 * 1000)
  await prisma.appointmentReminder.update({
    where: { id },
    data: { scheduledFor: retry, errorMessage: message },
  })
}

export async function processDueAppointmentReminders() {
  if (running) return
  running = true
  try {
    const reminders = await prisma.appointmentReminder.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: new Date() },
        channel: { in: [...AUTOMATIC_CHANNELS] },
      },
      include: {
        appointment: {
          include: {
            patient: true,
            doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
            clinic: { select: { address: true, city: true, state: true } },
          },
        },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 50,
    })

    for (const reminder of reminders) {
      const appointment = reminder.appointment

      if (['CANCELLED', 'NO_SHOW', 'COMPLETED', 'FINALIZED'].includes(appointment.status)) {
        await prisma.appointmentReminder.update({
          where: { id: reminder.id },
          data: { status: 'CANCELLED', errorMessage: null },
        })
        continue
      }

      if (reminder.type !== 'ON_BOOKING' && appointment.status === 'WAITING') {
        continue
      }

      const channel = reminder.channel as RevahChannel
      const sender = await prisma.revahSender.findFirst({
        where: {
          clinicId: reminder.clinicId,
          tenantId: reminder.tenantId,
          channel,
          isDefault: true,
          isActive: true,
        },
      })

      if (!sender) {
        await postponeWithError(reminder.id, `Configure um remetente ativo para ${channel}.`)
        continue
      }

      let credentials: Record<string, unknown> = {}
      try {
        credentials = decryptSecret<Record<string, unknown>>(sender.encryptedCredentials) || {}
      } catch {
        await postponeWithError(reminder.id, `Credenciais de ${channel} não puderam ser abertas. Verifique a configuração segura da clínica.`)
        continue
      }
      if (Object.keys(credentials).length === 0 || credentials.simulated === true) {
        await postponeWithError(reminder.id, `Credenciais reais de ${channel} ainda não configuradas.`)
        continue
      }

      let destination = appointment.patient.phone || ''
      if (channel === 'TELEGRAM') {
        const contact = await prisma.revahContact.findFirst({
          where: {
            clinicId: reminder.clinicId,
            tenantId: reminder.tenantId,
            OR: [
              { phone: appointment.patient.phone },
              { name: appointment.patient.fullName },
            ],
          },
        })
        destination = contact?.telegramChatId || ''
      }

      if (!destination) {
        await postponeWithError(
          reminder.id,
          channel === 'TELEGRAM'
            ? 'Paciente sem Telegram vinculado.'
            : 'Paciente sem telefone para envio.',
        )
        continue
      }

      try {
        const message = reminderMessage({
          type: reminder.type,
          patientName: appointment.patient.fullName,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          doctorName: formatDoctorName(appointment.doctor),
          clinicAddress: formatClinicAddress(appointment.clinic),
          consultationValueLabel: formatConsultationValue(appointment.doctor?.consultationValue ?? null),
        })

        const result = await dispatchRevah(channel, destination, message, credentials, sender.address)

        if (result.simulated) {
          await postponeWithError(reminder.id, `O provedor ${result.provider} está em modo simulado.`)
          continue
        }

        await prisma.$transaction([
          prisma.appointmentReminder.update({
            where: { id: reminder.id },
            data: { status: 'SENT', sentAt: new Date(), errorMessage: null },
          }),
          prisma.revahMessage.create({
            data: {
              clinicId: reminder.clinicId,
              tenantId: reminder.tenantId,
              senderId: sender.id,
              channel,
              destination,
              content: message,
              contactName: appointment.patient.fullName,
              provider: result.provider,
              providerMessageId: result.providerMessageId,
              status: 'SENT',
              sentAt: new Date(),
            },
          }),
        ])
      } catch (error) {
        await postponeWithError(reminder.id, error instanceof Error ? error.message : 'Falha no envio automático.')
      }
    }
  } finally {
    running = false
  }
}

export function startAppointmentReminderWorker() {
  void processDueAppointmentReminders()
  return setInterval(() => void processDueAppointmentReminders(), 60_000)
}
