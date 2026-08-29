import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function parseDate(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
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
    { type: 'ON_DAY', scheduledFor: onDay }
  ].filter(item => item.type === 'ON_BOOKING' || item.scheduledFor.getTime() > booking.getTime())
}

const includeDetails = {
  patient: true,
  doctor: { include: { user: true } },
  history: { orderBy: { createdAt: 'desc' as const }, include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } } },
  reminders: { orderBy: { scheduledFor: 'asc' as const } }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const dateFrom = parseDate(req.query.dateFrom)
    const dateTo = parseDate(req.query.dateTo)
    const doctorId = req.query.doctorId ? String(req.query.doctorId) : undefined
    const status = req.query.status ? String(req.query.status) : undefined

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        ...(doctorId ? { doctorId } : {}),
        ...(status ? { status } : {}),
        ...(dateFrom || dateTo ? { scheduledAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {})
      },
      include: includeDetails,
      orderBy: { scheduledAt: 'asc' }
    })

    return res.status(200).json(appointments)
  } catch (error) {
    console.error('Erro ao listar agendamentos:', error)
    return res.status(500).json({ error: 'Erro ao listar agendamentos.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const appointment = await prisma.appointment.findFirst({
      where: { id, clinicId: req.user.clinicId, tenantId: req.user.tenantId },
      include: includeDetails
    })
    if (!appointment) return res.status(404).json({ error: 'Agendamento não encontrado.' })
    return res.status(200).json(appointment)
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error)
    return res.status(500).json({ error: 'Erro ao buscar agendamento.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const { patientId, doctorId, procedure, nextProcedure, scheduledAt, room, notes, source, budgetId, reminderChannel } = req.body
    if (!patientId || !doctorId || !procedure || !scheduledAt) {
      return res.status(400).json({ error: 'Paciente, profissional, procedimento e data/hora são obrigatórios.' })
    }
    const when = parseDate(scheduledAt)
    if (!when) return res.status(400).json({ error: 'Data/hora inválida.' })

    const [patient, doctor] = await Promise.all([
      prisma.patient.findFirst({ where: { id: String(patientId), clinicId: req.user.clinicId, tenantId: req.user.tenantId, isActive: true } }),
      prisma.doctor.findFirst({ where: { id: String(doctorId), clinicId: req.user.clinicId, tenantId: req.user.tenantId, isActive: true } })
    ])
    if (!patient) return res.status(404).json({ error: 'Paciente não pertence à clínica atual.' })
    if (!doctor) return res.status(404).json({ error: 'Profissional não pertence à clínica atual.' })

    if (when.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Não é permitido criar agendamento em data ou horário retroativo.' })
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        doctorId: doctor.id,
        scheduledAt: when,
        status: { not: 'CANCELLED' }
      },
      select: { id: true }
    })
    if (conflict) {
      return res.status(409).json({ error: 'Este profissional já possui um agendamento neste horário.' })
    }

    const appointment = await prisma.$transaction(async tx => {
      const created = await tx.appointment.create({
        data: {
          clinicId: req.user!.clinicId,
          tenantId: req.user!.tenantId,
          patientId: patient.id,
          doctorId: doctor.id,
          userId: req.user!.id,
          procedure: String(procedure),
          nextProcedure: nextProcedure ? String(nextProcedure) : null,
          room: room ? String(room) : null,
          notes: notes ? String(notes) : null,
          source: source ? String(source) : 'INTERNAL',
          scheduledAt: when,
          status: 'SCHEDULED',
          budgetId: budgetId ? String(budgetId) : null
        }
      })
      await tx.appointmentHistory.create({
        data: {
          clinicId: req.user!.clinicId,
          tenantId: req.user!.tenantId,
          appointmentId: created.id,
          actorId: req.user!.id,
          action: 'CREATED',
          newScheduledAt: when,
          newStatus: created.status
        }
      })
      const reminders = reminderDates(when).map(item => ({
        clinicId: req.user!.clinicId,
        tenantId: req.user!.tenantId,
        appointmentId: created.id,
        type: item.type,
        channel: reminderChannel ? String(reminderChannel) : 'WHATSAPP',
        scheduledFor: item.scheduledFor
      }))
      if (reminders.length) await tx.appointmentReminder.createMany({ data: reminders })
      return created
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'create',
      entityType: 'Appointment',
      entityId: appointment.id,
      summary: `Agendamento criado para ${patient.fullName}`,
      afterData: appointment,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    })

    const full = await prisma.appointment.findUnique({ where: { id: appointment.id }, include: includeDetails })
    return res.status(201).json(full)
  } catch (error) {
    console.error('Erro ao criar agendamento:', error)
    return res.status(500).json({ error: 'Erro ao criar agendamento.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const existing = await prisma.appointment.findFirst({ where: { id, clinicId: req.user.clinicId, tenantId: req.user.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado.' })

    const newScheduledAt = req.body.scheduledAt ? parseDate(req.body.scheduledAt) : existing.scheduledAt
    if (!newScheduledAt) return res.status(400).json({ error: 'Data/hora inválida.' })
    const newStatus = req.body.status ? String(req.body.status) : existing.status
    const changedSchedule = newScheduledAt.getTime() !== existing.scheduledAt.getTime()
    const changedStatus = newStatus !== existing.status
    if ((changedSchedule || changedStatus) && !String(req.body.reason || '').trim()) {
      return res.status(400).json({ error: 'Informe o motivo da remarcação, cancelamento, falta ou alteração.' })
    }

    if (changedSchedule && newScheduledAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Não é permitido remarcar para data ou horário retroativo.' })
    }

    if (changedSchedule && newStatus !== 'CANCELLED') {
      const conflict = await prisma.appointment.findFirst({
        where: {
          id: { not: id },
          clinicId: req.user.clinicId,
          tenantId: req.user.tenantId,
          doctorId: existing.doctorId,
          scheduledAt: newScheduledAt,
          status: { not: 'CANCELLED' }
        },
        select: { id: true }
      })

      if (conflict) {
        return res.status(409).json({ error: 'Este profissional já possui um agendamento neste horário.' })
      }
    }

    const appointment = await prisma.$transaction(async tx => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          scheduledAt: newScheduledAt,
          status: newStatus,
          procedure: req.body.procedure !== undefined ? String(req.body.procedure) : existing.procedure,
          nextProcedure: req.body.nextProcedure !== undefined ? String(req.body.nextProcedure || '') || null : existing.nextProcedure,
          room: req.body.room !== undefined ? String(req.body.room || '') || null : existing.room,
          notes: req.body.notes !== undefined ? String(req.body.notes || '') || null : existing.notes
        }
      })
      if (changedSchedule || changedStatus || req.body.reason) {
        const action = newStatus === 'CANCELLED' ? 'CANCELLED' : newStatus === 'NO_SHOW' ? 'NO_SHOW' : changedSchedule ? 'RESCHEDULED' : 'UPDATED'
        await tx.appointmentHistory.create({
          data: {
            clinicId: req.user!.clinicId,
            tenantId: req.user!.tenantId,
            appointmentId: id,
            actorId: req.user!.id,
            action,
            requestedBy: req.body.requestedBy ? String(req.body.requestedBy) : null,
            reason: req.body.reason ? String(req.body.reason) : null,
            previousScheduledAt: existing.scheduledAt,
            newScheduledAt,
            previousStatus: existing.status,
            newStatus
          }
        })
      }
      if (changedSchedule) {
        await tx.appointmentReminder.deleteMany({ where: { appointmentId: id, status: 'PENDING' } })
        const reminders = reminderDates(newScheduledAt).map(item => ({
          clinicId: req.user!.clinicId,
          tenantId: req.user!.tenantId,
          appointmentId: id,
          type: item.type,
          channel: req.body.reminderChannel ? String(req.body.reminderChannel) : 'WHATSAPP',
          scheduledFor: item.scheduledFor
        }))
        if (reminders.length) await tx.appointmentReminder.createMany({ data: reminders })
      }
      return updated
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: changedSchedule ? 'reschedule' : changedStatus ? 'status-change' : 'edit',
      entityType: 'Appointment',
      entityId: id,
      summary: String(req.body.reason || 'Agendamento alterado'),
      beforeData: existing,
      afterData: appointment,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    })

    const full = await prisma.appointment.findUnique({ where: { id }, include: includeDetails })
    return res.status(200).json(full)
  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error)
    return res.status(500).json({ error: 'Erro ao atualizar agendamento.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'Informe o motivo do cancelamento.' })
    const existing = await prisma.appointment.findFirst({ where: { id, clinicId: req.user.clinicId, tenantId: req.user.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado.' })

    const appointment = await prisma.$transaction(async tx => {
      const updated = await tx.appointment.update({ where: { id }, data: { status: 'CANCELLED' } })
      await tx.appointmentHistory.create({
        data: {
          clinicId: req.user!.clinicId,
          tenantId: req.user!.tenantId,
          appointmentId: id,
          actorId: req.user!.id,
          action: 'CANCELLED',
          requestedBy: req.body?.requestedBy ? String(req.body.requestedBy) : 'CLINIC',
          reason,
          previousScheduledAt: existing.scheduledAt,
          newScheduledAt: existing.scheduledAt,
          previousStatus: existing.status,
          newStatus: 'CANCELLED'
        }
      })
      await tx.appointmentReminder.updateMany({ where: { appointmentId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      return updated
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'cancel',
      entityType: 'Appointment',
      entityId: id,
      summary: reason,
      beforeData: existing,
      afterData: appointment,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    })

    return res.status(200).json({ message: 'Agendamento cancelado e preservado no histórico.', appointment })
  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error)
    return res.status(500).json({ error: 'Erro ao cancelar agendamento.' })
  }
}
