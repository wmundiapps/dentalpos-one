import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const feedbacks = await prisma.feedback.findMany({
      where: { clinicId, tenantId },
      include: { patient: true, appointment: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.status(200).json(feedbacks)
  } catch (error) {
    console.error('Erro ao listar avaliações:', error)
    return res.status(500).json({ error: 'Erro ao listar avaliações.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const id = String(req.params.id)
    const feedback = await prisma.feedback.findFirst({
      where: { id, clinicId, tenantId },
      include: { patient: true, appointment: true }
    })

    if (!feedback) return res.status(404).json({ error: 'Avaliação não encontrada.' })
    return res.status(200).json(feedback)
  } catch (error) {
    console.error('Erro ao buscar avaliação:', error)
    return res.status(500).json({ error: 'Erro ao buscar avaliação.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const patientId = String(req.body.patientId || '')
    const appointmentId = String(req.body.appointmentId || '')
    const rating = Number(req.body.rating)

    if (!patientId || !appointmentId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Paciente, atendimento e nota de 1 a 5 são obrigatórios.' })
    }

    const [patient, appointment] = await Promise.all([
      prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId } }),
      prisma.appointment.findFirst({ where: { id: appointmentId, clinicId, tenantId, patientId } })
    ])

    if (!patient || !appointment) {
      return res.status(400).json({ error: 'Paciente ou atendimento não pertence à clínica atual.' })
    }

    const feedback = await prisma.feedback.create({
      data: {
        clinicId,
        tenantId,
        patientId,
        appointmentId,
        rating,
        comment: req.body.comment ? String(req.body.comment) : undefined,
        isAnonymous: Boolean(req.body.isAnonymous)
      }
    })

    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'feedback',
      action: 'FEEDBACK_CREATE',
      entityType: 'Feedback',
      entityId: feedback.id,
      summary: `Avaliação ${rating}/5 registrada.`
    })

    return res.status(201).json(feedback)
  } catch (error) {
    console.error('Erro ao criar avaliação:', error)
    return res.status(500).json({ error: 'Erro ao criar avaliação.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.feedback.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Avaliação não encontrada.' })

    const data: { rating?: number; comment?: string | null; isAnonymous?: boolean } = {}
    if (req.body.rating !== undefined) {
      const rating = Number(req.body.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'A nota deve estar entre 1 e 5.' })
      }
      data.rating = rating
    }
    if (req.body.comment !== undefined) data.comment = req.body.comment ? String(req.body.comment) : null
    if (req.body.isAnonymous !== undefined) data.isAnonymous = Boolean(req.body.isAnonymous)

    const feedback = await prisma.feedback.update({ where: { id }, data })
    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'feedback',
      action: 'FEEDBACK_UPDATE',
      entityType: 'Feedback',
      entityId: id,
      beforeData: existing,
      afterData: feedback
    })

    return res.status(200).json(feedback)
  } catch (error) {
    console.error('Erro ao atualizar avaliação:', error)
    return res.status(500).json({ error: 'Erro ao atualizar avaliação.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.feedback.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Avaliação não encontrada.' })

    await prisma.feedback.delete({ where: { id } })
    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'feedback',
      action: 'FEEDBACK_DELETE',
      entityType: 'Feedback',
      entityId: id,
      beforeData: existing
    })

    return res.status(200).json({ message: 'Avaliação removida com sucesso.' })
  } catch (error) {
    console.error('Erro ao remover avaliação:', error)
    return res.status(500).json({ error: 'Erro ao remover avaliação.' })
  }
}
