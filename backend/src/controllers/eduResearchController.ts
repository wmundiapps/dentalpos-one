import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  fundingAgencySchema,
  fundingCallSchema,
  researchProjectMemberSchema,
  researchProjectSchema,
  researchProjectStatusSchema
} from '../validators/eduResearchValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// FINANCIADORES E EDITAIS
// ---------------------------------------------------------------

export async function listFundingAgencies(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduFundingAgency.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar financiadores.' })
  }
}

export async function createFundingAgency(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = fundingAgencySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduFundingAgency.findFirst({ where: { clinicId, name: parsed.data.name } })
    if (duplicate) return res.status(409).json({ error: 'Já existe um financiador com este nome.' })

    const row = await prisma.eduFundingAgency.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FUNDING_AGENCY_CREATE', entityType: 'EduFundingAgency', entityId: row.id, summary: `Financiador "${row.name}" cadastrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar financiador.' })
  }
}

export async function listFundingCalls(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduFundingCall.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}) },
      include: { agency: true },
      orderBy: { applicationDeadline: 'asc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar editais.' })
  }
}

export async function createFundingCall(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = fundingCallSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const agency = await prisma.eduFundingAgency.findFirst({ where: { id: parsed.data.agencyId, clinicId, tenantId } })
    if (!agency) return res.status(400).json({ error: 'Financiador inválido.' })

    const row = await prisma.eduFundingCall.create({
      data: {
        clinicId, tenantId, ...parsed.data,
        applicationDeadline: new Date(parsed.data.applicationDeadline),
        resultDate: parsed.data.resultDate ? new Date(parsed.data.resultDate) : undefined
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FUNDING_CALL_CREATE', entityType: 'EduFundingCall', entityId: row.id, summary: `Edital "${row.title}" (${agency.name}) cadastrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar edital.' })
  }
}

// ---------------------------------------------------------------
// PROJETOS DE PESQUISA E EXTENSÃO
// ---------------------------------------------------------------

export async function listResearchProjects(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const rows = await prisma.eduResearchProject.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      include: { fundingAgency: true, fundingCall: true, program: true, members: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar projetos.' })
  }
}

export async function createResearchProject(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = researchProjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.fundingCallId) {
      const call = await prisma.eduFundingCall.findFirst({ where: { id: parsed.data.fundingCallId, clinicId, tenantId } })
      if (!call) return res.status(400).json({ error: 'Edital inválido.' })
    }
    if (parsed.data.programId) {
      const program = await prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } })
      if (!program) return res.status(400).json({ error: 'Programa inválido.' })
    }

    const row = await prisma.eduResearchProject.create({
      data: {
        clinicId, tenantId, createdById: actorId, ...parsed.data,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_RESEARCH_PROJECT_CREATE', entityType: 'EduResearchProject', entityId: row.id, summary: `Projeto "${row.title}" (${row.type}) criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar projeto.' })
  }
}

export async function updateResearchProjectStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduResearchProject.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado.' })

    const parsed = researchProjectStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduResearchProject.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_RESEARCH_PROJECT_STATUS', entityType: 'EduResearchProject', entityId: id, summary: `Projeto "${existing.title}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status do projeto.' })
  }
}

export async function addResearchProjectMember(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const projectId = String(req.params.projectId)
    const project = await prisma.eduResearchProject.findFirst({ where: { id: projectId, clinicId, tenantId } })
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' })

    const parsed = researchProjectMemberSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.studentId) {
      const student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
      if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    }

    const row = await prisma.eduResearchProjectMember.create({ data: { projectId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_RESEARCH_PROJECT_MEMBER_ADD', entityType: 'EduResearchProjectMember', entityId: row.id, summary: `${row.name} incluído(a) no projeto "${project.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao incluir membro no projeto.' })
  }
}

export async function myResearchProjects(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
    const student = await prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const memberships = await prisma.eduResearchProjectMember.findMany({ where: { studentId: student.id }, include: { project: true } })
    return res.json(memberships.map(m => m.project))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar projetos do aluno.' })
  }
}
