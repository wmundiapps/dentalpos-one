import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { enrollmentStatusSchema, reinforcementActionSchema, reinforcementPlanSchema } from '../validators/eduPerformanceValidator'

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
// PAINEL DE DESEMPENHO (calculado on-demand, sem duplicar dados)
// ---------------------------------------------------------------

async function buildPerformance(studentId: string, clinicId: string, tenantId: string) {
  const [attendances, attempts, enrollments] = await Promise.all([
    prisma.eduAttendance.findMany({ where: { studentId, clinicId, tenantId } }),
    prisma.eduExamAttempt.findMany({ where: { studentId, status: 'CORRIGIDA' }, include: { exam: { include: { examQuestions: { include: { question: true } } } }, answers: { include: { examQuestion: { include: { question: true } } } } } }),
    prisma.eduEnrollment.findMany({ where: { studentId, clinicId, tenantId }, include: { program: true, term: true } })
  ])

  const attendancePercent = attendances.length ? Math.round((attendances.filter(a => a.present).length / attendances.length) * 1000) / 10 : null
  const examsAverage = attempts.length ? Math.round((attempts.reduce((sum, a) => sum + (a.totalScore || 0), 0) / attempts.length) * 100) / 100 : null

  const byCompetency = new Map<string, { earned: number; possible: number }>()
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const competency = answer.examQuestion.question.competency
      if (!competency) continue
      const bucket = byCompetency.get(competency) || { earned: 0, possible: 0 }
      bucket.earned += answer.pointsEarned ?? answer.manualScore ?? answer.aiScore ?? 0
      bucket.possible += answer.examQuestion.points
      byCompetency.set(competency, bucket)
    }
  }
  const competencyBreakdown = [...byCompetency.entries()].map(([competency, v]) => ({
    competency, percent: v.possible ? Math.round((v.earned / v.possible) * 1000) / 10 : null
  }))

  let riskLevel = 'BAIXO'
  const lowAttendance = attendancePercent !== null && attendancePercent < 75
  const lowExams = examsAverage !== null && examsAverage < 6
  if (lowAttendance && lowExams) riskLevel = 'ALTO'
  else if (lowAttendance || lowExams) riskLevel = 'MEDIO'

  return { attendancePercent, examsAverage, competencyBreakdown, riskLevel, enrollments, examAttemptsCount: attempts.length }
}

export async function studentPerformance(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = String(req.params.id)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const performance = await buildPerformance(studentId, clinicId, tenantId)
    return res.json({ student, ...performance })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao calcular desempenho do aluno.' })
  }
}

export async function myPerformance(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const performance = await buildPerformance(student.id, clinicId, tenantId)
    return res.json(performance)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao calcular desempenho.' })
  }
}

export async function classPerformanceSummary(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const classId = String(req.params.classId)
    const eduClass = await prisma.eduClass.findFirst({ where: { id: classId, clinicId, tenantId } })
    if (!eduClass) return res.status(404).json({ error: 'Turma não encontrada.' })

    const roster = await prisma.eduClassEnrollment.findMany({ where: { classId }, include: { student: true } })
    const rows = await Promise.all(roster.map(async entry => {
      const performance = await buildPerformance(entry.studentId, clinicId, tenantId)
      return { student: entry.student, attendancePercent: performance.attendancePercent, examsAverage: performance.examsAverage, riskLevel: performance.riskLevel }
    }))
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao calcular desempenho da turma.' })
  }
}

// ---------------------------------------------------------------
// PLANO DE REFORÇO
// ---------------------------------------------------------------

export async function listReinforcementPlans(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const rows = await prisma.eduReinforcementPlan.findMany({
      where: { clinicId, tenantId, ...(studentId ? { studentId } : {}) },
      include: { student: true, subject: true, actions: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar planos de reforço.' })
  }
}

export async function createReinforcementPlan(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = reinforcementPlanSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
    if (!student) return res.status(400).json({ error: 'Aluno inválido.' })

    const row = await prisma.eduReinforcementPlan.create({
      data: { clinicId, tenantId, createdById: actorId, ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REINFORCEMENT_PLAN_CREATE', entityType: 'EduReinforcementPlan', entityId: row.id, summary: `Plano de reforço "${row.title}" criado para ${student.fullName}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar plano de reforço.' })
  }
}

export async function addReinforcementAction(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const planId = String(req.params.planId)
    const plan = await prisma.eduReinforcementPlan.findFirst({ where: { id: planId, clinicId, tenantId } })
    if (!plan) return res.status(404).json({ error: 'Plano de reforço não encontrado.' })

    const parsed = reinforcementActionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduReinforcementAction.create({
      data: { planId, ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REINFORCEMENT_ACTION_CREATE', entityType: 'EduReinforcementAction', entityId: row.id, summary: `Ação incluída no plano "${plan.title}".` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar ação do plano de reforço.' })
  }
}

export async function completeReinforcementAction(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const actionId = String(req.params.actionId)
    const action = await prisma.eduReinforcementAction.findFirst({ where: { id: actionId, plan: { clinicId, tenantId } } })
    if (!action) return res.status(404).json({ error: 'Ação não encontrada.' })

    const row = await prisma.eduReinforcementAction.update({ where: { id: actionId }, data: { status: 'CONCLUIDA', completedAt: new Date() } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_REINFORCEMENT_ACTION_COMPLETE', entityType: 'EduReinforcementAction', entityId: actionId, summary: 'Ação de reforço concluída.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao concluir ação do plano de reforço.' })
  }
}

export async function myReinforcementPlans(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const rows = await prisma.eduReinforcementPlan.findMany({ where: { studentId: student.id }, include: { subject: true, actions: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar planos de reforço.' })
  }
}

// ---------------------------------------------------------------
// EGRESSOS — muda status da matrícula e sincroniza contato no REVAH
// (RevahContact é reaproveitado tal como está, sem alterações no model).
// ---------------------------------------------------------------

export async function updateEnrollmentStatus(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduEnrollment.findFirst({ where: { id, clinicId, tenantId }, include: { student: true, program: true } })
    if (!existing) return res.status(404).json({ error: 'Matrícula não encontrada.' })

    const parsed = enrollmentStatusSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduEnrollment.update({ where: { id }, data: { status: parsed.data.status } })

    if (parsed.data.status === 'CONCLUIDA') {
      const existingContact = existing.student.email
        ? await prisma.revahContact.findFirst({ where: { clinicId, tenantId, email: existing.student.email } })
        : null
      if (!existingContact) {
        await prisma.revahContact.create({
          data: {
            clinicId, tenantId, name: existing.student.fullName, email: existing.student.email, phone: existing.student.phone,
            tags: { source: 'EDU_ALUMNI', programId: existing.programId, programName: existing.program.name }
          }
        })
      }
    }

    await audit({ clinicId, tenantId, actorId, action: 'EDU_ENROLLMENT_STATUS_UPDATE', entityType: 'EduEnrollment', entityId: id, summary: `Matrícula de ${existing.student.fullName} atualizada para ${parsed.data.status}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar status da matrícula.' })
  }
}
