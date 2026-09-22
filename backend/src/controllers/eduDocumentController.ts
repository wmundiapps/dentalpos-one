import { randomBytes } from 'crypto'
import { Response, Request } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  certificateSchema,
  documentRequestSchema,
  documentRequestStatusSchema,
  documentUploadSchema
} from '../validators/eduDocumentValidator'

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

function generateVerificationCode() {
  return randomBytes(6).toString('hex').toUpperCase()
}

// ---------------------------------------------------------------
// DOCUMENTOS DO ALUNO (inserção de documentos)
// ---------------------------------------------------------------

export async function listStudentDocuments(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = String(req.params.studentId)
    const rows = await prisma.eduDocumentUpload.findMany({ where: { studentId, clinicId, tenantId }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar documentos do aluno.' })
  }
}

export async function addStudentDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const studentId = String(req.params.studentId)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = documentUploadSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduDocumentUpload.create({ data: { clinicId, tenantId, studentId, uploadedById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_DOCUMENT_UPLOAD_CREATE', entityType: 'EduDocumentUpload', entityId: row.id, summary: `Documento "${row.title}" inserido para ${student.fullName}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao inserir documento.' })
  }
}

export async function myDocuments(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    const rows = await prisma.eduDocumentUpload.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar documentos.' })
  }
}

export async function addMyDocument(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const parsed = documentUploadSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduDocumentUpload.create({ data: { clinicId, tenantId, studentId: student.id, uploadedById: actorId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_DOCUMENT_UPLOAD_SELF', entityType: 'EduDocumentUpload', entityId: row.id, summary: `${student.fullName} inseriu o documento "${row.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao inserir documento.' })
  }
}

// ---------------------------------------------------------------
// PROTOCOLO (históricos, declarações, certificados, diplomas)
// ---------------------------------------------------------------

async function nextProtocolNumber(clinicId: string) {
  const year = new Date().getFullYear()
  const count = await prisma.eduDocumentRequest.count({ where: { clinicId } })
  return `PROT-${year}-${String(count + 1).padStart(6, '0')}`
}

export async function listDocumentRequests(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const rows = await prisma.eduDocumentRequest.findMany({
      where: { clinicId, tenantId, ...(status ? { status } : {}), ...(studentId ? { studentId } : {}) },
      include: { student: true },
      orderBy: { requestedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar protocolos.' })
  }
}

async function createRequestFor(studentId: string, clinicId: string, tenantId: string, actorId: string | undefined, data: { type: string; deliveryMethod: string; notes?: string }) {
  const protocolNumber = await nextProtocolNumber(clinicId)
  return prisma.eduDocumentRequest.create({
    data: { clinicId, tenantId, studentId, protocolNumber, requestedById: actorId, ...data }
  })
}

export async function createDocumentRequest(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const studentId = String(req.params.studentId)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = documentRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await createRequestFor(studentId, clinicId, tenantId, actorId, parsed.data)
    await audit({ clinicId, tenantId, actorId, action: 'EDU_DOCUMENT_REQUEST_CREATE', entityType: 'EduDocumentRequest', entityId: row.id, summary: `Protocolo ${row.protocolNumber} (${row.type}) aberto para ${student.fullName}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao abrir protocolo.' })
  }
}

export async function updateDocumentRequestStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduDocumentRequest.findFirst({ where: { id, clinicId, tenantId }, include: { student: true } })
    if (!existing) return res.status(404).json({ error: 'Protocolo não encontrado.' })

    const parsed = documentRequestStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduDocumentRequest.update({
      where: { id },
      data: { ...parsed.data, deliveredAt: parsed.data.status === 'ENTREGUE' ? new Date() : existing.deliveredAt }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_DOCUMENT_REQUEST_STATUS', entityType: 'EduDocumentRequest', entityId: id, summary: `Protocolo ${existing.protocolNumber} de ${existing.student.fullName} → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar protocolo.' })
  }
}

export async function myDocumentRequests(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    const rows = await prisma.eduDocumentRequest.findMany({ where: { studentId: student.id }, orderBy: { requestedAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar protocolos.' })
  }
}

export async function createMyDocumentRequest(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const parsed = documentRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await createRequestFor(student.id, clinicId, tenantId, actorId, parsed.data)
    await audit({ clinicId, tenantId, actorId, action: 'EDU_DOCUMENT_REQUEST_SELF', entityType: 'EduDocumentRequest', entityId: row.id, summary: `${student.fullName} abriu o protocolo ${row.protocolNumber} (${row.type}).` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao abrir protocolo.' })
  }
}

// ---------------------------------------------------------------
// CERTIFICADOS E DIPLOMAS
// ---------------------------------------------------------------

export async function listCertificates(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const rows = await prisma.eduCertificate.findMany({ where: { clinicId, tenantId, ...(studentId ? { studentId } : {}) }, include: { student: true }, orderBy: { issueDate: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar certificados.' })
  }
}

export async function createCertificate(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = certificateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
    if (!student) return res.status(400).json({ error: 'Aluno inválido.' })

    if (parsed.data.enrollmentId) {
      const enrollment = await prisma.eduEnrollment.findFirst({ where: { id: parsed.data.enrollmentId, clinicId, tenantId, studentId: student.id } })
      if (!enrollment) return res.status(400).json({ error: 'Matrícula inválida para este aluno.' })
    }

    let verificationCode = generateVerificationCode()
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const clash = await prisma.eduCertificate.findUnique({ where: { verificationCode } })
      if (!clash) break
      verificationCode = generateVerificationCode()
    }

    const row = await prisma.eduCertificate.create({
      data: {
        clinicId, tenantId, issuedById: actorId, verificationCode,
        signatureStatus: parsed.data.type === 'DIPLOMA' ? 'PENDENTE' : 'NAO_APLICAVEL',
        ...parsed.data
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CERTIFICATE_CREATE', entityType: 'EduCertificate', entityId: row.id, summary: `${row.type} emitido para ${student.fullName} (verificação: ${verificationCode}).` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao emitir certificado.' })
  }
}

export async function myCertificates(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    const rows = await prisma.eduCertificate.findMany({ where: { studentId: student.id, status: 'EMITIDO' }, orderBy: { issueDate: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar certificados.' })
  }
}

// Verificação pública de autenticidade (sem autenticação) — qualquer
// terceiro (empregador, outra instituição) pode conferir um certificado
// ou diploma pelo código impresso no documento.
export async function verifyCertificate(req: Request, res: Response) {
  try {
    const code = String(req.params.code || '').trim().toUpperCase()
    const certificate = await prisma.eduCertificate.findUnique({
      where: { verificationCode: code },
      include: { student: true }
    })
    if (!certificate || certificate.status !== 'EMITIDO') {
      return res.status(404).json({ valid: false, error: 'Código de verificação não encontrado ou documento revogado.' })
    }
    return res.json({
      valid: true,
      type: certificate.type,
      title: certificate.title,
      studentName: certificate.student.fullName,
      issueDate: certificate.issueDate,
      registryCode: certificate.registryCode,
      signatureStatus: certificate.signatureStatus
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao verificar certificado.' })
  }
}
