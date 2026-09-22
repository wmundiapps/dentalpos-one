import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { runAiTask } from '../services/aiService'
import {
  committeeMemberSchema,
  committeeSchema,
  pdiEvidenceSchema,
  pdiGoalSchema,
  pdiGoalUpdateSchema,
  regulatoryWatchSchema,
  regulatoryWatchStatusSchema
} from '../validators/eduGovernanceValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// COMISSÕES (CPA, CIPA, NDE, outras)
// ---------------------------------------------------------------

export async function listCommittees(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduCommittee.findMany({ where: { clinicId, tenantId, isActive: true }, include: { members: true }, orderBy: { name: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar comissões.' })
  }
}

export async function createCommittee(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = committeeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduCommittee.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_COMMITTEE_CREATE', entityType: 'EduCommittee', entityId: row.id, summary: `Comissão "${row.name}" (${row.type}) criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar comissão.' })
  }
}

export async function addCommitteeMember(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const committeeId = String(req.params.committeeId)
    const committee = await prisma.eduCommittee.findFirst({ where: { id: committeeId, clinicId, tenantId } })
    if (!committee) return res.status(404).json({ error: 'Comissão não encontrada.' })

    const parsed = committeeMemberSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduCommitteeMember.create({ data: { committeeId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_COMMITTEE_MEMBER_ADD', entityType: 'EduCommitteeMember', entityId: row.id, summary: `${row.name} incluído na comissão ${committee.name}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao incluir membro na comissão.' })
  }
}

// ---------------------------------------------------------------
// PDI — metas, indicadores, evidências
// ---------------------------------------------------------------

export async function listPdiGoals(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduPdiGoal.findMany({ where: { clinicId, tenantId, ...(status ? { status } : {}) }, include: { evidences: true }, orderBy: { dueDate: 'asc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar metas do PDI.' })
  }
}

export async function createPdiGoal(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = pdiGoalSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduPdiGoal.create({
      data: { clinicId, tenantId, ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PDI_GOAL_CREATE', entityType: 'EduPdiGoal', entityId: row.id, summary: `Meta do PDI "${row.title}" criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar meta do PDI.' })
  }
}

export async function updatePdiGoal(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduPdiGoal.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Meta do PDI não encontrada.' })

    const parsed = pdiGoalUpdateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduPdiGoal.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PDI_GOAL_UPDATE', entityType: 'EduPdiGoal', entityId: id, summary: `Meta do PDI "${existing.title}" atualizada.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar meta do PDI.' })
  }
}

export async function addPdiEvidence(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const goalId = String(req.params.goalId)
    const goal = await prisma.eduPdiGoal.findFirst({ where: { id: goalId, clinicId, tenantId } })
    if (!goal) return res.status(404).json({ error: 'Meta do PDI não encontrada.' })

    const parsed = pdiEvidenceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduPdiEvidence.create({ data: { goalId, createdById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PDI_EVIDENCE_ADD', entityType: 'EduPdiEvidence', entityId: row.id, summary: `Evidência "${row.title}" anexada à meta "${goal.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao anexar evidência.' })
  }
}

// ---------------------------------------------------------------
// VIGILÂNCIA REGULATÓRIA — diários oficiais e atos do MEC, com
// triagem por IA (services/aiService.ts compartilhado).
// ---------------------------------------------------------------

export async function listRegulatoryWatches(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const relevance = typeof req.query.relevance === 'string' ? req.query.relevance : undefined
    const rows = await prisma.eduRegulatoryWatch.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}), ...(relevance ? { relevance } : {}) },
      orderBy: { publishedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar itens de vigilância regulatória.' })
  }
}

export async function createRegulatoryWatch(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = regulatoryWatchSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduRegulatoryWatch.create({
      data: { clinicId, tenantId, createdById: actorId, ...parsed.data, publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REGULATORY_WATCH_CREATE', entityType: 'EduRegulatoryWatch', entityId: row.id, summary: `Item regulatório "${row.title}" registrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar item de vigilância regulatória.' })
  }
}

// Triagem por IA: classifica relevância e resume o excerto, alertando
// o responsável quando a relevância sai ALTA (via listagem filtrada).
export async function triageRegulatoryWatch(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduRegulatoryWatch.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Item não encontrado.' })
    if (!existing.rawExcerpt?.trim()) return res.status(400).json({ error: 'Item não possui texto para triagem.' })

    const system = 'Você analisa publicações de diário oficial e atos regulatórios para uma instituição de ensino superior brasileira. Responda SOMENTE com JSON válido no formato {"relevant": true|false, "relevance": "ALTA"|"MEDIA"|"BAIXA", "summary": "..."}. Considere ALTA relevância quando o texto afeta diretamente credenciamento, autorização de cursos, prazos do MEC, obrigações trabalhistas ou sanitárias da instituição.'
    const prompt = `Título: ${existing.title}\nFonte: ${existing.source}\nTexto: ${existing.rawExcerpt}`

    const ai = await runAiTask({
      clinicId, tenantId, actorId, task: 'EDU_TRIAGEM_REGULATORIA', system, prompt,
      maxTokens: 800, referenceType: 'EduRegulatoryWatch', referenceId: id
    })
    if (!ai.ok) return res.status(422).json({ error: 'Não foi possível triar com IA.', reason: ai.reason })

    let parsedAi: any
    try {
      parsedAi = JSON.parse(ai.text || '{}')
    } catch {
      return res.status(502).json({ error: 'A IA devolveu um formato inválido.' })
    }

    const relevance = ['ALTA', 'MEDIA', 'BAIXA'].includes(parsedAi?.relevance) ? parsedAi.relevance : 'BAIXA'
    const row = await prisma.eduRegulatoryWatch.update({
      where: { id },
      data: { aiRelevant: Boolean(parsedAi?.relevant), aiSummary: String(parsedAi?.summary || '').slice(0, 4000), relevance, status: 'EM_ANALISE' }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REGULATORY_WATCH_TRIAGE', entityType: 'EduRegulatoryWatch', entityId: id, summary: `Triagem por IA: relevância ${relevance}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao triar item regulatório.' })
  }
}

export async function updateRegulatoryWatchStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduRegulatoryWatch.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Item não encontrado.' })

    const parsed = regulatoryWatchStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduRegulatoryWatch.update({ where: { id }, data: parsed.data })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REGULATORY_WATCH_STATUS', entityType: 'EduRegulatoryWatch', entityId: id, summary: `Item "${existing.title}" → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status do item regulatório.' })
  }
}
