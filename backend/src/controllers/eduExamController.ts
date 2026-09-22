import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { runAiTask } from '../services/aiService'
import {
  examQuestionSchema,
  examSchema,
  generateQuestionsSchema,
  manualGradeSchema,
  questionSchema,
  submitAttemptSchema
} from '../validators/eduExamValidator'

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
// BANCO DE QUESTÕES
// ---------------------------------------------------------------

export async function listQuestions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined
    const rows = await prisma.eduQuestion.findMany({
      where: { clinicId, tenantId, isActive: true, ...(subjectId ? { subjectId } : {}) },
      include: { options: true, subject: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar questões.' })
  }
}

export async function createQuestion(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = questionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da questão inválidos.', details: parsed.error.flatten() })

    if (parsed.data.subjectId) {
      const subject = await prisma.eduSubject.findFirst({ where: { id: parsed.data.subjectId, clinicId, tenantId } })
      if (!subject) return res.status(400).json({ error: 'Disciplina inválida.' })
    }

    const { options, ...data } = parsed.data
    const row = await prisma.eduQuestion.create({
      data: { clinicId, tenantId, createdById: actorId, ...data, options: { create: options.map((option, index) => ({ ...option, order: index })) } },
      include: { options: true }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_QUESTION_CREATE', entityType: 'EduQuestion', entityId: row.id, summary: 'Questão cadastrada manualmente.' })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar questão.' })
  }
}

// Geração automática de questões via IA (franquia/creditos do services/aiService.ts).
export async function generateQuestions(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = generateQuestionsSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.subjectId) {
      const subject = await prisma.eduSubject.findFirst({ where: { id: parsed.data.subjectId, clinicId, tenantId } })
      if (!subject) return res.status(400).json({ error: 'Disciplina inválida.' })
    }

    const optionsPerQuestion = parsed.data.type === 'VERDADEIRO_FALSO' ? 2 : 4
    const system = 'Você é um elaborador de provas de ensino superior brasileiro. Responda SOMENTE com JSON válido, sem markdown, no formato {"questions":[{"statement":"...","options":[{"text":"...","isCorrect":true|false}]}]}. Cada questão deve ter exatamente ' + optionsPerQuestion + ' alternativas com exatamente uma correta.'
    const prompt = `Gere ${parsed.data.quantity} questões do tipo ${parsed.data.type}, dificuldade ${parsed.data.difficulty}, sobre o tema: ${parsed.data.topic}.`

    const ai = await runAiTask({
      clinicId, tenantId, actorId, task: 'EDU_GERACAO_QUESTOES', system, prompt,
      maxTokens: 3000, referenceType: 'EduQuestionGeneration', referenceId: parsed.data.subjectId
    })
    if (!ai.ok) return res.status(422).json({ error: 'Não foi possível gerar as questões com IA.', reason: ai.reason })

    let parsedAi: any
    try {
      parsedAi = JSON.parse(ai.text || '{}')
    } catch {
      return res.status(502).json({ error: 'A IA devolveu um formato inválido. Tente novamente.' })
    }
    const generated = Array.isArray(parsedAi?.questions) ? parsedAi.questions : []
    if (!generated.length) return res.status(502).json({ error: 'A IA não devolveu questões.' })

    const rows = await prisma.$transaction(
      generated.slice(0, parsed.data.quantity).map((question: any) => prisma.eduQuestion.create({
        data: {
          clinicId, tenantId, createdById: actorId, subjectId: parsed.data.subjectId,
          type: parsed.data.type, difficulty: parsed.data.difficulty, statement: String(question.statement || '').slice(0, 5000),
          options: {
            create: (Array.isArray(question.options) ? question.options : []).slice(0, 10).map((option: any, index: number) => ({
              text: String(option?.text || '').slice(0, 2000), isCorrect: Boolean(option?.isCorrect), order: index
            }))
          }
        },
        include: { options: true }
      }))
    )
    await audit({ clinicId, tenantId, actorId, action: 'EDU_QUESTION_AI_GENERATE', entityType: 'EduQuestion', entityId: rows[0]?.id || 'batch', summary: `${rows.length} questão(ões) geradas por IA sobre "${parsed.data.topic}".` })
    return res.status(201).json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao gerar questões com IA.' })
  }
}

// ---------------------------------------------------------------
// PROVAS
// ---------------------------------------------------------------

export async function listExams(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
    const rows = await prisma.eduExam.findMany({
      where: { clinicId, tenantId, ...(classId ? { classId } : {}) },
      include: { _count: { select: { examQuestions: true, attempts: true } } },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar provas.' })
  }
}

export async function createExam(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = examSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados da prova inválidos.', details: parsed.error.flatten() })

    if (parsed.data.classId) {
      const eduClass = await prisma.eduClass.findFirst({ where: { id: parsed.data.classId, clinicId, tenantId } })
      if (!eduClass) return res.status(400).json({ error: 'Turma inválida.' })
    }

    const row = await prisma.eduExam.create({
      data: {
        clinicId, tenantId, createdById: actorId, ...parsed.data,
        startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
        endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined
      }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_CREATE', entityType: 'EduExam', entityId: row.id, summary: `Prova ${row.title} criada.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar prova.' })
  }
}

export async function addExamQuestion(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const examId = String(req.params.examId)
    const exam = await prisma.eduExam.findFirst({ where: { id: examId, clinicId, tenantId } })
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' })
    if (exam.status !== 'RASCUNHO') return res.status(409).json({ error: 'Só é possível editar questões de provas em rascunho.' })

    const parsed = examQuestionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const question = await prisma.eduQuestion.findFirst({ where: { id: parsed.data.questionId, clinicId, tenantId } })
    if (!question) return res.status(400).json({ error: 'Questão inválida.' })

    const order = await prisma.eduExamQuestion.count({ where: { examId } })
    const row = await prisma.eduExamQuestion.create({ data: { examId, questionId: parsed.data.questionId, points: parsed.data.points, order } })

    const totalPoints = await prisma.eduExamQuestion.aggregate({ where: { examId }, _sum: { points: true } })
    await prisma.eduExam.update({ where: { id: examId }, data: { totalPoints: totalPoints._sum.points || 0 } })

    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_QUESTION_ADD', entityType: 'EduExam', entityId: examId, summary: `Questão incluída na prova ${exam.title}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao incluir questão na prova.' })
  }
}

export async function publishExam(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const examId = String(req.params.examId)
    const exam = await prisma.eduExam.findFirst({ where: { id: examId, clinicId, tenantId }, include: { _count: { select: { examQuestions: true } } } })
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' })
    if (exam._count.examQuestions === 0) return res.status(400).json({ error: 'Adicione ao menos uma questão antes de publicar.' })

    const row = await prisma.eduExam.update({ where: { id: examId }, data: { status: 'PUBLICADA' } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_PUBLISH', entityType: 'EduExam', entityId: examId, summary: `Prova ${exam.title} publicada.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao publicar prova.' })
  }
}

// ---------------------------------------------------------------
// CORREÇÃO (dissertativas por IA + override manual)
// ---------------------------------------------------------------

async function recomputeAttemptTotal(attemptId: string) {
  const attempt = await prisma.eduExamAttempt.findFirstOrThrow({ where: { id: attemptId }, include: { answers: { include: { examQuestion: { include: { question: true } } } } } })
  const objectivePoints = attempt.answers
    .filter(answer => answer.examQuestion.question.type !== 'DISSERTATIVA')
    .reduce((sum, answer) => sum + (answer.pointsEarned || 0), 0)

  const essayAnswers = attempt.answers.filter(answer => answer.examQuestion.question.type === 'DISSERTATIVA')
  const pendingEssay = essayAnswers.some(answer => answer.manualScore == null && answer.aiScore == null)
  const essayPoints = essayAnswers.reduce((sum, answer) => sum + (answer.manualScore ?? answer.aiScore ?? 0), 0)

  const status = pendingEssay ? 'ENVIADA' : 'CORRIGIDA'
  await prisma.eduExamAttempt.update({
    where: { id: attemptId },
    data: {
      objectiveScore: objectivePoints,
      essayScore: pendingEssay ? null : essayPoints,
      totalScore: pendingEssay ? null : objectivePoints + essayPoints,
      status
    }
  })
}

export async function gradeEssayWithAI(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const answerId = String(req.params.answerId)
    const answer = await prisma.eduExamAnswer.findFirst({
      where: { id: answerId, attempt: { exam: { clinicId, tenantId } } },
      include: { examQuestion: { include: { question: true } }, attempt: true }
    })
    if (!answer) return res.status(404).json({ error: 'Resposta não encontrada.' })
    if (answer.examQuestion.question.type !== 'DISSERTATIVA') return res.status(400).json({ error: 'Esta resposta não é de questão dissertativa.' })
    if (!answer.essayText?.trim()) return res.status(400).json({ error: 'Resposta do aluno está vazia.' })

    const system = 'Você é um corretor de provas dissertativas de ensino superior brasileiro. Responda SOMENTE com JSON válido no formato {"score": <numero de 0 a nota_maxima>, "feedback": "..."}. Seja objetivo e justo, seguindo a rubrica fornecida.'
    const prompt = `Enunciado: ${answer.examQuestion.question.statement}\nRubrica de correção: ${answer.examQuestion.question.rubric || 'Não informada — use critérios gerais de clareza, correção técnica e completude.'}\nNota máxima: ${answer.examQuestion.points}\nResposta do aluno: ${answer.essayText}`

    const ai = await runAiTask({
      clinicId, tenantId, actorId, task: 'EDU_CORRECAO_DISSERTATIVA', system, prompt,
      maxTokens: 1200, referenceType: 'EduExamAnswer', referenceId: answer.id
    })
    if (!ai.ok) return res.status(422).json({ error: 'Não foi possível corrigir com IA.', reason: ai.reason })

    let parsedAi: any
    try {
      parsedAi = JSON.parse(ai.text || '{}')
    } catch {
      return res.status(502).json({ error: 'A IA devolveu um formato inválido. Corrija manualmente.' })
    }
    const score = Math.max(0, Math.min(Number(parsedAi?.score ?? 0), answer.examQuestion.points))
    const feedback = String(parsedAi?.feedback || '').slice(0, 4000)

    const row = await prisma.eduExamAnswer.update({ where: { id: answerId }, data: { aiScore: score, aiFeedback: feedback } })
    await recomputeAttemptTotal(answer.attemptId)

    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_ANSWER_AI_GRADE', entityType: 'EduExamAnswer', entityId: answerId, summary: `Correção por IA: ${score}/${answer.examQuestion.points}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao corrigir dissertativa com IA.' })
  }
}

export async function gradeEssayManually(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const answerId = String(req.params.answerId)
    const answer = await prisma.eduExamAnswer.findFirst({
      where: { id: answerId, attempt: { exam: { clinicId, tenantId } } },
      include: { examQuestion: true }
    })
    if (!answer) return res.status(404).json({ error: 'Resposta não encontrada.' })

    const parsed = manualGradeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })
    if (parsed.data.manualScore > answer.examQuestion.points) {
      return res.status(400).json({ error: `Nota não pode ultrapassar o valor da questão (${answer.examQuestion.points}).` })
    }

    const row = await prisma.eduExamAnswer.update({
      where: { id: answerId },
      data: { manualScore: parsed.data.manualScore, manualFeedback: parsed.data.manualFeedback, gradedById: actorId, gradedAt: new Date() }
    })
    await recomputeAttemptTotal(answer.attemptId)

    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_ANSWER_MANUAL_GRADE', entityType: 'EduExamAnswer', entityId: answerId, summary: `Correção manual: ${parsed.data.manualScore}/${answer.examQuestion.points}.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao lançar correção manual.' })
  }
}

export async function listExamAttempts(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const examId = String(req.params.examId)
    const exam = await prisma.eduExam.findFirst({ where: { id: examId, clinicId, tenantId } })
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' })

    const rows = await prisma.eduExamAttempt.findMany({
      where: { examId },
      include: { student: true, answers: { include: { examQuestion: { include: { question: true } } } } },
      orderBy: { startedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar tentativas da prova.' })
  }
}

// ---------------------------------------------------------------
// PORTAL DO ALUNO — realização da prova
// ---------------------------------------------------------------

export async function myAvailableExams(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const classIds = (await prisma.eduClassEnrollment.findMany({ where: { studentId: student.id }, select: { classId: true } })).map(row => row.classId)
    const now = new Date()
    const rows = await prisma.eduExam.findMany({
      where: {
        clinicId, tenantId, status: 'PUBLICADA', classId: { in: classIds },
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }]
      },
      include: { attempts: { where: { studentId: student.id } } },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows.map(row => ({ ...row, myAttemptStatus: row.attempts[0]?.status ?? null })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar provas disponíveis.' })
  }
}

export async function startAttempt(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const examId = String(req.params.examId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const exam = await prisma.eduExam.findFirst({ where: { id: examId, clinicId, tenantId, status: 'PUBLICADA' } })
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada ou não publicada.' })

    if (exam.classId) {
      const enrolled = await prisma.eduClassEnrollment.findFirst({ where: { classId: exam.classId, studentId: student.id } })
      if (!enrolled) return res.status(403).json({ error: 'Aluno não está matriculado na turma desta prova.' })
    }

    const existing = await prisma.eduExamAttempt.findFirst({ where: { examId, studentId: student.id } })
    if (existing) return res.json(existing)

    const row = await prisma.eduExamAttempt.create({ data: { examId, studentId: student.id } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_ATTEMPT_START', entityType: 'EduExamAttempt', entityId: row.id, summary: `${student.fullName} iniciou a prova ${exam.title}.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao iniciar tentativa da prova.' })
  }
}

export async function submitAttempt(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const attemptId = String(req.params.attemptId)
    const student = await myStudent(req)
    if (!student) return res.status(403).json({ error: 'Usuário não está vinculado a um cadastro de aluno.' })

    const attempt = await prisma.eduExamAttempt.findFirst({ where: { id: attemptId, studentId: student.id }, include: { exam: true } })
    if (!attempt) return res.status(404).json({ error: 'Tentativa não encontrada.' })
    if (attempt.status !== 'EM_ANDAMENTO') return res.status(409).json({ error: 'Esta tentativa já foi enviada.' })

    const parsed = submitAttemptSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const examQuestions = await prisma.eduExamQuestion.findMany({ where: { examId: attempt.examId }, include: { question: { include: { options: true } } } })
    const byId = new Map(examQuestions.map(examQuestion => [examQuestion.id, examQuestion]))

    const writes = parsed.data.answers.map(answer => {
      const examQuestion = byId.get(answer.examQuestionId)
      if (!examQuestion) throw new Error('QUESTION_NOT_IN_EXAM')

      if (examQuestion.question.type === 'DISSERTATIVA') {
        return prisma.eduExamAnswer.upsert({
          where: { attemptId_examQuestionId: { attemptId, examQuestionId: answer.examQuestionId } },
          create: { attemptId, examQuestionId: answer.examQuestionId, essayText: answer.essayText },
          update: { essayText: answer.essayText }
        })
      }

      const correctIds = examQuestion.question.options.filter(option => option.isCorrect).map(option => option.id).sort()
      const selected = [...answer.selectedOptionIds].sort()
      const isCorrect = correctIds.length > 0 && correctIds.length === selected.length && correctIds.every((id, index) => id === selected[index])
      return prisma.eduExamAnswer.upsert({
        where: { attemptId_examQuestionId: { attemptId, examQuestionId: answer.examQuestionId } },
        create: { attemptId, examQuestionId: answer.examQuestionId, selectedOptionIds: answer.selectedOptionIds, isCorrect, pointsEarned: isCorrect ? examQuestion.points : 0 },
        update: { selectedOptionIds: answer.selectedOptionIds, isCorrect, pointsEarned: isCorrect ? examQuestion.points : 0 }
      })
    })

    await prisma.$transaction(writes)
    await prisma.eduExamAttempt.update({ where: { id: attemptId }, data: { submittedAt: new Date() } })
    await recomputeAttemptTotal(attemptId)

    const row = await prisma.eduExamAttempt.findFirst({ where: { id: attemptId }, include: { answers: true } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_EXAM_ATTEMPT_SUBMIT', entityType: 'EduExamAttempt', entityId: attemptId, summary: `${student.fullName} enviou a prova ${attempt.exam.title}.` })
    return res.json(row)
  } catch (error: any) {
    if (error?.message === 'QUESTION_NOT_IN_EXAM') return res.status(400).json({ error: 'Há respostas para questões que não pertencem a esta prova.' })
    console.error(error)
    return res.status(500).json({ error: 'Erro ao enviar prova.' })
  }
}

export async function myResults(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const rows = await prisma.eduExamAttempt.findMany({
      where: { studentId: student.id },
      include: { exam: true },
      orderBy: { startedAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar resultados das provas.' })
  }
}
