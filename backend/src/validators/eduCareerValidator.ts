import { z } from 'zod'

export const jobPostingSchema = z.object({
  title: z.string().trim().min(2).max(200),
  company: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(8000),
  type: z.enum(['ESTAGIO', 'EMPREGO', 'TRAINEE']).default('ESTAGIO'),
  modality: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO']).default('PRESENCIAL'),
  location: z.string().trim().max(300).optional(),
  applicationUrl: z.string().trim().url().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().optional()
}).strict()

export const jobApplicationSchema = z.object({
  message: z.string().trim().max(4000).optional()
}).strict()

export const jobApplicationDecisionSchema = z.object({
  status: z.enum(['EM_ANALISE', 'APROVADA', 'REJEITADA'])
}).strict()
