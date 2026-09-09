import type { z } from 'zod'
import {
  attachmentCategorySchema,
  createSpecializedAttachmentSchema,
  createSpecializedEvolutionSchema,
  createSpecializedRecordSchema,
  functionalOrthopedicsDataSchema,
  orthodonticsDataSchema,
  specialtySchema,
  specializedRecordStatusSchema,
  tmdDataSchema,
  updateSpecializedRecordSchema,
} from '../validation/specializedClinicalSchemas'

export type SpecializedClinicalSpecialty = z.infer<typeof specialtySchema>
export type SpecializedClinicalRecordStatus = z.infer<typeof specializedRecordStatusSchema>
export type SpecializedAttachmentCategory = z.infer<typeof attachmentCategorySchema>
export type OrthodonticsClinicalData = z.infer<typeof orthodonticsDataSchema>
export type FunctionalOrthopedicsClinicalData = z.infer<typeof functionalOrthopedicsDataSchema>
export type TmdOrofacialPainClinicalData = z.infer<typeof tmdDataSchema>
export type CreateSpecializedClinicalRecordInput = z.infer<typeof createSpecializedRecordSchema>
export type UpdateSpecializedClinicalRecordInput = z.infer<typeof updateSpecializedRecordSchema>
export type CreateSpecializedClinicalEvolutionInput = z.infer<typeof createSpecializedEvolutionSchema>
export type CreateSpecializedClinicalAttachmentInput = z.infer<typeof createSpecializedAttachmentSchema>
