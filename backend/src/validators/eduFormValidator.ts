import { z } from 'zod'

const fieldDefSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/, 'Use minúsculas, números e "_", começando com letra.'),
  label: z.string().trim().min(1).max(200),
  type: z.enum(['TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(50).default([])
}).strict()

export const formTemplateSchema = z.object({
  name: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).optional(),
  department: z.string().trim().min(2).max(100).default('GERAL'),
  fields: z.array(fieldDefSchema).min(1).max(50),
  workflowSteps: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  isActive: z.boolean().optional()
}).strict()

export const formSubmissionSchema = z.object({
  data: z.record(z.union([z.string().max(20000), z.number(), z.boolean(), z.null()])),
  submitterName: z.string().trim().max(300).optional()
}).strict()

export const formReviewSchema = z.object({
  status: z.enum(['EM_ANALISE', 'APROVADO', 'REJEITADO']),
  reviewNotes: z.string().trim().max(4000).optional()
}).strict()

export const formAdvanceSchema = z.object({
  notes: z.string().trim().max(2000).optional()
}).strict()
