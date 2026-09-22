import { z } from 'zod'

export const committeeSchema = z.object({
  type: z.enum(['CPA', 'CIPA', 'NDE', 'OUTRA']).default('OUTRA'),
  name: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).optional()
}).strict()

export const committeeMemberSchema = z.object({
  name: z.string().trim().min(2).max(200),
  role: z.string().trim().max(100).optional(),
  userId: z.string().trim().min(1).optional()
}).strict()

export const pdiGoalSchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  indicator: z.string().trim().max(300).optional(),
  targetValue: z.number().optional(),
  responsibleUserId: z.string().trim().max(100).optional(),
  dueDate: z.string().datetime().optional()
}).strict()

export const pdiGoalUpdateSchema = z.object({
  currentValue: z.number().optional(),
  status: z.enum(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ATRASADA']).optional()
}).strict()

export const pdiEvidenceSchema = z.object({
  title: z.string().trim().min(2).max(300),
  url: z.string().trim().url().max(2000).optional(),
  notes: z.string().trim().max(2000).optional()
}).strict()

export const regulatoryWatchSchema = z.object({
  source: z.enum(['DIARIO_OFICIAL_UNIAO', 'DIARIO_OFICIAL_ESTADO', 'MEC', 'OUTRO']).default('OUTRO'),
  title: z.string().trim().min(2).max(300),
  publishedAt: z.string().datetime().optional(),
  sourceUrl: z.string().trim().url().max(2000).optional(),
  rawExcerpt: z.string().trim().max(20000).optional(),
  responsibleUserId: z.string().trim().max(100).optional()
}).strict()

export const regulatoryWatchStatusSchema = z.object({
  status: z.enum(['NOVO', 'EM_ANALISE', 'TRATADO', 'DESCARTADO'])
}).strict()
