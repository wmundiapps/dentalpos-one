import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type {
  CreateSpecializedAttachmentInput,
  CreateSpecializedEvolutionInput,
  CreateSpecializedRecordInput,
  UpdateSpecializedRecordInput,
} from '../validation/specializedClinicalSchemas'

export interface SpecializedClinicalContext {
  clinicId: string
  tenantId: string
  actorId: string
}

export async function assertPatient(ctx: SpecializedClinicalContext, patientId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId, tenantId: ctx.tenantId } })
}

export async function findRecord(ctx: SpecializedClinicalContext, patientId: string, recordId: string) {
  return prisma.specializedClinicalRecord.findFirst({
    where: { id: recordId, patientId, clinicId: ctx.clinicId, tenantId: ctx.tenantId },
  })
}

export async function listPatientRecords(ctx: SpecializedClinicalContext, patientId: string) {
  return prisma.specializedClinicalRecord.findMany({
    where: { patientId, clinicId: ctx.clinicId, tenantId: ctx.tenantId },
    include: {
      evolutions: { orderBy: { occurredAt: 'desc' } },
      attachments: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { startedAt: 'desc' },
  })
}

export async function createRecord(ctx: SpecializedClinicalContext, patientId: string, input: CreateSpecializedRecordInput) {
  return prisma.specializedClinicalRecord.create({
    data: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      patientId,
      specialty: input.specialty,
      status: input.status,
      chiefComplaint: input.chiefComplaint,
      diagnosis: input.diagnosis,
      diagnosticHypothesis: input.diagnosticHypothesis,
      treatmentPlan: input.treatmentPlan,
      responsibleId: input.responsibleId,
      responsibleName: input.responsibleName,
      clinicalData: input.clinicalData as Prisma.InputJsonValue,
      startedAt: input.startedAt,
      createdById: ctx.actorId,
      updatedById: ctx.actorId,
    },
  })
}

export async function updateRecord(ctx: SpecializedClinicalContext, recordId: string, input: UpdateSpecializedRecordInput) {
  const terminal = input.status && ['COMPLETED', 'ABANDONED', 'DISCHARGED'].includes(input.status)
  const reopening = input.status && ['ACTIVE', 'RETENTION'].includes(input.status)
  return prisma.specializedClinicalRecord.update({
    where: { id: recordId },
    data: {
      ...input,
      clinicalData: input.clinicalData as Prisma.InputJsonValue | undefined,
      finishedAt: input.finishedAt === null
        ? null
        : input.finishedAt ?? (terminal ? new Date() : reopening ? null : undefined),
      updatedById: ctx.actorId,
    },
  })
}

export async function createEvolution(ctx: SpecializedClinicalContext, patientId: string, recordId: string, input: CreateSpecializedEvolutionInput) {
  return prisma.specializedClinicalEvolution.create({
    data: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      patientId,
      recordId,
      evolutionType: input.evolutionType,
      professionalId: input.professionalId,
      professionalName: input.professionalName,
      summary: input.summary,
      clinicalData: input.clinicalData as Prisma.InputJsonValue,
      occurredAt: input.occurredAt,
      createdById: ctx.actorId,
    },
  })
}

export async function createAttachment(ctx: SpecializedClinicalContext, patientId: string, recordId: string, input: CreateSpecializedAttachmentInput) {
  return prisma.specializedClinicalAttachment.create({
    data: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      patientId,
      recordId,
      category: input.category,
      clinicalFileId: input.clinicalFileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageKey: input.storageKey,
      capturedAt: input.capturedAt,
      notes: input.notes,
      metadata: input.metadata as Prisma.InputJsonValue,
      createdById: ctx.actorId,
    },
  })
}

export async function archiveAttachment(ctx: SpecializedClinicalContext, patientId: string, recordId: string, attachmentId: string) {
  const attachment = await prisma.specializedClinicalAttachment.findFirst({
    where: { id: attachmentId, recordId, patientId, clinicId: ctx.clinicId, tenantId: ctx.tenantId, isActive: true },
  })
  if (!attachment) return null
  return prisma.specializedClinicalAttachment.update({ where: { id: attachment.id }, data: { isActive: false } })
}
