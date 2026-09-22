import { z } from 'zod'

const optionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean().default(false)
}).strict()

export const questionSchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  type: z.enum(['OBJETIVA_UNICA', 'OBJETIVA_MULTIPLA', 'VERDADEIRO_FALSO', 'DISSERTATIVA']).default('OBJETIVA_UNICA'),
  statement: z.string().trim().min(3).max(5000),
  difficulty: z.enum(['FACIL', 'MEDIA', 'DIFICIL']).default('MEDIA'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  rubric: z.string().trim().max(4000).optional(),
  options: z.array(optionSchema).max(10).default([]),
  isActive: z.boolean().optional()
}).strict().superRefine((data, ctx) => {
  if (data.type !== 'DISSERTATIVA') {
    if (data.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Questões objetivas precisam de ao menos 2 alternativas.', path: ['options'] })
    }
    const correctCount = data.options.filter(option => option.isCorrect).length
    if (correctCount === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Marque ao menos uma alternativa correta.', path: ['options'] })
    }
    if (data.type === 'OBJETIVA_UNICA' && correctCount > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Questão de alternativa única só pode ter 1 opção correta.', path: ['options'] })
    }
  }
})

export const generateQuestionsSchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  topic: z.string().trim().min(3).max(500),
  type: z.enum(['OBJETIVA_UNICA', 'OBJETIVA_MULTIPLA', 'VERDADEIRO_FALSO']).default('OBJETIVA_UNICA'),
  difficulty: z.enum(['FACIL', 'MEDIA', 'DIFICIL']).default('MEDIA'),
  quantity: z.number().int().min(1).max(20).default(5)
}).strict()

export const examSchema = z.object({
  classId: z.string().trim().min(1).optional(),
  programId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(3).max(300),
  instructions: z.string().trim().max(5000).optional(),
  type: z.enum(['AVALIACAO', 'SIMULADO', 'RECUPERACAO', 'ENADE_SIMULADO']).default('AVALIACAO'),
  durationMinutes: z.number().int().min(5).max(600).default(60),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional()
}).strict()

export const examQuestionSchema = z.object({
  questionId: z.string().trim().min(1),
  points: z.number().min(0.1).max(1000).default(1)
}).strict()

export const submitAnswerSchema = z.object({
  examQuestionId: z.string().trim().min(1),
  selectedOptionIds: z.array(z.string().trim().min(1)).max(10).default([]),
  essayText: z.string().trim().max(20000).optional()
}).strict()

export const submitAttemptSchema = z.object({
  answers: z.array(submitAnswerSchema).min(1).max(300)
}).strict()

export const manualGradeSchema = z.object({
  manualScore: z.number().min(0).max(1000),
  manualFeedback: z.string().trim().max(4000).optional()
}).strict()
