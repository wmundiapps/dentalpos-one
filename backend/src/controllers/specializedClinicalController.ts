import { Response } from 'express'
import { ZodError } from 'zod'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import * as specializedClinicalService from '../services/specializedClinicalService'
import {
  createSpecializedAttachmentSchema,
  createSpecializedEvolutionSchema,
  createSpecializedRecordSchema,
  parseSpecializedClinicalData,
  specialtySchema,
  updateSpecializedRecordSchema,
} from '../validation/specializedClinicalSchemas'

function context(req: AuthRequest): specializedClinicalService.SpecializedClinicalContext {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function validationError(res: Response, error: unknown) {
  if (!(error instanceof ZodError)) return false
  res.status(400).json({ error: 'Dados clínicos inválidos.', issues: error.issues })
  return true
}

async function checkedPatient(req: AuthRequest, res: Response) {
  const ctx = context(req)
  const patientId = String(req.params.patientId)
  const patient = await specializedClinicalService.assertPatient(ctx, patientId)
  if (!patient) res.status(404).json({ error: 'Paciente não encontrado nesta clínica.' })
  return patient ? { ctx, patientId, patient } : null
}

async function checkedRecord(req: AuthRequest, res: Response) {
  const base = await checkedPatient(req, res)
  if (!base) return null
  const recordId = String(req.params.recordId)
  const record = await specializedClinicalService.findRecord(base.ctx, base.patientId, recordId)
  if (!record) res.status(404).json({ error: 'Registro especializado não encontrado nesta clínica.' })
  return record ? { ...base, recordId, record } : null
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const base = await checkedPatient(req, res); if (!base) return
    const records = await specializedClinicalService.listPatientRecords(base.ctx, base.patientId)
    return res.json({ patient: base.patient, records })
  } catch (error) {
    console.error(error); return res.status(500).json({ error: 'Erro ao carregar acompanhamento especializado.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const base = await checkedPatient(req, res); if (!base) return
    const input = createSpecializedRecordSchema.parse(req.body)
    const record = await specializedClinicalService.createRecord(base.ctx, base.patientId, input)
    await writeAudit({ clinicId: base.ctx.clinicId, tenantId: base.ctx.tenantId, actorId: base.ctx.actorId, module: 'specialized-clinical', action: 'SPECIALIZED_RECORD_CREATE', entityType: 'SpecializedClinicalRecord', entityId: record.id, summary: `Acompanhamento ${record.specialty} criado para ${base.patient.fullName}.`, metadata: { patientId: base.patientId, specialty: record.specialty } })
    return res.status(201).json(record)
  } catch (error) {
    if (validationError(res, error)) return
    console.error(error); return res.status(500).json({ error: 'Erro ao criar acompanhamento especializado.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const base = await checkedRecord(req, res); if (!base) return
    const parsed = updateSpecializedRecordSchema.parse(req.body)
    const specialty = specialtySchema.parse(base.record.specialty)
    const input = parsed.clinicalData
      ? { ...parsed, clinicalData: parseSpecializedClinicalData(specialty, parsed.clinicalData) }
      : parsed
    const record = await specializedClinicalService.updateRecord(base.ctx, base.recordId, input)
    await writeAudit({ clinicId: base.ctx.clinicId, tenantId: base.ctx.tenantId, actorId: base.ctx.actorId, module: 'specialized-clinical', action: 'SPECIALIZED_RECORD_UPDATE', entityType: 'SpecializedClinicalRecord', entityId: record.id, beforeData: base.record, afterData: record, summary: `Acompanhamento ${record.specialty} atualizado.` })
    return res.json(record)
  } catch (error) {
    if (validationError(res, error)) return
    console.error(error); return res.status(500).json({ error: 'Erro ao atualizar acompanhamento especializado.' })
  }
}

export async function storeEvolution(req: AuthRequest, res: Response) {
  try {
    const base = await checkedRecord(req, res); if (!base) return
    const input = createSpecializedEvolutionSchema.parse(req.body)
    const evolution = await specializedClinicalService.createEvolution(base.ctx, base.patientId, base.recordId, input)
    await writeAudit({ clinicId: base.ctx.clinicId, tenantId: base.ctx.tenantId, actorId: base.ctx.actorId, module: 'specialized-clinical', action: 'SPECIALIZED_EVOLUTION_CREATE', entityType: 'SpecializedClinicalEvolution', entityId: evolution.id, summary: `Evolução especializada registrada para ${base.patient.fullName}.`, metadata: { patientId: base.patientId, recordId: base.recordId, specialty: base.record.specialty, evolutionType: evolution.evolutionType } })
    return res.status(201).json(evolution)
  } catch (error) {
    if (validationError(res, error)) return
    console.error(error); return res.status(500).json({ error: 'Erro ao registrar evolução especializada.' })
  }
}

export async function storeAttachment(req: AuthRequest, res: Response) {
  try {
    const base = await checkedRecord(req, res); if (!base) return
    const input = createSpecializedAttachmentSchema.parse(req.body)
    const attachment = await specializedClinicalService.createAttachment(base.ctx, base.patientId, base.recordId, input)
    await writeAudit({ clinicId: base.ctx.clinicId, tenantId: base.ctx.tenantId, actorId: base.ctx.actorId, module: 'specialized-clinical', action: 'SPECIALIZED_ATTACHMENT_LINK', entityType: 'SpecializedClinicalAttachment', entityId: attachment.id, summary: `Arquivo clínico vinculado ao acompanhamento ${base.record.specialty}.`, metadata: { patientId: base.patientId, recordId: base.recordId, category: attachment.category, clinicalFileId: attachment.clinicalFileId } })
    return res.status(201).json(attachment)
  } catch (error) {
    if (validationError(res, error)) return
    console.error(error); return res.status(500).json({ error: 'Erro ao vincular arquivo clínico.' })
  }
}

export async function archiveAttachment(req: AuthRequest, res: Response) {
  try {
    const base = await checkedRecord(req, res); if (!base) return
    const attachmentId = String(req.params.attachmentId)
    const attachment = await specializedClinicalService.archiveAttachment(base.ctx, base.patientId, base.recordId, attachmentId)
    if (!attachment) return res.status(404).json({ error: 'Vínculo de arquivo não encontrado nesta clínica.' })
    await writeAudit({ clinicId: base.ctx.clinicId, tenantId: base.ctx.tenantId, actorId: base.ctx.actorId, module: 'specialized-clinical', action: 'SPECIALIZED_ATTACHMENT_ARCHIVE', entityType: 'SpecializedClinicalAttachment', entityId: attachment.id, summary: 'Vínculo de arquivo clínico arquivado sem excluir o arquivo original.', metadata: { patientId: base.patientId, recordId: base.recordId } })
    return res.json(attachment)
  } catch (error) {
    console.error(error); return res.status(500).json({ error: 'Erro ao arquivar vínculo de arquivo.' })
  }
}
