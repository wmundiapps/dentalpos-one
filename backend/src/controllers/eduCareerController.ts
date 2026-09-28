import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { jobApplicationDecisionSchema, jobApplicationSchema, jobPostingSchema } from '../validators/eduCareerValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function myStudent(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  if (!req.user) return null
  return prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// VAGAS (mural de estágio/emprego)
// ---------------------------------------------------------------

export async function listJobPostings(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduJobPosting.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar vagas.' })
  }
}

export async function createJobPosting(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = jobPostingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da vaga inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduJobPosting.create({
      data: {
        clinicId, tenantId, postedById: actorId, ...parsed.data,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_JOB_POSTING_CREATE', entityType: 'EduJobPosting', entityId: row.id, summary: `Vaga "${row.title}" (${row.company}) publicada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao publicar vaga.' })
  }
}

export async function closeJobPosting(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduJobPosting.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Vaga não encontrada.' })

    const row = await prisma.eduJobPosting.update({ where: { id }, data: { isActive: false } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_JOB_POSTING_CLOSE', entityType: 'EduJobPosting', entityId: id, summary: `Vaga "${existing.title}" encerrada.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao encerrar vaga.' })
  }
}

export async function listJobApplications(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const postingId = String(req.params.postingId)
    const posting = await prisma.eduJobPosting.findFirst({ where: { id: postingId, clinicId, tenantId } })
    if (!posting) return res.status(404).json({ error: 'Vaga não encontrada.' })

    const rows = await prisma.eduJobApplication.findMany({ where: { postingId }, include: { student: true }, orderBy: { createdAt: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar candidaturas.' })
  }
}

export async function decideJobApplication(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const application = await prisma.eduJobApplication.findFirst({ where: { id, posting: { clinicId, tenantId } }, include: { posting: true } })
    if (!application) return res.status(404).json({ error: 'Candidatura não encontrada.' })

    const parsed = jobApplicationDecisionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduJobApplication.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_JOB_APPLICATION_DECIDE', entityType: 'EduJobApplication', entityId: id, summary: `Candidatura à vaga "${application.posting.title}" marcada como ${row.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao decidir candidatura.' })
  }
}

// ---------------------------------------------------------------
// PORTAL DO ALUNO (self-service)
// ---------------------------------------------------------------

export async function myJobApplications(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const rows = await prisma.eduJobApplication.findMany({ where: { studentId: student.id }, include: { posting: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar suas candidaturas.' })
  }
}

export async function applyToJobPosting(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const postingId = String(req.params.postingId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const posting = await prisma.eduJobPosting.findFirst({ where: { id: postingId, clinicId, tenantId, isActive: true } })
    if (!posting) return res.status(404).json({ error: 'Vaga não encontrada ou encerrada.' })

    const parsed = jobApplicationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduJobApplication.findFirst({ where: { postingId, studentId: student.id } })
    if (duplicate) return res.status(409).json({ error: 'Você já se candidatou a esta vaga.' })

    const row = await prisma.eduJobApplication.create({ data: { postingId, studentId: student.id, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_JOB_APPLICATION_CREATE', entityType: 'EduJobApplication', entityId: row.id, summary: `${student.fullName} se candidatou à vaga "${posting.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao enviar candidatura.' })
  }
}
