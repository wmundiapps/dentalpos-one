import { z } from 'zod'

const shortText = z.string().trim().max(500)
const longText = z.string().trim().max(20000)
const textList = z.array(z.string().trim().min(1).max(500)).max(100)

export const clinicalRecordDataSchema = z.object({
  mainComplaint: longText.default(''), currentDiseaseHistory: longText.default(''), dentalHistory: longText.default(''), medicalHistory: longText.default(''),
  systemicDiseases: textList.default([]), medications: textList.default([]), allergies: textList.default([]), previousSurgeries: textList.default([]), hospitalizations: textList.default([]),
  pregnancy: z.object({ applicable: z.boolean(), status: z.enum(['NO','YES','SUSPECTED','NOT_INFORMED']), weeks: z.number().int().min(1).max(45).optional() }),
  smoking: z.object({ status: z.enum(['NEVER','CURRENT','FORMER','NOT_INFORMED']), details: shortText.default('') }),
  alcohol: z.object({ status: z.enum(['NO','YES','FORMER','NOT_INFORMED']), details: shortText.default('') }),
  parafunctionalHabits: textList.default([]), relevantFamilyHistory: longText.default(''),
  vitalSigns: z.object({ systolic: z.number().int().min(40).max(300).optional(), diastolic: z.number().int().min(20).max(200).optional(), glucoseMgDl: z.number().min(20).max(1000).optional(), measuredAt: z.string().datetime().optional() }),
  riskConditions: textList.default([]), clinicalAlerts: textList.default([]), observations: longText.default(''), diagnosticHypothesis: longText.default(''), diagnosis: longText.default(''),
  extraoralExam: longText.default(''), intraoralExam: longText.default(''), softTissues: longText.default(''), tmj: longText.default(''), occlusion: longText.default(''),
  periodontalCondition: longText.default(''), generalDentalCondition: longText.default(''), initialClinicalPlan: longText.default(''),
  customFields: z.record(z.union([z.string().max(20000), z.number(), z.boolean(), z.array(z.string().max(500)).max(100), z.null()])).default({})
}).strict()

export const saveClinicalRecordSchema = z.object({
  data: clinicalRecordDataSchema,
  expectedRevision: z.number().int().min(0),
  changeReason: z.string().trim().min(5).max(1000),
  responsibleProfessionalId: z.string().trim().max(100).nullable().optional(),
  responsibleProfessionalName: z.string().trim().min(2).max(200),
  status: z.enum(['DRAFT','ACTIVE','CLOSED']).default('ACTIVE')
}).strict()

export const customFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,49}$/), label: z.string().trim().min(2).max(100),
  section: z.string().trim().min(2).max(50), fieldType: z.enum(['TEXT','TEXTAREA','NUMBER','BOOLEAN','SELECT','MULTISELECT','DATE']),
  options: z.array(z.string().trim().min(1).max(100)).max(100).default([]), required: z.boolean().default(false), sensitive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true)
}).strict()
