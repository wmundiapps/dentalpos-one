import { z } from 'zod'

export const admissionExamSchema = z.object({
  programId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(300),
  modality: z.enum(['PRESENCIAL', 'EAD']).default('PRESENCIAL'),
  examDate: z.string().datetime().optional(),
  applicationStart: z.string().datetime(),
  applicationEnd: z.string().datetime(),
  vacancies: z.number().int().min(1).max(100000).default(1)
}).strict()

export const applicationSchema = z.object({
  candidateName: z.string().trim().min(2).max(300),
  candidateEmail: z.string().trim().email().max(200),
  candidatePhone: z.string().trim().max(30).optional(),
  documentNumber: z.string().trim().max(30).optional()
}).strict()

export const scoreSchema = z.object({
  score: z.number().min(0).max(1000)
}).strict()

export const applicationStatusSchema = z.object({
  status: z.enum(['INSCRITO', 'CONFIRMADO', 'CLASSIFICADO', 'NAO_CLASSIFICADO', 'MATRICULADO', 'DESISTENTE'])
}).strict()

export const convertToEnrollmentSchema = z.object({
  curriculumId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  monthlyFee: z.number().min(0).max(1000000).optional(),
  tuitionDueDay: z.number().int().min(1).max(28).default(10)
}).strict()
