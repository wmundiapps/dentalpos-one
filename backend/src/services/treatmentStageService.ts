import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'

// Fase do paciente na ficha: BUDGET (só orçamento) ou TREATMENT (tratamento confirmado).
// Muda sozinha para TREATMENT quando o orçamento é aprovado, o contrato é gerado ou o primeiro procedimento é executado.
// Nunca volta sozinha para BUDGET: isso só acontece na chave manual da ficha.
export const STAGES = ['BUDGET', 'TREATMENT'] as const
export type TreatmentStage = (typeof STAGES)[number]

export const isStage = (v: unknown): v is TreatmentStage => STAGES.includes(v as TreatmentStage)

export async function confirmTreatment(c: { clinicId: string; tenantId: string; actorId?: string }, patientId: string, reason: string) {
  try {
    const result = await prisma.patient.updateMany({
      where: { id: patientId, clinicId: c.clinicId, tenantId: c.tenantId, OR: [{ treatmentStage: null }, { treatmentStage: { not: 'TREATMENT' } }] },
      data: { treatmentStage: 'TREATMENT', treatmentStageAt: new Date() },
    })
    if (result.count > 0) {
      await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'patients', action: 'PATIENT_STAGE_TREATMENT', entityType: 'Patient', entityId: patientId, summary: `Paciente passou para Tratamento confirmado: ${reason}.` }).catch((e: unknown) => console.error(e))
    }
  } catch (error) {
    // A fase nunca pode impedir a operação principal (aprovar, gerar contrato, registrar evolução).
    console.error('Erro ao atualizar a fase do paciente:', error)
  }
}
