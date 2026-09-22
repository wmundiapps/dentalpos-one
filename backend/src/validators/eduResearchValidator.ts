import { z } from 'zod'

export const fundingAgencySchema = z.object({
  name: z.string().trim().min(2).max(300),
  website: z.string().trim().url().max(500).optional(),
  notes: z.string().trim().max(2000).optional()
}).strict()

export const fundingCallSchema = z.object({
  agencyId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  requirements: z.string().trim().max(4000).optional(),
  applicationDeadline: z.string().datetime(),
  resultDate: z.string().datetime().optional(),
  sourceUrl: z.string().trim().url().max(2000).optional()
}).strict()

export const researchProjectSchema = z.object({
  type: z.enum(['PESQUISA', 'EXTENSAO']).default('PESQUISA'),
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(4000).optional(),
  coordinatorName: z.string().trim().min(2).max(300),
  programId: z.string().trim().min(1).optional(),
  fundingAgencyId: z.string().trim().min(1).optional(),
  fundingCallId: z.string().trim().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budgetAmount: z.number().min(0).max(100000000).optional()
}).strict()

export const researchProjectStatusSchema = z.object({
  status: z.enum(['PROPOSTA', 'EM_ANALISE', 'APROVADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO'])
}).strict()

export const researchProjectMemberSchema = z.object({
  name: z.string().trim().min(2).max(300),
  role: z.string().trim().max(100).optional(),
  studentId: z.string().trim().min(1).optional()
}).strict()
