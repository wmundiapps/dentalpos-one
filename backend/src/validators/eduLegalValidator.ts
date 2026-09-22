import { z } from 'zod'

export const legalCaseSchema = z.object({
  type: z.enum(['CONCILIACAO', 'ADMINISTRATIVO', 'TRABALHISTA', 'CONSUMIDOR', 'MEC', 'OUTRO']).default('ADMINISTRATIVO'),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  involvedName: z.string().trim().min(2).max(300),
  studentId: z.string().trim().min(1).optional(),
  responsibleUserId: z.string().trim().max(100).optional()
}).strict()

export const legalCaseStatusSchema = z.object({
  status: z.enum(['ABERTO', 'EM_CONCILIACAO', 'AUDIENCIA_MARCADA', 'RESOLVIDO', 'ENCAMINHADO_EXTERNO', 'ARQUIVADO']),
  notes: z.string().trim().max(4000).optional()
}).strict()

export const legalHearingSchema = z.object({
  scheduledAt: z.string().datetime(),
  location: z.string().trim().max(300).optional(),
  mediatorName: z.string().trim().max(200).optional()
}).strict()

export const legalHearingOutcomeSchema = z.object({
  status: z.enum(['REALIZADA', 'CANCELADA']),
  outcome: z.enum(['ACORDO', 'SEM_ACORDO', 'REMARCADA']).optional(),
  notes: z.string().trim().max(4000).optional()
}).strict()

export const legalDocumentSchema = z.object({
  title: z.string().trim().min(2).max(300),
  url: z.string().trim().url().max(2000)
}).strict()

export const legalDeadlineSchema = z.object({
  title: z.string().trim().min(2).max(300),
  expiresAt: z.string().datetime(),
  preparationDays: z.number().int().min(0).max(365).default(0),
  safetyMarginDays: z.number().int().min(0).max(90).default(0),
  responsibleUserId: z.string().trim().max(100).optional()
}).strict()
