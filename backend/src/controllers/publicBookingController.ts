import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import type { AuthRequest } from '../middleware/auth'
import {
  fitsWorkBlocks,
  fitsWorkSchedule,
  getWorkBlocks,
  isAgendaBlocked,
  isRecurringBreakBlocked,
  isRecurringBreakBlockedByClock,
  listAgendaBlocks,
  listRecurringBreaks,
} from '../services/agendaAvailabilityService'
import { getDemoAccess } from '../services/demoAccessService'

const allowedChannels = new Set(['WHATSAPP', 'SMS', 'TELEGRAM', 'MANUAL'])
const ONLINE_BOOKING_FLAG = 'ONLINE_BOOKING_SLOTS'

type OnlineSlots = Record<string, Record<string, string[]>>

function sanitizeTime(value: unknown) {
  const time = String(value || '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : undefined
}

async function loadOnlineBookingSettings(clinicId: string) {
  const row = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: ONLINE_BOOKING_FLAG } }
  })
  const metadata = (row?.metadata || {}) as any
  const slots = metadata?.slots && typeof metadata.slots === 'object' ? metadata.slots as OnlineSlots : {}
  return { enabled: row?.enabled === true, slots }
}

function onlineTimesFor(settings: { enabled: boolean; slots: OnlineSlots }, doctorId: string, dayOfWeek: number) {
  if (!settings.enabled) return []
  const values = settings.slots?.[doctorId]?.[String(dayOfWeek)]
  if (!Array.isArray(values)) return []
  return values.map(sanitizeTime).filter((value): value is string => Boolean(value)).sort()
}

function normalizeChannel(value: unknown) {
  const channel = String(value || 'WHATSAPP').toUpperCase()
  return allowedChannels.has(channel) ? channel : 'WHATSAPP'
}

function parseLocalDateTime(dateISO: string, time: string) {
  const value = new Date(`${dateISO}T${time}:00-03:00`)
  return Number.isNaN(value.getTime()) ? undefined : value
}

function dayBounds(dateISO: string) {
  const start = new Date(`${dateISO}T00:00:00-03:00`)
  const end = new Date(`${dateISO}T23:59:59.999-03:00`)
  return { start, end }
}

function minutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

function timeLabel(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function reminderDates(scheduledAt: Date) {
  const booking = new Date()
  const oneDayBefore = new Date(scheduledAt)
  oneDayBefore.setDate(oneDayBefore.getDate() - 1)
  oneDayBefore.setHours(9, 0, 0, 0)

  const onDay = new Date(scheduledAt)
  onDay.setHours(Math.max(7, scheduledAt.getHours() - 2), scheduledAt.getMinutes(), 0, 0)

  return [
    { type: 'ON_BOOKING', scheduledFor: booking },
    { type: 'ONE_DAY_BEFORE', scheduledFor: oneDayBefore },
    { type: 'ON_DAY', scheduledFor: onDay },
  ].filter(item => item.type === 'ON_BOOKING' || item.scheduledFor.getTime() > booking.getTime())
}

async function demoBookingClosed(clinicId: string, res: Response) {
  const demo = await getDemoAccess(clinicId)
  if (!demo.isDemo || demo.phase === 'ACTIVE') return false

  res.status(410).json({
    code: 'DEMO_BOOKING_CLOSED',
    error:
      'O período gratuito desta clínica foi encerrado. O agendamento online está temporariamente indisponível.',
    demo,
  })
  return true
}

export async function settings(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const current = await loadOnlineBookingSettings(req.user.clinicId)
    return res.json(current)
  } catch (error) {
    console.error('Erro ao carregar configuração do agendamento online:', error)
    return res.status(500).json({ error: 'Erro ao carregar horários online.' })
  }
}

export async function saveSettings(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })

    const doctors = await prisma.doctor.findMany({
      where: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        isActive: true
      },
      select: { id: true }
    })
    const validDoctorIds = new Set(doctors.map(item => item.id))
    const rawSlots = req.body?.slots && typeof req.body.slots === 'object' ? req.body.slots : {}
    const slots: OnlineSlots = {}

    for (const [doctorId, rawDays] of Object.entries(rawSlots as Record<string, unknown>)) {
      if (!validDoctorIds.has(doctorId) || !rawDays || typeof rawDays !== 'object') continue
      const days: Record<string, string[]> = {}

      for (const [day, rawTimes] of Object.entries(rawDays as Record<string, unknown>)) {
        const dayNumber = Number(day)
        if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6 || !Array.isArray(rawTimes)) continue
        const times = Array.from(
          new Set(rawTimes.map(sanitizeTime).filter((value): value is string => Boolean(value)))
        ).sort()
        days[String(dayNumber)] = times
      }

      slots[doctorId] = days
    }

    const row = await prisma.tenantFeatureFlag.upsert({
      where: {
        clinicId_key: {
          clinicId: req.user.clinicId,
          key: ONLINE_BOOKING_FLAG
        }
      },
      update: {
        enabled: req.body?.enabled !== false,
        rolloutStage: 'PILOT',
        metadata: { version: 1, slots }
      },
      create: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        key: ONLINE_BOOKING_FLAG,
        enabled: req.body?.enabled !== false,
        rolloutStage: 'PILOT',
        metadata: { version: 1, slots }
      }
    })

    return res.json({
      enabled: row.enabled,
      slots
    })
  } catch (error) {
    console.error('Erro ao salvar configuração do agendamento online:', error)
    return res.status(500).json({ error: 'Erro ao salvar horários online.' })
  }
}

export async function config(req: Request, res: Response) {
  try {
    const clinicId = String(req.params.clinicId || '')
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
      select: { id: true, tenantId: true, name: true, displayName: true },
    })
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
    if (await demoBookingClosed(clinicId, res)) return

    const doctors = await prisma.doctor.findMany({
      where: { clinicId: clinic.id, tenantId: clinic.tenantId, isActive: true },
      select: {
        id: true,
        specialty: true,
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return res.json({
      clinic: { id: clinic.id, name: clinic.displayName || clinic.name },
      doctors: doctors.map(doctor => ({
        id: doctor.id,
        name: `Dr(a). ${doctor.user.firstName} ${doctor.user.lastName}`.trim(),
        specialty: doctor.specialty,
      })),
    })
  } catch (error) {
    console.error('Erro ao carregar agendamento público:', error)
    return res.status(500).json({ error: 'Erro ao carregar agendamento online.' })
  }
}

export async function availability(req: Request, res: Response) {
  try {
    const clinicId = String(req.params.clinicId || '')
    const doctorId = String(req.query.doctorId || '')
    const dateISO = String(req.query.date || '')
    const durationMinutes = Math.max(10, Math.min(480, Number(req.query.durationMinutes || 30)))

    if (!clinicId || !doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return res.status(400).json({ error: 'Clínica, profissional e data são obrigatórios.' })
    }

    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, isActive: true } })
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
    if (await demoBookingClosed(clinicId, res)) return

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, clinicId, tenantId: clinic.tenantId, isActive: true },
    })
    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const date = new Date(`${dateISO}T12:00:00-03:00`)
    const dayOfWeek = date.getDay()
    const onlineSettings = await loadOnlineBookingSettings(clinicId)
    const configuredTimes = onlineTimesFor(onlineSettings, doctorId, dayOfWeek)
    const workBlocks = await getWorkBlocks(clinicId, clinic.tenantId, doctorId, dayOfWeek)
    const agendaBlocks = await listAgendaBlocks(clinicId)
    const recurringBreaks = await listRecurringBreaks(clinicId)

    if (!configuredTimes.length) {
      return res.json({ dateISO, doctorId, durationMinutes, slots: [] })
    }

    const { start, end } = dayBounds(dateISO)
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId,
        tenantId: clinic.tenantId,
        doctorId,
        status: { not: 'CANCELLED' },
        scheduledAt: { gte: start, lte: end },
      },
      select: { scheduledAt: true, durationMinutes: true, status: true },
    })

    const now = Date.now()
    const slots: string[] = []

    for (const time of configuredTimes) {
      const candidate = parseLocalDateTime(dateISO, time)
      if (!candidate || candidate.getTime() <= now) continue
      if (!fitsWorkBlocks(workBlocks, minutes(time), durationMinutes)) continue

      const candidateStart = candidate.getTime()
      const candidateEnd = candidateStart + durationMinutes * 60000
      const conflict = appointments.some(item => {
        const itemStart = item.scheduledAt.getTime()
        const itemEnd = itemStart + item.durationMinutes * 60000
        return itemStart < candidateEnd && itemEnd > candidateStart
      })
      const blocked = isAgendaBlocked(
        agendaBlocks,
        doctorId,
        candidate,
        new Date(candidateEnd)
      )
      const startMinute = minutes(time)
      const recurringBlocked = isRecurringBreakBlockedByClock(
        recurringBreaks,
        doctorId,
        dayOfWeek,
        startMinute,
        startMinute + durationMinutes
      )
      if (!conflict && !blocked && !recurringBlocked) slots.push(time)
    }

    return res.json({ dateISO, doctorId, durationMinutes, slots })
  } catch (error) {
    console.error('Erro ao consultar disponibilidade pública:', error)
    return res.status(500).json({ error: 'Erro ao consultar horários disponíveis.' })
  }
}

export async function store(req: Request, res: Response) {
  try {
    const clinicId = String(req.params.clinicId || '')
    const {
      firstName,
      lastName,
      birthDate,
      patientPhone,
      city,
      doctorId,
      procedure,
      dateISO,
      time,
      durationMinutes: rawDuration,
      reminderChannel: rawChannel,
    } = req.body || {}

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !birthDate ||
      !patientPhone?.trim() ||
      !city?.trim() ||
      !doctorId ||
      !procedure?.trim() ||
      !dateISO ||
      !time
    ) {
      return res.status(400).json({
        error: 'Nome, sobrenome, data de nascimento, WhatsApp, cidade, profissional, procedimento, data e horário são obrigatórios.'
      })
    }

    const patientName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim()
    const parsedBirthDate = new Date(`${String(birthDate)}T12:00:00-03:00`)
    if (Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate.getTime() > Date.now()) {
      return res.status(400).json({ error: 'Data de nascimento inválida.' })
    }

    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, isActive: true } })
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
    if (await demoBookingClosed(clinicId, res)) return

    const doctor = await prisma.doctor.findFirst({
      where: { id: String(doctorId), clinicId, tenantId: clinic.tenantId, isActive: true },
    })
    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const scheduledAt = parseLocalDateTime(String(dateISO), String(time))
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Escolha um horário futuro válido.' })
    }

    const date = new Date(`${String(dateISO)}T12:00:00-03:00`)
    const onlineSettings = await loadOnlineBookingSettings(clinicId)
    const allowedTimes = onlineTimesFor(onlineSettings, doctor.id, date.getDay())
    if (!allowedTimes.includes(String(time))) {
      return res.status(409).json({ error: 'Este horário não está liberado para agendamento online.' })
    }

    const durationMinutes = Math.max(10, Math.min(480, Number(rawDuration || 30)))
    const withinJourney = await fitsWorkSchedule(
      clinicId,
      clinic.tenantId,
      doctor.id,
      scheduledAt,
      durationMinutes
    )
    if (!withinJourney) {
      return res.status(409).json({ error: 'Este horário não está dentro da jornada do profissional.' })
    }

    const agendaBlocks = await listAgendaBlocks(clinicId)
    if (isAgendaBlocked(
      agendaBlocks,
      doctor.id,
      scheduledAt,
      new Date(scheduledAt.getTime() + durationMinutes * 60000)
    )) {
      return res.status(409).json({ error: 'Este período está indisponível na agenda.' })
    }

    const recurringBreaks = await listRecurringBreaks(clinicId)
    if (isRecurringBreakBlocked(recurringBreaks, doctor.id, scheduledAt, durationMinutes)) {
      return res.status(409).json({
        error: 'Este horário coincide com um intervalo indisponível do profissional.'
      })
    }

    const incomingStart = scheduledAt.getTime()
    const incomingEnd = incomingStart + durationMinutes * 60000

    const possibleConflicts = await prisma.appointment.findMany({
      where: {
        clinicId,
        tenantId: clinic.tenantId,
        doctorId: doctor.id,
        status: { not: 'CANCELLED' },
        scheduledAt: {
          gte: new Date(incomingStart - 480 * 60000),
          lt: new Date(incomingEnd),
        },
      },
      select: { scheduledAt: true, durationMinutes: true },
    })

    const conflict = possibleConflicts.some(item => {
      const itemStart = item.scheduledAt.getTime()
      const itemEnd = itemStart + item.durationMinutes * 60000
      return itemStart < incomingEnd && itemEnd > incomingStart
    })
    if (conflict) return res.status(409).json({ error: 'Este horário acabou de ser ocupado. Escolha outro.' })

    const incomingDigits = String(patientPhone).replace(/\D/g, '')
    const patients = await prisma.patient.findMany({
      where: { clinicId, tenantId: clinic.tenantId, isActive: true },
      select: { id: true, phone: true, fullName: true, birthDate: true, city: true },
    })
    let patient = patients.find(row => row.phone.replace(/\D/g, '') === incomingDigits)

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId,
          tenantId: clinic.tenantId,
          fullName: patientName,
          phone: String(patientPhone).trim(),
          birthDate: parsedBirthDate,
          city: String(city).trim(),
        },
        select: { id: true, phone: true, fullName: true, birthDate: true, city: true },
      })
    } else if (!patient.birthDate || !patient.city) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: {
          ...(!patient.birthDate ? { birthDate: parsedBirthDate } : {}),
          ...(!patient.city ? { city: String(city).trim() } : {}),
        },
        select: { id: true, phone: true, fullName: true, birthDate: true, city: true },
      })
    }

    const reminderChannel = normalizeChannel(rawChannel)
    const appointment = await prisma.$transaction(async tx => {
      const created = await tx.appointment.create({
        data: {
          clinicId,
          tenantId: clinic.tenantId,
          patientId: patient!.id,
          doctorId: doctor.id,
          userId: doctor.userId,
          procedure: String(procedure).trim(),
          nextProcedure: 'Definir após atendimento',
          room: null,
          source: 'ONLINE',
          scheduledAt,
          durationMinutes,
          status: 'WAITING',
          confirmation: 'PENDING',
          confirmChannel: reminderChannel,
        },
      })

      await tx.appointmentHistory.create({
        data: {
          clinicId,
          tenantId: clinic.tenantId,
          appointmentId: created.id,
          action: 'ONLINE_REQUEST',
          requestedBy: 'PATIENT',
          reason: 'Solicitação realizada pelo agendamento online.',
          newScheduledAt: scheduledAt,
          newStatus: 'WAITING',
        },
      })

      const reminders = reminderDates(scheduledAt).map(item => ({
        clinicId,
        tenantId: clinic.tenantId,
        appointmentId: created.id,
        type: item.type,
        channel: reminderChannel,
        scheduledFor: item.scheduledFor,
      }))
      if (reminders.length) await tx.appointmentReminder.createMany({ data: reminders })

      return created
    })

    return res.status(201).json({
      id: appointment.id,
      status: appointment.status,
      message: 'Solicitação registrada. A clínica fará a confirmação.',
    })
  } catch (error) {
    console.error('Erro ao criar agendamento público:', error)
    return res.status(500).json({ error: 'Não foi possível registrar a solicitação.' })
  }
}
