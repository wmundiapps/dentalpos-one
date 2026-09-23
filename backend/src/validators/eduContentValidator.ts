import { z } from 'zod'

export const contentItemSchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  classId: z.string().trim().min(1).optional(),
  type: z.enum(['VIDEO', 'PDF', 'RESUMO', 'MATERIAL_COMPLEMENTAR', 'APOSTILA']).default('PDF'),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  url: z.string().trim().url().max(2000),
  durationMinutes: z.number().int().min(1).max(1000).optional(),
  order: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().optional(),
  sourceText: z.string().trim().max(40000).optional()
}).strict()

export const contentProgressSchema = z.object({
  status: z.enum(['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO']),
  progressPercent: z.number().int().min(0).max(100),
  lastPositionSeconds: z.number().int().min(0).optional()
}).strict()

export const flashcardDeckSchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional()
}).strict()

export const flashcardSchema = z.object({
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(2000),
  order: z.number().int().min(0).max(10000).default(0)
}).strict()

export const flashcardReviewSchema = z.object({
  quality: z.number().int().min(0).max(5)
}).strict()

export const forumSchema = z.object({
  classId: z.string().trim().min(1).optional(),
  subjectId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional()
}).strict()

export const forumTopicSchema = z.object({
  title: z.string().trim().min(2).max(300),
  body: z.string().trim().min(1).max(20000)
}).strict()

export const forumReplySchema = z.object({
  body: z.string().trim().min(1).max(20000)
}).strict()

export const librarySubscriptionSchema = z.object({
  studentId: z.string().trim().min(1).optional(),
  scope: z.enum(['INSTITUCIONAL', 'INDIVIDUAL']).default('INSTITUCIONAL'),
  provider: z.string().trim().min(2).max(200),
  plan: z.string().trim().min(2).max(200),
  amount: z.number().min(0).max(1000000).default(0),
  endDate: z.string().datetime().optional()
}).strict().superRefine((data, ctx) => {
  if (data.scope === 'INDIVIDUAL' && !data.studentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Assinatura individual exige studentId.', path: ['studentId'] })
  }
})
