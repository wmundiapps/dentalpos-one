import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  legalCaseSchema,
  legalCaseStatusSchema,
  legalDeadlineSchema,
  legalDocumentSchema,
  legalHearingOutcomeSchema,
  legalHearingSchema
} from '../validators/eduLegalValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// DEMANDAS (conciliação administrativa)
// ---------------------------------------------------------------

export async function listLegalCases(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduLegalCase.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}) },
      include: { student: true, hearings: true, documents: true, _count: { select: { hearings: true, documents: true } } },
      orderBy: { openedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar demandas jurídicas.' })
  }
}

export async function createLegalCase(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = legalCaseSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.studentId) {
      const student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
      if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    }

    const row = await prisma.eduLegalCase.create({ data: { clinicId, tenantId, createdById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_CASE_CREATE', entityType: 'EduLegalCase', entityId: row.id, summary: `Demanda "${row.title}" (${row.type}) aberta.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao abrir demanda jurídica.' })
  }
}

export async function updateLegalCaseStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduLegalCase.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Demanda não encontrada.' })

    const parsed = legalCaseStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const closedStatuses = ['RESOLVIDO', 'ENCAMINHADO_EXTERNO', 'ARQUIVADO']
    const row = await prisma.eduLegalCase.update({
      where: { id },
      data: { ...parsed.data, closedAt: closedStatuses.includes(parsed.data.status) ? new Date() : existing.closedAt }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_CASE_STATUS', entityType: 'EduLegalCase', entityId: id, summary: `Demanda "${existing.title}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status da demanda.' })
  }
}

// ---------------------------------------------------------------
// AUDIÊNCIAS INTERNAS
// ---------------------------------------------------------------

export async function scheduleHearing(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const caseId = String(req.params.caseId)
    const legalCase = await prisma.eduLegalCase.findFirst({ where: { id: caseId, clinicId, tenantId } })
    if (!legalCase) return res.status(404).json({ error: 'Demanda não encontrada.' })

    const parsed = legalHearingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const [row] = await prisma.$transaction([
      prisma.eduLegalHearing.create({ data: { caseId, ...parsed.data, scheduledAt: new Date(parsed.data.scheduledAt) } }),
      prisma.eduLegalCase.update({ where: { id: caseId }, data: { status: 'AUDIENCIA_MARCADA' } })
    ])
    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_HEARING_SCHEDULE', entityType: 'EduLegalHearing', entityId: row.id, summary: `Audiência marcada para a demanda "${legalCase.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao agendar audiência.' })
  }
}

export async function recordHearingOutcome(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const hearing = await prisma.eduLegalHearing.findFirst({ where: { id, legalCase: { clinicId, tenantId } }, include: { legalCase: true } })
    if (!hearing) return res.status(404).json({ error: 'Audiência não encontrada.' })

    const parsed = legalHearingOutcomeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduLegalHearing.update({ where: { id }, data: parsed.data })

    if (parsed.data.outcome === 'ACORDO') {
      await prisma.eduLegalCase.update({ where: { id: hearing.caseId }, data: { status: 'RESOLVIDO', closedAt: new Date() } })
    }

    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_HEARING_OUTCOME', entityType: 'EduLegalHearing', entityId: id, summary: `Audiência da demanda "${hearing.legalCase.title}" registrada (${parsed.data.status}${parsed.data.outcome ? `, ${parsed.data.outcome}` : ''}).` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar resultado da audiência.' })
  }
}

// ---------------------------------------------------------------
// DOCUMENTOS DO CASO
// ---------------------------------------------------------------

export async function addLegalDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const caseId = String(req.params.caseId)
    const legalCase = await prisma.eduLegalCase.findFirst({ where: { id: caseId, clinicId, tenantId } })
    if (!legalCase) return res.status(404).json({ error: 'Demanda não encontrada.' })

    const parsed = legalDocumentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduLegalDocument.create({ data: { caseId, uploadedById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_DOCUMENT_ADD', entityType: 'EduLegalDocument', entityId: row.id, summary: `Documento "${row.title}" anexado à demanda "${legalCase.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao anexar documento.' })
  }
}

// ---------------------------------------------------------------
// PRAZOS — reaproveita EduExpiringItem (Facilities), com
// relatedType="EduLegalCase" para diferenciar de outros vencimentos.
// ---------------------------------------------------------------

export async function addLegalDeadline(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const caseId = String(req.params.caseId)
    const legalCase = await prisma.eduLegalCase.findFirst({ where: { id: caseId, clinicId, tenantId } })
    if (!legalCase) return res.status(404).json({ error: 'Demanda não encontrada.' })

    const parsed = legalDeadlineSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduExpiringItem.create({
      data: {
        clinicId, tenantId, createdById: actorId, category: 'OUTRO', title: parsed.data.title,
        expiresAt: new Date(parsed.data.expiresAt), preparationDays: parsed.data.preparationDays, safetyMarginDays: parsed.data.safetyMarginDays,
        responsibleUserId: parsed.data.responsibleUserId, relatedType: 'EduLegalCase', relatedId: caseId
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_LEGAL_DEADLINE_ADD', entityType: 'EduExpiringItem', entityId: row.id, summary: `Prazo "${row.title}" cadastrado para a demanda "${legalCase.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar prazo.' })
  }
}

export async function listLegalDeadlines(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const caseId = String(req.params.caseId)
    const rows = await prisma.eduExpiringItem.findMany({ where: { clinicId, tenantId, relatedType: 'EduLegalCase', relatedId: caseId }, orderBy: { expiresAt: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar prazos da demanda.' })
  }
}
