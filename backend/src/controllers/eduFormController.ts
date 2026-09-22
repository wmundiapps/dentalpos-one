import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { formAdvanceSchema, formReviewSchema, formSubmissionSchema, formTemplateSchema } from '../validators/eduFormValidator'

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

type FieldDef = { key: string; label: string; type: string; required: boolean; options: string[] }

function validateSubmissionData(fields: FieldDef[], data: Record<string, unknown>) {
  for (const field of fields) {
    const value = data[field.key]
    if (field.required && (value === undefined || value === null || value === '')) {
      return `Campo obrigatório não preenchido: ${field.label}.`
    }
    if (value === undefined || value === null || value === '') continue
    if (field.type === 'NUMBER' && typeof value !== 'number') return `Campo "${field.label}" deve ser numérico.`
    if (field.type === 'BOOLEAN' && typeof value !== 'boolean') return `Campo "${field.label}" deve ser sim/não.`
    if (field.type === 'SELECT' && !field.options.includes(String(value))) return `Valor inválido para "${field.label}".`
  }
  return null
}

// ---------------------------------------------------------------
// MODELOS DE FORMULÁRIO (configurável por departamento)
// ---------------------------------------------------------------

export async function listFormTemplates(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const department = typeof req.query.department === 'string' ? req.query.department : undefined
    const rows = await prisma.eduFormTemplate.findMany({ where: { clinicId, tenantId, isActive: true, ...(department ? { department } : {}) }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar modelos de formulário.' })
  }
}

export async function createFormTemplate(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = formTemplateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const keys = parsed.data.fields.map(field => field.key)
    if (new Set(keys).size !== keys.length) return res.status(400).json({ error: 'Há campos com a mesma chave (key) repetida.' })

    const row = await prisma.eduFormTemplate.create({
      data: {
        clinicId, tenantId, createdById: actorId, name: parsed.data.name, description: parsed.data.description,
        department: parsed.data.department, isActive: parsed.data.isActive,
        fields: parsed.data.fields as unknown as Prisma.InputJsonValue,
        workflowSteps: parsed.data.workflowSteps as unknown as Prisma.InputJsonValue
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORM_TEMPLATE_CREATE', entityType: 'EduFormTemplate', entityId: row.id, summary: `Formulário "${row.name}" (${row.department}) criado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar modelo de formulário.' })
  }
}

// ---------------------------------------------------------------
// SUBMISSÕES
// ---------------------------------------------------------------

export async function listFormSubmissions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduFormSubmission.findMany({
      where: { clinicId, tenantId, ...(templateId ? { templateId } : {}), ...(status ? { status } : {}) },
      include: { template: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar submissões.' })
  }
}

export async function createFormSubmission(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const templateId = String(req.params.templateId)
    const template = await prisma.eduFormTemplate.findFirst({ where: { id: templateId, clinicId, tenantId, isActive: true } })
    if (!template) return res.status(404).json({ error: 'Modelo de formulário não encontrado ou inativo.' })

    const parsed = formSubmissionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const fields = template.fields as unknown as FieldDef[]
    const validationError = validateSubmissionData(fields, parsed.data.data)
    if (validationError) return res.status(400).json({ error: validationError })

    const student = await myStudent(req)
    const row = await prisma.eduFormSubmission.create({
      data: {
        clinicId, tenantId, templateId, submittedByStudentId: student?.id, submittedByUserId: student ? undefined : actorId,
        submitterName: parsed.data.submitterName, data: parsed.data.data as unknown as Prisma.InputJsonValue
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORM_SUBMISSION_CREATE', entityType: 'EduFormSubmission', entityId: row.id, summary: `Nova submissão do formulário "${template.name}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao enviar formulário.' })
  }
}

export async function reviewFormSubmission(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduFormSubmission.findFirst({ where: { id, clinicId, tenantId }, include: { template: true } })
    if (!existing) return res.status(404).json({ error: 'Submissão não encontrada.' })

    const parsed = formReviewSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduFormSubmission.update({ where: { id }, data: { ...parsed.data, reviewedById: actorId } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORM_SUBMISSION_REVIEW', entityType: 'EduFormSubmission', entityId: id, summary: `Submissão de "${existing.template.name}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao revisar submissão.' })
  }
}

// Avança para a próxima etapa do fluxo configurável do formulário
// (workflowSteps do template). Ao chegar na última etapa, conclui.
export async function advanceFormSubmission(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduFormSubmission.findFirst({ where: { id, clinicId, tenantId }, include: { template: true } })
    if (!existing) return res.status(404).json({ error: 'Submissão não encontrada.' })

    const steps = existing.template.workflowSteps as unknown as string[]
    if (!steps.length) return res.status(400).json({ error: 'Este formulário não possui fluxo configurado.' })
    if (existing.currentStep >= steps.length - 1 && existing.status === 'CONCLUIDO') {
      return res.status(409).json({ error: 'Fluxo já concluído.' })
    }

    const parsed = formAdvanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const history = (existing.stepHistory as unknown as any[]) || []
    history.push({ step: steps[existing.currentStep], actorId, at: new Date().toISOString(), notes: parsed.data.notes })

    const nextStep = existing.currentStep + 1
    const finished = nextStep >= steps.length

    const row = await prisma.eduFormSubmission.update({
      where: { id },
      data: {
        currentStep: finished ? existing.currentStep : nextStep,
        stepHistory: history as unknown as Prisma.InputJsonValue,
        status: finished ? 'CONCLUIDO' : 'EM_ANALISE'
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_FORM_SUBMISSION_ADVANCE', entityType: 'EduFormSubmission', entityId: id, summary: finished ? 'Fluxo concluído.' : `Fluxo avançou para "${steps[nextStep]}".` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao avançar fluxo da submissão.' })
  }
}

export async function myFormSubmissions(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    const rows = await prisma.eduFormSubmission.findMany({ where: { submittedByStudentId: student.id }, include: { template: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar minhas submissões.' })
  }
}
