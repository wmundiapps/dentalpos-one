import { z } from 'zod'

export const walletRechargeSchema = z.object({
  amount: z.number().min(0.01).max(1000000),
  notes: z.string().trim().max(500).optional()
}).strict()

export const walletAdjustSchema = z.object({
  amount: z.number().refine(v => v !== 0, 'Valor não pode ser zero.'),
  notes: z.string().trim().min(2).max(500)
}).strict()
