import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

export async function index(req: AuthRequest, res: Response) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const schedules = await prisma.schedule.findMany({
      where: { clinicId: req.user.clinicId, tenantId: req.user.tenantId },
      include: { doctor: { include: { user: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
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
      where: { id: String(req.params.id), clinicId: req.user.clinicId, tenantId: req.user.tenantId },
      include: { doctor: { include: { user: true } } }
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
    if (!doctorId || dayOfWeek === undefined || !startTime || !endTime) return res.status(400).json({ error: 'Profissional, dia e horários são obrigatórios.' })
    if (![10, 15, 30].includes(Number(slotDuration || 30))) return res.status(400).json({ error: 'Intervalo deve ser 10, 15 ou 30 minutos.' })
    const doctor = await prisma.doctor.findFirst({ where: { id: String(doctorId), clinicId: req.user.clinicId, tenantId: req.user.tenantId, isActive: true } })
    if (!doctor) return res.status(404).json({ error: 'Profissional não pertence à clínica atual.' })
    const schedule = await prisma.schedule.create({
      data: {
        clinicId: req.user.clinicId,
        tenantId: req.user.tenantId,
        userId: req.user.id,
        doctorId: doctor.id,
        dayOfWeek: Number(dayOfWeek),
        startTime: String(startTime),
        endTime: String(endTime),
        slotDuration: Number(slotDuration || 30)
      }
    })
    await writeAudit({ clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id, module: 'agenda', action: 'schedule-create', entityType: 'Schedule', entityId: schedule.id, afterData: schedule })
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
    const existing = await prisma.schedule.findFirst({ where: { id, clinicId: req.user.clinicId, tenantId: req.user.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Horário não encontrado.' })
    const slotDuration = req.body.slotDuration !== undefined ? Number(req.body.slotDuration) : existing.slotDuration
    if (![10, 15, 30].includes(slotDuration)) return res.status(400).json({ error: 'Intervalo deve ser 10, 15 ou 30 minutos.' })
    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
        dayOfWeek: req.body.dayOfWeek !== undefined ? Number(req.body.dayOfWeek) : existing.dayOfWeek,
        startTime: req.body.startTime !== undefined ? String(req.body.startTime) : existing.startTime,
        endTime: req.body.endTime !== undefined ? String(req.body.endTime) : existing.endTime,
        slotDuration
      }
    })
    await writeAudit({ clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id, module: 'agenda', action: 'schedule-edit', entityType: 'Schedule', entityId: id, beforeData: existing, afterData: schedule })
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
    const existing = await prisma.schedule.findFirst({ where: { id, clinicId: req.user.clinicId, tenantId: req.user.tenantId } })
    if (!existing) return res.status(404).json({ error: 'Horário não encontrado.' })
    await prisma.schedule.delete({ where: { id } })
    await writeAudit({ clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id, module: 'agenda', action: 'schedule-delete', entityType: 'Schedule', entityId: id, beforeData: existing })
    return res.status(200).json({ message: 'Horário removido com sucesso.' })
  } catch (error) {
    console.error('Erro ao remover horário:', error)
    return res.status(500).json({ error: 'Erro ao remover horário.' })
  }
}
