import crypto from 'crypto'
import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { requestClinicalSignature } from '../services/signatureAdapter'

const DOCUMENT_TYPES = new Set(['PRESCRIPTION','CERTIFICATE','DECLARATION','REFERRAL','EXAM_REQUEST','REPORT','CONSENT','CLINICAL_CONTRACT','REFUSAL','POST_OP_INSTRUCTIONS'])
const DOCUMENT_STATUS = new Set(['DRAFT','ISSUED','CANCELLED'])

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorUserId: req.user.id }
}

async function patientInScope(patientId: string, clinicId: string, tenantId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { id: true, fullName: true } })
}

function requiredString(value: unknown, field: string) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${field} é obrigatório.`)
  return text
}

export async function listTemplates(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.clinicalDocumentTemplate.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: [{ documentType: 'asc' }, { title: 'asc' }] })
    return res.json(rows)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao listar modelos clínicos.' }) }
}

export async function createTemplate(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const documentType = requiredString(req.body.documentType, 'Tipo')
    if (!DOCUMENT_TYPES.has(documentType)) return res.status(400).json({ error: 'Tipo de documento inválido.' })
    const row = await prisma.clinicalDocumentTemplate.create({ data: {
      clinicId, tenantId, documentType,
      title: requiredString(req.body.title, 'Título'),
      content: requiredString(req.body.content, 'Conteúdo'),
      footer: req.body.footer ? String(req.body.footer) : null,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    } })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_TEMPLATE_CREATE', entityType: 'ClinicalDocumentTemplate', entityId: row.id, metadata: { documentType } })
    return res.status(201).json(row)
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Erro ao criar modelo clínico.' }) }
}

export async function updateTemplate(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const id = String(req.params.id)
    const current = await prisma.clinicalDocumentTemplate.findFirst({ where: { id, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Modelo não encontrado.' })
    const row = await prisma.clinicalDocumentTemplate.update({ where: { id }, data: {
      title: req.body.title !== undefined ? requiredString(req.body.title, 'Título') : undefined,
      content: req.body.content !== undefined ? requiredString(req.body.content, 'Conteúdo') : undefined,
      footer: req.body.footer !== undefined ? (req.body.footer ? String(req.body.footer) : null) : undefined,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
      updatedBy: actorUserId,
    } })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_TEMPLATE_UPDATE', entityType: 'ClinicalDocumentTemplate', entityId: id })
    return res.json(row)
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Erro ao atualizar modelo.' }) }
}

export async function listDocuments(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const patientId = req.query.patientId ? String(req.query.patientId) : undefined
    const rows = await prisma.clinicalDocument.findMany({ where: { clinicId, tenantId, ...(patientId ? { patientId } : {}) }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao listar documentos clínicos.' }) }
}

export async function createDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const patientId = requiredString(req.body.patientId, 'Paciente')
    const patient = await patientInScope(patientId, clinicId, tenantId)
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
    const documentType = requiredString(req.body.documentType, 'Tipo')
    if (!DOCUMENT_TYPES.has(documentType)) return res.status(400).json({ error: 'Tipo de documento inválido.' })
    const content = requiredString(req.body.content, 'Conteúdo')
    const status = String(req.body.status || 'DRAFT')
    if (!DOCUMENT_STATUS.has(status)) return res.status(400).json({ error: 'Status inválido.' })
    const issuedAt = status === 'ISSUED' ? new Date() : null
    const contentHash = crypto.createHash('sha256').update(content).digest('hex')
    const row = await prisma.clinicalDocument.create({ data: {
      clinicId, tenantId, patientId,
      professionalId: req.body.professionalId ? String(req.body.professionalId) : null,
      professionalName: requiredString(req.body.professionalName, 'Profissional'),
      documentType,
      templateId: req.body.templateId ? String(req.body.templateId) : null,
      title: requiredString(req.body.title, 'Título'),
      content,
      footer: req.body.footer ? String(req.body.footer) : null,
      status,
      issuedAt,
      authoredBy: actorUserId,
      contentHash,
      version: 1,
    } })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_DOCUMENT_CREATE', entityType: 'ClinicalDocument', entityId: row.id, metadata: { patientId, documentType, status, version: 1 } })
    return res.status(201).json(row)
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Erro ao emitir documento clínico.' }) }
}

export async function reviseDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const id = String(req.params.id)
    const current = await prisma.clinicalDocument.findFirst({ where: { id, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' })
    if (current.status === 'CANCELLED') return res.status(409).json({ error: 'Documento cancelado não pode ser revisado.' })
    const content = requiredString(req.body.content ?? current.content, 'Conteúdo')
    const contentHash = crypto.createHash('sha256').update(content).digest('hex')
    const next = await prisma.$transaction(async tx => {
      await tx.clinicalDocumentHistory.create({ data: {
        clinicId, tenantId, documentId: current.id, version: current.version,
        title: current.title, content: current.content, footer: current.footer,
        status: current.status, contentHash: current.contentHash, authoredBy: current.authoredBy,
        snapshotAt: new Date(),
      } })
      return tx.clinicalDocument.update({ where: { id }, data: {
        title: req.body.title !== undefined ? requiredString(req.body.title, 'Título') : current.title,
        content,
        footer: req.body.footer !== undefined ? (req.body.footer ? String(req.body.footer) : null) : current.footer,
        version: current.version + 1,
        contentHash,
        authoredBy: actorUserId,
      } })
    })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_DOCUMENT_REVISE', entityType: 'ClinicalDocument', entityId: id, metadata: { fromVersion: current.version, toVersion: next.version } })
    return res.json(next)
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Erro ao revisar documento.' }) }
}

export async function issueDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const id = String(req.params.id)
    const current = await prisma.clinicalDocument.findFirst({ where: { id, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' })
    if (current.status === 'CANCELLED') return res.status(409).json({ error: 'Documento cancelado não pode ser emitido.' })
    const row = await prisma.clinicalDocument.update({ where: { id }, data: { status: 'ISSUED', issuedAt: current.issuedAt || new Date() } })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_DOCUMENT_ISSUE', entityType: 'ClinicalDocument', entityId: id })
    return res.json(row)
  } catch (error) { return res.status(500).json({ error: 'Erro ao emitir documento.' }) }
}

export async function cancelDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const id = String(req.params.id)
    const current = await prisma.clinicalDocument.findFirst({ where: { id, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' })
    const reason = requiredString(req.body.reason, 'Motivo do cancelamento')
    const row = await prisma.clinicalDocument.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_DOCUMENT_CANCEL', entityType: 'ClinicalDocument', entityId: id, metadata: { reason } })
    return res.json(row)
  } catch (error: any) { return res.status(400).json({ error: error?.message || 'Erro ao cancelar documento.' }) }
}

export async function documentHistory(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const documentId = String(req.params.id)
    const current = await prisma.clinicalDocument.findFirst({ where: { id: documentId, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' })
    const history = await prisma.clinicalDocumentHistory.findMany({ where: { documentId, clinicId, tenantId }, orderBy: { version: 'desc' } })
    return res.json({ current, history })
  } catch (error) { return res.status(500).json({ error: 'Erro ao carregar histórico do documento.' }) }
}

export async function requestSignature(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req)
    const id = String(req.params.id)
    const current = await prisma.clinicalDocument.findFirst({ where: { id, clinicId, tenantId } })
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' })
    const result = await requestClinicalSignature({ documentId: id, patientId: current.patientId, signerName: req.body.signerName, signerDocument: req.body.signerDocument, contentHash: current.contentHash })
    await writeAudit({ clinicId, tenantId, actorId: actorUserId, module: 'clinical', action: 'CLINICAL_DOCUMENT_SIGNATURE_REQUEST', entityType: 'ClinicalDocument', entityId: id, metadata: { provider: result.provider, status: result.status } })
    return res.status(result.status === 'UNAVAILABLE' ? 501 : 200).json(result)
  } catch (error) { return res.status(500).json({ error: 'Erro ao solicitar assinatura.' }) }
}
