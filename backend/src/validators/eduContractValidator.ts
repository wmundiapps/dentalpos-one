import { z } from 'zod'

export const contractCancelSchema = z.object({
  notes: z.string().trim().max(2000).optional()
}).strict()

export const contractSignSchema = z.object({
  signedByName: z.string().trim().min(2).max(300)
}).strict()
