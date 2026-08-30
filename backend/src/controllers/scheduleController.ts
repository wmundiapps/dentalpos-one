import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  addAgendaBlock,
  addRecurringBreak,
  addRecurringBreaks,
  clockMinutes,
  listAgendaBlocks,
  listRecurringBreaks,
  removeAgendaBlock,
  removeRecurringBreak,
  validateScheduleConfig,
  validClock,
} from '../services/agendaAvailabilityService'

async function overlappingSchedule(input: {
  clinicId: string
  tenantId: string
  doctorId: string
  dayOfWeek: number
  startMinutes: number
  endMinutes: number
  excludeId?: string
}) {
  const rows = await prisma.schedule.findMany({
    where: {
      clinicId: input.clinicId,
      tenantId: input.tenantId,
      doctorId: input.doctorId,
      dayOfWeek: input.dayOfWeek,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true },
  })

  return rows.find(row => {
    if (!validClock(row.startTime) || !validClock(row.endTime)) return false
    const start = clockMinutes(row.startTime)
    const end = clockMinutes(row.endTime)
    return start < input.endMinutes && end > input.startMinutes
  })
}

export async function index(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const doctorId = req.query.doctorId ? String(req.query.doctorId) : undefined
    const rawDay = req.query.dayOfWeek
    const dayOfWeek = rawDay !== undefined ? Number(rawDay) : undefined

    const schedules = await prisma.schedule.findMany({
      where: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        ...(doctorId ? { doctorId } : {}),
        ...(Number.isInteger(dayOfWeek) ? { dayOfWeek } : {}),
      },
      include: { doctor: { include: { user: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })
    return res.status(200).json(schedules)
  } catch (error) {
    console.error('Erro ao listar horários:', error)
    return res.status(500).json({ error: 'Erro ao listar horários.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const schedule = await prisma.schedule.findFirst({
      where: {
        id: String(req.params.id),
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
      },
      include: { doctor: { include: { user: true } } },
    })
    if (!schedule) return res.status(404).json({ error: 'Horário não encontrado.' })
    return res.status(200).json(schedule)
  } catch (error) {
    console.error('Erro ao buscar horário:', error)
    return res.status(500).json({ error: 'Erro ao buscar horário.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const { doctorId, dayOfWeek, startTime, endTime, slotDuration } = req.body
    if (!doctorId || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Profissional, dia e horários são obrigatórios.',
      })
    }

    const validated = validateScheduleConfig({
      dayOfWeek,
      startTime,
      endTime,
      slotDuration: slotDuration || 30,
    })
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error })
    }

    const doctor = await prisma.doctor.findFirst({
      where: {
        id: String(doctorId),
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        isActive: true,
      },
    })
    if (!doctor) {
      return res.status(404).json({
        error: 'Profissional não pertence à clínica atual.',
      })
    }

    const overlap = await overlappingSchedule({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      doctorId: doctor.id,
      dayOfWeek: validated.dayOfWeek,
      startMinutes: validated.start,
      endMinutes: validated.end,
    })
    if (overlap) {
      return res.status(409).json({
        error: 'Este período se sobrepõe a outro período já configurado.',
      })
    }

    const schedule = await prisma.schedule.create({
      data: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        userId: req.user.id,
        doctorId: doctor.id,
        dayOfWeek: validated.dayOfWeek,
        startTime: validated.startTime,
        endTime: validated.endTime,
        slotDuration: validated.slotDuration,
      },
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'schedule-create',
      entityType: 'Schedule',
      entityId: schedule.id,
      afterData: schedule,
    })
    return res.status(201).json(schedule)
  } catch (error) {
    console.error('Erro ao criar horário:', error)
    return res.status(500).json({ error: 'Erro ao criar horário.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const existing = await prisma.schedule.findFirst({
      where: {
        id,
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
      },
    })
    if (!existing) return res.status(404).json({ error: 'Horário não encontrado.' })

    const validated = validateScheduleConfig({
      dayOfWeek:
        req.body.dayOfWeek !== undefined ? req.body.dayOfWeek : existing.dayOfWeek,
      startTime:
        req.body.startTime !== undefined ? req.body.startTime : existing.startTime,
      endTime: req.body.endTime !== undefined ? req.body.endTime : existing.endTime,
      slotDuration:
        req.body.slotDuration !== undefined
          ? req.body.slotDuration
          : existing.slotDuration,
    })
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error })
    }

    const overlap = await overlappingSchedule({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      doctorId: existing.doctorId,
      dayOfWeek: validated.dayOfWeek,
      startMinutes: validated.start,
      endMinutes: validated.end,
      excludeId: id,
    })
    if (overlap) {
      return res.status(409).json({
        error: 'Este período se sobrepõe a outro período já configurado.',
      })
    }

    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
        dayOfWeek: validated.dayOfWeek,
        startTime: validated.startTime,
        endTime: validated.endTime,
        slotDuration: validated.slotDuration,
      },
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'schedule-edit',
      entityType: 'Schedule',
      entityId: id,
      beforeData: existing,
      afterData: schedule,
    })
    return res.status(200).json(schedule)
  } catch (error) {
    console.error('Erro ao atualizar horário:', error)
    return res.status(500).json({ error: 'Erro ao atualizar horário.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const existing = await prisma.schedule.findFirst({
      where: {
        id,
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
      },
    })
    if (!existing) return res.status(404).json({ error: 'Horário não encontrado.' })

    await prisma.schedule.delete({ where: { id } })
    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'schedule-delete',
      entityType: 'Schedule',
      entityId: id,
      beforeData: existing,
    })
    return res.status(200).json({ message: 'Horário removido com sucesso.' })
  } catch (error) {
    console.error('Erro ao remover horário:', error)
    return res.status(500).json({ error: 'Erro ao remover horário.' })
  }
}

export async function blocks(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    return res.json(await listAgendaBlocks(req.user.clinicId))
  } catch (error) {
    console.error('Erro ao listar bloqueios da agenda:', error)
    return res.status(500).json({ error: 'Erro ao listar bloqueios da agenda.' })
  }
}

export async function createBlock(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const doctorId = req.body?.doctorId ? String(req.body.doctorId) : null

    if (doctorId) {
      const doctor = await prisma.doctor.findFirst({
        where: {
          id: doctorId,
          clinicId: req.user.clinicId,
          tenantId: req.user.tenantId,
          isActive: true,
        },
      })
      if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })
    }

    const block = await addAgendaBlock({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      doctorId,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      reason: req.body?.reason,
    })

    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'agenda-block-create',
      entityType: 'AgendaBlock',
      entityId: block.id,
      afterData: block,
      summary: block.reason,
    })

    return res.status(201).json(block)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro ao criar bloqueio da agenda.'
    return res.status(400).json({ error: message })
  }
}

export async function deleteBlock(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const existing = (await listAgendaBlocks(req.user.clinicId)).find(
      block => block.id === id,
    )
    if (!existing) return res.status(404).json({ error: 'Bloqueio não encontrado.' })

    await removeAgendaBlock(req.user.clinicId, req.user.tenantId, id)
    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'agenda-block-delete',
      entityType: 'AgendaBlock',
      entityId: id,
      beforeData: existing,
      summary: existing.reason,
    })

    return res.json({ message: 'Bloqueio removido.' })
  } catch (error) {
    console.error('Erro ao remover bloqueio da agenda:', error)
    return res.status(500).json({ error: 'Erro ao remover bloqueio da agenda.' })
  }
}

export async function recurringBreaks(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    return res.json(await listRecurringBreaks(req.user.clinicId))
  } catch (error) {
    console.error('Erro ao listar intervalos fixos:', error)
    return res.status(500).json({ error: 'Erro ao listar intervalos fixos.' })
  }
}

export async function createRecurringBreak(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const doctorId = String(req.body?.doctorId || '')
    const doctor = await prisma.doctor.findFirst({
      where: {
        id: doctorId,
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        isActive: true,
      },
    })
    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const requestedDays = Array.isArray(req.body?.dayOfWeeks)
      ? req.body.dayOfWeeks
      : [req.body?.dayOfWeek]

    const items = await addRecurringBreaks({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      doctorId: doctor.id,
      dayOfWeeks: requestedDays,
      startTime: req.body?.startTime,
      endTime: req.body?.endTime,
      reason: req.body?.reason,
    })

    for (const item of items) {
      await writeAudit({
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        actorId: req.user.id,
        module: 'agenda',
        action: 'recurring-break-create',
        entityType: 'RecurringBreak',
        entityId: item.id,
        afterData: item,
        summary: item.reason,
      })
    }

    return res.status(201).json(items.length === 1 ? items[0] : items)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro ao criar intervalo fixo.'
    return res.status(400).json({ error: message })
  }
}

export async function deleteRecurringBreak(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const id = String(req.params.id)
    const existing = (await listRecurringBreaks(req.user.clinicId)).find(
      item => item.id === id,
    )
    if (!existing) return res.status(404).json({ error: 'Intervalo não encontrado.' })

    await removeRecurringBreak(req.user.clinicId, req.user.tenantId, id)
    await writeAudit({
      clinicId: req.user.clinicId,
      tenantId: req.user.tenantId,
      actorId: req.user.id,
      module: 'agenda',
      action: 'recurring-break-delete',
      entityType: 'RecurringBreak',
      entityId: id,
      beforeData: existing,
      summary: existing.reason,
    })

    return res.json({ message: 'Intervalo fixo removido.' })
  } catch (error) {
    console.error('Erro ao remover intervalo fixo:', error)
    return res.status(500).json({ error: 'Erro ao remover intervalo fixo.' })
  }
}
