import { z } from 'zod'

export const reinforcementPlanSchema = z.object({
  studentId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1).optional(),
  competency: z.string().trim().max(200).optional(),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  dueDate: z.string().datetime().optional()
}).strict()

export const reinforcementActionSchema = z.object({
  description: z.string().trim().min(2).max(1000),
  dueDate: z.string().datetime().optional()
}).strict()

export const enrollmentStatusSchema = z.object({
  status: z.enum(['ATIVA', 'TRANCADA', 'CONCLUIDA', 'CANCELADA', 'TRANSFERIDA'])
}).strict()
