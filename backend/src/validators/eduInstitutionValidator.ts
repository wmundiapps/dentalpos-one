import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

export const institutionProfileSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  displayName: z.string().trim().max(200).optional(),
  logo: z.preprocess(emptyToUndefined, z.string().trim().url().max(2000)).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  cnpj: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(60).optional(),
  zipCode: z.string().trim().max(20).optional(),
  primaryColor: z.string().trim().max(20).optional(),
  site: z.preprocess(emptyToUndefined, z.string().trim().url().max(2000)).optional(),
  contactUrl: z.preprocess(emptyToUndefined, z.string().trim().url().max(2000)).optional(),
  ombudsmanEmail: z.preprocess(emptyToUndefined, z.string().trim().email().max(200)).optional(),
  ombudsmanPhone: z.string().trim().max(30).optional()
}).strict()

export const campusSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(['SEDE', 'POLO']).default('POLO'),
  addressStreet: z.string().trim().max(300).optional(),
  addressCity: z.string().trim().max(120).optional(),
  addressState: z.string().trim().max(60).optional(),
  addressZip: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.preprocess(emptyToUndefined, z.string().trim().email().max(200)).optional(),
  mapLat: z.number().min(-90).max(90).optional(),
  mapLng: z.number().min(-180).max(180).optional(),
  isActive: z.boolean().optional()
}).strict()
