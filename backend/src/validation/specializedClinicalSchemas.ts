import { z } from 'zod'

export const specialtySchema = z.enum([
  'ORTHODONTICS',
  'FUNCTIONAL_ORTHOPEDICS',
  'TMD_OROFACIAL_PAIN',
])

export const specializedRecordStatusSchema = z.enum([
  'ACTIVE',
  'RETENTION',
  'COMPLETED',
  'ABANDONED',
  'DISCHARGED',
])

const shortText = z.string().trim().max(500).optional().nullable()
const longText = z.string().trim().max(10000).optional().nullable()
const stringList = z.array(z.string().trim().min(1).max(300)).max(100).default([])

export const orthodonticsDataSchema = z.object({
  angleClassification: shortText,
  canineRelationship: shortText,
  overbiteMm: z.number().min(-30).max(30).optional().nullable(),
  overjetMm: z.number().min(-30).max(30).optional().nullable(),
  crossbite: longText,
  openBite: longText,
  midlineDeviation: shortText,
  crowding: longText,
  diastemas: longText,
  facialPattern: shortText,
  habits: stringList,
  appliance: longText,
  technique: shortText,
  prescription: longText,
  brackets: longText,
  tubes: longText,
  bands: longText,
  wires: longText,
  arches: longText,
  elastics: longText,
  accessories: longText,
  anchorage: longText,
  miniImplants: longText,
  cephalometricAnalysis: longText,
  retention: longText,
  completionNotes: longText,
  abandonmentReason: longText,
  dischargeNotes: longText,
}).strict()

export const functionalOrthopedicsDataSchema = z.object({
  functionalDiagnosis: longText,
  appliance: longText,
  indication: longText,
  usageProtocol: longText,
  activations: longText,
  evolution: longText,
  patientCooperation: z.enum(['POOR', 'PARTIAL', 'GOOD', 'EXCELLENT']).optional().nullable(),
}).strict()

export const tmdDataSchema = z.object({
  painLocations: stringList,
  side: z.enum(['RIGHT', 'LEFT', 'BILATERAL', 'CENTRAL', 'NOT_APPLICABLE']).optional().nullable(),
  duration: shortText,
  frequency: shortText,
  intensityDescription: shortText,
  painScale: z.number().int().min(0).max(10).optional().nullable(),
  aggravatingFactors: stringList,
  relievingFactors: stringList,
  openingLimitation: z.boolean().optional().nullable(),
  openingMm: z.number().min(0).max(100).optional().nullable(),
  deviation: shortText,
  deflection: shortText,
  clicking: longText,
  crepitation: longText,
  locking: longText,
  dislocation: longText,
  musclePalpation: longText,
  jointPalpation: longText,
  parafunctionalHabits: stringList,
  bruxism: longText,
  clenching: longText,
  sleep: longText,
  associatedHeadache: longText,
  occlusalSplint: longText,
  medication: longText,
  physiotherapy: longText,
  speechTherapy: longText,
  referrals: longText,
  followUp: longText,
  evolution: longText,
}).strict()

export const createSpecializedRecordSchema = z.discriminatedUnion('specialty', [
  z.object({ specialty: z.literal('ORTHODONTICS'), clinicalData: orthodonticsDataSchema }),
  z.object({ specialty: z.literal('FUNCTIONAL_ORTHOPEDICS'), clinicalData: functionalOrthopedicsDataSchema }),
  z.object({ specialty: z.literal('TMD_OROFACIAL_PAIN'), clinicalData: tmdDataSchema }),
]).and(z.object({
  status: specializedRecordStatusSchema.default('ACTIVE'),
  chiefComplaint: longText,
  diagnosis: longText,
  diagnosticHypothesis: longText,
  treatmentPlan: longText,
  responsibleId: z.string().trim().max(100).optional().nullable(),
  responsibleName: z.string().trim().max(200).optional().nullable(),
  startedAt: z.coerce.date().optional(),
}))

export const updateSpecializedRecordSchema = z.object({
  status: specializedRecordStatusSchema.optional(),
  chiefComplaint: longText,
  diagnosis: longText,
  diagnosticHypothesis: longText,
  treatmentPlan: longText,
  responsibleId: z.string().trim().max(100).optional().nullable(),
  responsibleName: z.string().trim().max(200).optional().nullable(),
  clinicalData: z.record(z.unknown()).optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional().nullable(),
}).strict()

export const createSpecializedEvolutionSchema = z.object({
  evolutionType: z.enum([
    'ACTIVATION', 'MONTHLY_FOLLOW_UP', 'INCIDENT', 'RETENTION',
    'FUNCTIONAL_FOLLOW_UP', 'PAIN_FOLLOW_UP', 'FINALIZATION', 'OTHER',
  ]),
  professionalId: z.string().trim().max(100).optional().nullable(),
  professionalName: z.string().trim().min(2).max(200),
  summary: z.string().trim().min(2).max(10000),
  occurredAt: z.coerce.date().optional(),
  clinicalData: z.object({
    activation: longText,
    applianceAdjustment: longText,
    wire: longText,
    arch: longText,
    elastics: longText,
    accessories: longText,
    anchorage: longText,
    miniImplants: longText,
    incidents: longText,
    cooperation: shortText,
    painScale: z.number().int().min(0).max(10).optional().nullable(),
    openingMm: z.number().min(0).max(100).optional().nullable(),
    jointSounds: longText,
    musclePalpation: longText,
    jointPalpation: longText,
    medications: longText,
    therapies: longText,
    referrals: longText,
    nextSteps: longText,
  }).strict(),
}).strict()

export const attachmentCategorySchema = z.enum([
  'CEPHALOMETRY', 'PHOTOGRAPH', 'MODEL', 'RADIOGRAPH', 'SCAN', 'DICOM', 'OTHER',
])

export const createSpecializedAttachmentSchema = z.object({
  category: attachmentCategorySchema,
  clinicalFileId: z.string().trim().max(200).optional().nullable(),
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().max(200).optional().nullable(),
  storageKey: z.string().trim().max(2000).optional().nullable(),
  capturedAt: z.coerce.date().optional().nullable(),
  notes: longText,
  metadata: z.record(z.unknown()).default({}),
}).strict().refine(
  (value) => Boolean(value.clinicalFileId || value.storageKey),
  { message: 'Informe clinicalFileId ou storageKey do arquivo clínico definitivo.' },
)

export function parseSpecializedClinicalData(specialty: z.infer<typeof specialtySchema>, data: unknown) {
  if (specialty === 'ORTHODONTICS') return orthodonticsDataSchema.parse(data)
  if (specialty === 'FUNCTIONAL_ORTHOPEDICS') return functionalOrthopedicsDataSchema.parse(data)
  return tmdDataSchema.parse(data)
}

export type CreateSpecializedRecordInput = z.infer<typeof createSpecializedRecordSchema>
export type UpdateSpecializedRecordInput = z.infer<typeof updateSpecializedRecordSchema>
export type CreateSpecializedEvolutionInput = z.infer<typeof createSpecializedEvolutionSchema>
export type CreateSpecializedAttachmentInput = z.infer<typeof createSpecializedAttachmentSchema>
