import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const allowedChannels = new Set(['WHATSAPP', 'SMS', 'TELEGRAM', 'MANUAL'])

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

export async function config(req: Request, res: Response) {
  try {
    const clinicId = String(req.params.clinicId || '')
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, isActive: true },
      select: { id: true, tenantId: true, name: true, displayName: true },
    })
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })

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

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, clinicId, tenantId: clinic.tenantId, isActive: true },
    })
    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const date = new Date(`${dateISO}T12:00:00-03:00`)
    const dayOfWeek = date.getDay()
    const schedules = await prisma.schedule.findMany({
      where: { clinicId, tenantId: clinic.tenantId, doctorId, dayOfWeek },
      orderBy: { startTime: 'asc' },
    })

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

    const blocks = schedules.length
      ? schedules.map(row => ({ startTime: row.startTime, endTime: row.endTime, step: row.slotDuration || 30 }))
      : [
          { startTime: '08:00', endTime: '12:00', step: 30 },
          { startTime: '13:00', endTime: '17:30', step: 30 },
        ]

    const now = Date.now()
    const slots: string[] = []

    for (const block of blocks) {
      const blockStart = minutes(block.startTime)
      const blockEnd = minutes(block.endTime)
      const step = Math.max(10, block.step || 30)

      for (let cursor = blockStart; cursor + durationMinutes <= blockEnd; cursor += step) {
        const time = timeLabel(cursor)
        const candidate = parseLocalDateTime(dateISO, time)
        if (!candidate || candidate.getTime() <= now) continue

        const candidateStart = candidate.getTime()
        const candidateEnd = candidateStart + durationMinutes * 60000
        const conflict = appointments.some(item => {
          const itemStart = item.scheduledAt.getTime()
          const itemEnd = itemStart + item.durationMinutes * 60000
          return itemStart < candidateEnd && itemEnd > candidateStart
        })
        if (!conflict) slots.push(time)
      }
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
      patientName,
      patientPhone,
      doctorId,
      procedure,
      dateISO,
      time,
      durationMinutes: rawDuration,
      reminderChannel: rawChannel,
    } = req.body || {}

    if (!patientName?.trim() || !patientPhone?.trim() || !doctorId || !procedure?.trim() || !dateISO || !time) {
      return res.status(400).json({ error: 'Nome, telefone, profissional, procedimento, data e horário são obrigatórios.' })
    }

    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, isActive: true } })
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })

    const doctor = await prisma.doctor.findFirst({
      where: { id: String(doctorId), clinicId, tenantId: clinic.tenantId, isActive: true },
    })
    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const scheduledAt = parseLocalDateTime(String(dateISO), String(time))
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Escolha um horário futuro válido.' })
    }

    const durationMinutes = Math.max(10, Math.min(480, Number(rawDuration || 30)))
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
      select: { id: true, phone: true },
    })
    let patient = patients.find(row => row.phone.replace(/\D/g, '') === incomingDigits)

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId,
          tenantId: clinic.tenantId,
          fullName: String(patientName).trim(),
          phone: String(patientPhone).trim(),
        },
        select: { id: true, phone: true },
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
