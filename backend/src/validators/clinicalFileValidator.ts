import { z } from 'zod'

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()

export const clinicalFileCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.string().trim().min(2).max(40).default('OTHER'),
  description: optionalText(300),
  isSystem: z.boolean().optional().default(false)
})

export const clinicalFileCreateSchema = z.object({
  categoryId: z.string().cuid().optional().nullable(),
  kind: z.enum([
    'PHOTO', 'RADIOGRAPH', 'PANORAMIC', 'PERIAPICAL', 'TOMOGRAPHY',
    'DICOM', 'LAB_EXAM', 'PDF', 'STL', 'PLY', 'OBJ', 'DOCUMENT', 'OTHER'
  ]),
  title: z.string().trim().min(2).max(160),
  originalName: z.string().trim().min(1).max(255),
  extension: z.string().trim().max(12).optional().default(''),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().nonnegative().max(2_000_000_000),
  examDate: z.string().datetime().optional().nullable(),
  origin: optionalText(160),
  requesterProfessionalId: optionalText(100),
  requesterProfessionalName: optionalText(160),
  description: optionalText(4000),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  tooth: z.string().trim().max(10).optional().nullable(),
  region: optionalText(100),
  treatmentItemId: optionalText(100),
  clinicalEvolutionId: optionalText(100),
  externalUrl: z.string().url().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
})

export const clinicalFileUpdateSchema = z.object({
  categoryId: z.string().cuid().optional().nullable(),
  title: z.string().trim().min(2).max(160).optional(),
  examDate: z.string().datetime().optional().nullable(),
  origin: optionalText(160),
  requesterProfessionalId: optionalText(100),
  requesterProfessionalName: optionalText(160),
  description: optionalText(4000),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  tooth: z.string().trim().max(10).optional().nullable(),
  region: optionalText(100),
  treatmentItemId: optionalText(100),
  clinicalEvolutionId: optionalText(100),
  metadata: z.record(z.unknown()).optional()
})

export const clinicalFileCompleteSchema = z.object({
  checksum: z.string().trim().max(200).optional().nullable(),
  metadata: z.record(z.unknown()).optional()
})
