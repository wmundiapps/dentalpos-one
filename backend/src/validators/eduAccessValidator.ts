import { z } from 'zod'

export const activateStudentAccessSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
  sendEmail: z.boolean().default(true)
}).strict()
