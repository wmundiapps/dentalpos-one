import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { ClinicalRecordData } from '../types/clinicalRecord'

const emptyData: ClinicalRecordData = {
  mainComplaint:'', currentDiseaseHistory:'', dentalHistory:'', medicalHistory:'', systemicDiseases:[], medications:[], allergies:[], previousSurgeries:[], hospitalizations:[],
  pregnancy:{ applicable:false, status:'NOT_INFORMED' }, smoking:{ status:'NOT_INFORMED', details:'' }, alcohol:{ status:'NOT_INFORMED', details:'' }, parafunctionalHabits:[],
  relevantFamilyHistory:'', vitalSigns:{}, riskConditions:[], clinicalAlerts:[], observations:'', diagnosticHypothesis:'', diagnosis:'', extraoralExam:'', intraoralExam:'',
  softTissues:'', tmj:'', occlusion:'', periodontalCondition:'', generalDentalCondition:'', initialClinicalPlan:'', customFields:{}
}

export function newClinicalRecordData(): ClinicalRecordData { return structuredClone(emptyData) }

function changedFields(before: ClinicalRecordData | null, after: ClinicalRecordData) {
  if (!before) return Object.keys(after)
  return Object.keys(after).filter(key => JSON.stringify(before[key as keyof ClinicalRecordData]) !== JSON.stringify(after[key as keyof ClinicalRecordData]))
}

export async function assertPatient(clinicId: string, tenantId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId, isActive: true } })
  if (!patient) throw Object.assign(new Error('Paciente não encontrado na clínica atual.'), { statusCode: 404 })
  return patient
}

export async function getClinicalRecord(clinicId: string, tenantId: string, patientId: string) {
  const patient = await assertPatient(clinicId, tenantId, patientId)
  const [record, revisions, customFields, evolutions] = await Promise.all([
    prisma.patientClinicalRecord.findFirst({ where:{ patientId, clinicId, tenantId } }),
    prisma.patientClinicalRecordRevision.findMany({ where:{ patientId, clinicId, tenantId }, orderBy:{ revisionNumber:'desc' } }),
    prisma.clinicalCustomFieldDefinition.findMany({ where:{ clinicId, tenantId, isActive:true }, orderBy:[{section:'asc'},{displayOrder:'asc'}] }),
    prisma.clinicalEvolution.findMany({ where:{ patientId, clinicId, tenantId }, orderBy:{createdAt:'desc'} })
  ])
  return { patient, record: record || { patientId, revisionNumber:0, status:'DRAFT', data:newClinicalRecordData(), riskFlags:[], alertSummary:null, responsibleProfessionalId:null, responsibleProfessionalName:'' }, revisions, customFields, evolutions }
}

export async function saveClinicalRecord(input: { clinicId:string; tenantId:string; patientId:string; actorId:string; actorName:string; data:ClinicalRecordData; expectedRevision:number; changeReason:string; responsibleProfessionalId?:string|null; responsibleProfessionalName:string; status:string; ipAddress?:string; userAgent?:string }) {
  await assertPatient(input.clinicId, input.tenantId, input.patientId)
  return prisma.$transaction(async tx => {
    const existing = await tx.patientClinicalRecord.findFirst({ where:{ patientId:input.patientId, clinicId:input.clinicId, tenantId:input.tenantId } })
    const currentRevision = existing?.revisionNumber || 0
    if (currentRevision !== input.expectedRevision) throw Object.assign(new Error('O prontuário foi alterado por outro usuário. Recarregue antes de salvar.'), { statusCode:409 })
    const nextRevision = currentRevision + 1
    const fields = changedFields((existing?.data as unknown as ClinicalRecordData) || null, input.data)
    if (!fields.length && existing) throw Object.assign(new Error('Nenhuma alteração clínica foi identificada.'), { statusCode:422 })
    const riskFlags = [...new Set([...input.data.riskConditions, ...input.data.clinicalAlerts])]
    const alertSummary = riskFlags.length ? riskFlags.join(' • ').slice(0, 2000) : null
    const common = { data:input.data as unknown as Prisma.InputJsonValue, riskFlags, alertSummary, revisionNumber:nextRevision, status:input.status, responsibleProfessionalId:input.responsibleProfessionalId || null, responsibleProfessionalName:input.responsibleProfessionalName, updatedById:input.actorId }
    const record = existing
      ? await tx.patientClinicalRecord.update({ where:{id:existing.id}, data:common })
      : await tx.patientClinicalRecord.create({ data:{...common, clinicId:input.clinicId, tenantId:input.tenantId, patientId:input.patientId, createdById:input.actorId} })
    const revision = await tx.patientClinicalRecordRevision.create({ data:{ clinicId:input.clinicId, tenantId:input.tenantId, patientId:input.patientId, clinicalRecordId:record.id, revisionNumber:nextRevision, dataSnapshot:input.data as unknown as Prisma.InputJsonValue, riskFlags, alertSummary, changeReason:input.changeReason, changedFields:fields, authorId:input.actorId, authorName:input.actorName } })
    await tx.auditLog.create({data:{clinicId:input.clinicId,tenantId:input.tenantId,actorId:input.actorId,module:'clinical',action:'CLINICAL_RECORD_REVISION_CREATE',entityType:'PatientClinicalRecord',entityId:record.id,summary:`Revisão ${nextRevision} do prontuário criada.`,afterData:{revisionNumber:nextRevision,changedFields:fields},metadata:{patientId:input.patientId,changeReason:input.changeReason},ipAddress:input.ipAddress,userAgent:input.userAgent}})
    return { record, revision }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
