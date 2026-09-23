import { z } from 'zod'

const code = z.string().trim().min(1).max(40)
const name = z.string().trim().min(2).max(200)

export const programSchema = z.object({
  name,
  code,
  level: z.enum(['GRADUACAO', 'POS_LATO', 'POS_STRICTO', 'TECNICO', 'LIVRE']).default('GRADUACAO'),
  modality: z.enum(['PRESENCIAL', 'EAD', 'HIBRIDO']).default('PRESENCIAL'),
  totalTerms: z.number().int().min(1).max(40).default(1),
  isActive: z.boolean().optional()
}).strict()

export const subjectSchema = z.object({
  name,
  code,
  workloadHours: z.number().int().min(0).max(5000).default(0),
  isActive: z.boolean().optional()
}).strict()

export const curriculumSchema = z.object({
  programId: z.string().trim().min(1),
  version: z.string().trim().min(1).max(40),
  name,
  effectiveFrom: z.string().datetime().optional(),
  isActive: z.boolean().optional()
}).strict()

export const curriculumSubjectSchema = z.object({
  subjectId: z.string().trim().min(1),
  termNumber: z.number().int().min(1).max(40),
  workloadHours: z.number().int().min(0).max(5000).default(0),
  isMandatory: z.boolean().default(true)
}).strict()

export const termSchema = z.object({
  programId: z.string().trim().min(1),
  name,
  type: z.enum(['BIMESTRE', 'TRIMESTRE', 'SEMESTRE', 'ANUAL']).default('SEMESTRE'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  enrollmentStart: z.string().datetime().optional(),
  enrollmentEnd: z.string().datetime().optional(),
  isActive: z.boolean().optional()
}).strict()

export const studentSchema = z.object({
  fullName: name,
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional(),
  documentNumber: z.string().trim().max(30).optional(),
  birthDate: z.string().datetime().optional(),
  status: z.enum(['ATIVO', 'TRANCADO', 'FORMADO', 'EVADIDO', 'CANCELADO']).optional()
}).strict()

export const enrollmentSchema = z.object({
  studentId: z.string().trim().min(1),
  programId: z.string().trim().min(1),
  curriculumId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  monthlyFee: z.number().min(0).max(1000000).optional(),
  tuitionDueDay: z.number().int().min(1).max(28).default(10)
}).strict()

export const classSchema = z.object({
  programId: z.string().trim().min(1),
  curriculumSubjectId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  code,
  modality: z.enum(['PRESENCIAL', 'EAD', 'HIBRIDO']).default('PRESENCIAL'),
  capacity: z.number().int().min(1).max(2000).default(40),
  isActive: z.boolean().optional()
}).strict()

export const classEnrollmentSchema = z.object({
  studentId: z.string().trim().min(1),
  enrollmentId: z.string().trim().min(1)
}).strict()

export const sessionSchema = z.object({
  type: z.enum(['TEORICA', 'PRATICA']).default('TEORICA'),
  title: z.string().trim().min(2).max(300),
  location: z.string().trim().max(300).optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(10).max(600).default(60),
  capacity: z.number().int().min(1).max(2000).optional()
}).strict()

export const sessionBookingSchema = z.object({
  studentId: z.string().trim().min(1)
}).strict()

export const attendanceSchema = z.object({
  studentId: z.string().trim().min(1),
  present: z.boolean().default(true),
  justified: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional()
}).strict()

export const attendanceBulkSchema = z.object({
  records: z.array(attendanceSchema).min(1).max(500)
}).strict()

export const equivalencyRequestSchema = z.object({
  studentId: z.string().trim().min(1),
  programId: z.string().trim().min(1),
  originInstitution: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(z.object({
    originSubjectName: z.string().trim().min(2).max(300),
    originWorkloadHours: z.number().int().min(1).max(5000),
    originGrade: z.number().min(0).max(10).optional(),
    targetSubjectId: z.string().trim().min(1).optional()
  })).min(1).max(100)
}).strict()

export const equivalencyItemDecisionSchema = z.object({
  status: z.enum(['APROVADO', 'REJEITADO']),
  targetSubjectId: z.string().trim().min(1).optional(),
  approvedWorkloadHours: z.number().int().min(0).max(5000).optional(),
  analystNotes: z.string().trim().max(2000).optional()
}).strict()
