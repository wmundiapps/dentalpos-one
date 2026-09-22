import { Response, Request } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import {
  admissionExamSchema,
  applicationSchema,
  applicationStatusSchema,
  convertToEnrollmentSchema,
  scoreSchema
} from '../validators/eduAdmissionValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// VESTIBULAR / PROCESSO SELETIVO
// ---------------------------------------------------------------

export async function listAdmissionExams(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduAdmissionExam.findMany({
      where: { clinicId, tenantId },
      include: { program: true, _count: { select: { applications: true } } },
      orderBy: { applicationStart: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar processos seletivos.' })
  }
}

export async function createAdmissionExam(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = admissionExamSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const program = await prisma.eduProgram.findFirst({ where: { id: parsed.data.programId, clinicId, tenantId } })
    if (!program) return res.status(400).json({ error: 'Programa inválido.' })
    if (new Date(parsed.data.applicationEnd) <= new Date(parsed.data.applicationStart)) {
      return res.status(400).json({ error: 'Fim das inscrições deve ser posterior ao início.' })
    }

    const row = await prisma.eduAdmissionExam.create({
      data: {
        clinicId, tenantId, programId: parsed.data.programId, name: parsed.data.name, modality: parsed.data.modality,
        vacancies: parsed.data.vacancies, examDate: parsed.data.examDate ? new Date(parsed.data.examDate) : undefined,
        applicationStart: new Date(parsed.data.applicationStart), applicationEnd: new Date(parsed.data.applicationEnd)
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_ADMISSION_EXAM_CREATE', entityType: 'EduAdmissionExam', entityId: row.id, summary: `Processo seletivo "${row.name}" criado (${row.vacancies} vagas).` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar processo seletivo.' })
  }
}

// ---------------------------------------------------------------
// INSCRIÇÃO (pública) — funil integrado ao REVAH
// ---------------------------------------------------------------

// Pública: candidato se inscreve sem autenticação, como uma inscrição
// de vestibular real. Sincroniza RevahContact para o funil de captação
// (reaproveitado, sem alterar esse model).
export async function publicApply(req: Request, res: Response) {
  try {
    const admissionExamId = String(req.params.admissionExamId)
    const exam = await prisma.eduAdmissionExam.findUnique({ where: { id: admissionExamId } })
    if (!exam || exam.status !== 'ABERTO') return res.status(404).json({ error: 'Processo seletivo não encontrado ou encerrado.' })

    const now = new Date()
    if (now < exam.applicationStart || now > exam.applicationEnd) {
      return res.status(409).json({ error: 'Fora do período de inscrições.' })
    }

    const parsed = applicationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduApplication.findFirst({ where: { admissionExamId, candidateEmail: parsed.data.candidateEmail } })
    if (duplicate) return res.status(409).json({ error: 'Você já está inscrito neste processo seletivo.' })

    let contact = await prisma.revahContact.findFirst({ where: { clinicId: exam.clinicId, tenantId: exam.tenantId, email: parsed.data.candidateEmail } })
    if (!contact) {
      contact = await prisma.revahContact.create({
        data: {
          clinicId: exam.clinicId, tenantId: exam.tenantId, name: parsed.data.candidateName,
          email: parsed.data.candidateEmail, phone: parsed.data.candidatePhone,
          tags: { source: 'EDU_CANDIDATO', admissionExamId }
        }
      })
    }

    const row = await prisma.eduApplication.create({
      data: { clinicId: exam.clinicId, tenantId: exam.tenantId, admissionExamId, ...parsed.data, revahContactId: contact.id }
    })
    return res.status(201).json({ id: row.id, status: row.status, protocolEmail: row.candidateEmail })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao processar inscrição.' })
  }
}

export async function listApplications(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const admissionExamId = typeof req.query.admissionExamId === 'string' ? req.query.admissionExamId : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduApplication.findMany({
      where: { clinicId, tenantId, ...(admissionExamId ? { admissionExamId } : {}), ...(status ? { status } : {}) },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }]
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar inscrições.' })
  }
}

export async function setApplicationScore(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduApplication.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Inscrição não encontrada.' })

    const parsed = scoreSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduApplication.update({ where: { id }, data: { score: parsed.data.score, status: 'CONFIRMADO' } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_APPLICATION_SCORE', entityType: 'EduApplication', entityId: id, summary: `Nota ${parsed.data.score} lançada para ${existing.candidateName}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao lançar nota da inscrição.' })
  }
}

export async function updateApplicationStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduApplication.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Inscrição não encontrada.' })

    const parsed = applicationStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduApplication.update({ where: { id }, data: { status: parsed.data.status } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_APPLICATION_STATUS', entityType: 'EduApplication', entityId: id, summary: `Inscrição de ${existing.candidateName} → ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status da inscrição.' })
  }
}

// Classifica automaticamente pelo score, respeitando o número de vagas.
export async function classifyAdmissionExam(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const admissionExamId = String(req.params.admissionExamId)
    const exam = await prisma.eduAdmissionExam.findFirst({ where: { id: admissionExamId, clinicId, tenantId } })
    if (!exam) return res.status(404).json({ error: 'Processo seletivo não encontrado.' })

    const scored = await prisma.eduApplication.findMany({
      where: { admissionExamId, score: { not: null }, status: { notIn: ['DESISTENTE', 'MATRICULADO'] } },
      orderBy: { score: 'desc' }
    })

    const classifiedIds = scored.slice(0, exam.vacancies).map(app => app.id)
    const notClassifiedIds = scored.slice(exam.vacancies).map(app => app.id)

    await prisma.$transaction([
      prisma.eduApplication.updateMany({ where: { id: { in: classifiedIds } }, data: { status: 'CLASSIFICADO' } }),
      prisma.eduApplication.updateMany({ where: { id: { in: notClassifiedIds } }, data: { status: 'NAO_CLASSIFICADO' } })
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_ADMISSION_EXAM_CLASSIFY', entityType: 'EduAdmissionExam', entityId: admissionExamId, summary: `Classificação processada: ${classifiedIds.length} classificado(s), ${notClassifiedIds.length} não classificado(s).` })
    return res.json({ classified: classifiedIds.length, notClassified: notClassifiedIds.length })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao classificar processo seletivo.' })
  }
}

// ---------------------------------------------------------------
// EFETIVAÇÃO DA MATRÍCULA — fecha o funil de captação
// ---------------------------------------------------------------

export async function convertApplicationToEnrollment(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const application = await prisma.eduApplication.findFirst({ where: { id, clinicId, tenantId }, include: { admissionExam: { include: { program: true } } } })
    if (!application) return res.status(404).json({ error: 'Inscrição não encontrada.' })
    if (application.status !== 'CLASSIFICADO') return res.status(409).json({ error: 'Só é possível efetivar matrícula de candidatos classificados.' })

    const parsed = convertToEnrollmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const [curriculum, term] = await Promise.all([
      prisma.eduCurriculum.findFirst({ where: { id: parsed.data.curriculumId, clinicId, tenantId, programId: application.admissionExam.programId } }),
      prisma.eduTerm.findFirst({ where: { id: parsed.data.termId, clinicId, tenantId, programId: application.admissionExam.programId } })
    ])
    if (!curriculum) return res.status(400).json({ error: 'Matriz curricular inválida para o programa deste processo seletivo.' })
    if (!term) return res.status(400).json({ error: 'Período letivo inválido para o programa deste processo seletivo.' })

    let student = await prisma.eduStudent.findFirst({ where: { clinicId, tenantId, email: application.candidateEmail } })
    if (!student) {
      student = await prisma.eduStudent.create({
        data: { clinicId, tenantId, fullName: application.candidateName, email: application.candidateEmail, phone: application.candidatePhone, documentNumber: application.documentNumber }
      })
    }

    const duplicateEnrollment = await prisma.eduEnrollment.findFirst({ where: { studentId: student.id, programId: application.admissionExam.programId } })
    if (duplicateEnrollment) return res.status(409).json({ error: 'Aluno já matriculado neste programa.' })

    const sequence = (await prisma.eduEnrollment.count({ where: { clinicId } })) + 1
    const enrollmentNumber = `${application.admissionExam.program.code}-${term.name}-${String(sequence).padStart(5, '0')}`

    let enrollment = await prisma.eduEnrollment.create({
      data: {
        clinicId, tenantId, studentId: student.id, programId: application.admissionExam.programId, curriculumId: curriculum.id, termId: term.id,
        enrollmentNumber, monthlyFee: parsed.data.monthlyFee
      }
    })

    if (parsed.data.monthlyFee && parsed.data.monthlyFee > 0) {
      const bill = await prisma.recurringBill.create({
        data: {
          clinicId, tenantId, type: 'INCOME', description: `Mensalidade — ${application.admissionExam.program.name} — ${student.fullName}`,
          category: 'EDUMASTER_MENSALIDADE', personName: student.fullName, amount: parsed.data.monthlyFee,
          frequency: 'MONTHLY', dueDay: parsed.data.tuitionDueDay, startDate: new Date(), createdById: actorId
        }
      })
      enrollment = await prisma.eduEnrollment.update({ where: { id: enrollment.id }, data: { tuitionBillId: bill.id } })
    }

    await prisma.eduApplication.update({ where: { id }, data: { status: 'MATRICULADO', enrolledStudentId: student.id } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_APPLICATION_CONVERT_ENROLLMENT', entityType: 'EduApplication', entityId: id, summary: `${student.fullName} matriculado(a) a partir da inscrição ${id} (${enrollmentNumber}).` })
    return res.status(201).json({ student, enrollment })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao efetivar matrícula a partir da inscrição.' })
  }
}
