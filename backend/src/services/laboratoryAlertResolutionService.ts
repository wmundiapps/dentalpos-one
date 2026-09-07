import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { registerOperationalResolution } from './operationalAlertResolutionService'
import type { LaboratoryAlertKind, LaboratoryPendingState, LaboratoryResolutionAction, LaboratoryResolutionInput, PendingResolutionState } from '../types/laboratoryAlertResolution'
import { ValidationError } from '../validation/specialtyClinicalValidation'

interface Scope { clinicId: string; tenantId: string; actorId: string; ipAddress?: string; userAgent?: string }

const terminalStatuses = new Set(['DELIVERED','COMPLETED','CANCELLED'])
const autoResolutionByStatus: Record<string, LaboratoryResolutionAction> = {
  RECEIVED: 'RECEIVED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
}
const protocolSeed = (workId: string, at: Date) => `LAB-${workId.slice(0,8).toUpperCase()}-${at.toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}`
const dueKey = (kind: LaboratoryAlertKind, workId: string, dueDate: Date | null) => `${kind}:${workId}:${dueDate ? dueDate.toISOString() : 'NO_DUE_DATE'}`

async function getWork(workId: string, scope: Scope) {
  const work = await prisma.laboratoryWork.findFirst({
    where: { id: workId, clinicId: scope.clinicId, tenantId: scope.tenantId },
    select: { id:true, trackingCode:true, dueDate:true, status:true, updatedAt:true, patientId:true, workType:true }
  })
  if (!work) throw new ValidationError('Trabalho laboratorial não encontrado nesta clínica')
  return work
}

function statusForAction(action: LaboratoryResolutionAction, current: string) {
  if (action === 'RECEIVED') return 'RECEIVED'
  if (action === 'DELIVERED') return 'DELIVERED'
  if (action === 'COMPLETED') return 'COMPLETED'
  if (action === 'CANCELLED') return 'CANCELLED'
  return current
}

export async function beginLaboratoryAlertTreatment(workId: string, alertKind: LaboratoryAlertKind, note: string | null, scope: Scope) {
  const work = await getWork(workId, scope)
  const key = dueKey(alertKind, work.id, work.dueDate)
  const now = new Date()
  await prisma.laboratoryWorkHistory.create({ data: {
    clinicId: scope.clinicId, tenantId: scope.tenantId, laboratoryWorkId: work.id, actorId: scope.actorId,
    action: 'ALERT_TREATMENT_STARTED', description: 'Pendência laboratorial colocada em tratamento.',
    metadata: { version:1, alertKind, alertKey:key, state:'IN_TREATMENT', note, dueDate:work.dueDate?.toISOString() ?? null, responsibleUserId:scope.actorId, occurredAt:now.toISOString(), entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode} }
  }})
  await writeAudit({clinicId:scope.clinicId,tenantId:scope.tenantId,actorId:scope.actorId,module:'CLINICAL_SPECIALTY',action:'LAB_ALERT_TREATMENT_STARTED',entityType:'LaboratoryWork',entityId:work.id,summary:`Pendência ${work.trackingCode} em tratamento`,metadata:{alertKind,alertKey:key},ipAddress:scope.ipAddress,userAgent:scope.userAgent})
  return getLaboratoryPendingState(workId, alertKind, scope)
}

export async function resolveLaboratoryAlert(workId: string, input: LaboratoryResolutionInput, scope: Scope) {
  const work = await getWork(workId, scope)
  const oldDueDate = work.dueDate
  const alertKind = input.alertKind || 'LABORATORY_OVERDUE'
  const key = dueKey(alertKind, work.id, oldDueDate)
  const now = new Date()
  const newDueDate = input.action === 'RENEGOTIATED' ? new Date(input.newDueDate!) : oldDueDate
  const state: PendingResolutionState = ['IMPROPER_ALERT','DEMO_DATA'].includes(input.action) ? 'DISMISSED' : 'RESOLVED'
  const newStatus = statusForAction(input.action, work.status)
  const seed = protocolSeed(work.id, now)
  const metadata = {
    version:1, alertKind, alertKey:key, state, resolutionAction:input.action, solution:input.solution,
    observation:input.observation ?? null, reason:input.reason ?? null, originalDueDate:oldDueDate?.toISOString() ?? null,
    newDueDate:newDueDate?.toISOString() ?? null, resolutionDate:now.toISOString(), responsibleUserId:scope.actorId,
    protocolSeed:seed, entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode}, previousStatus:work.status, resultingStatus:newStatus
  }
  await prisma.$transaction(async tx => {
    if (input.action === 'RENEGOTIATED') {
      await tx.laboratoryWork.update({where:{id:work.id},data:{dueDate:newDueDate}})
    } else if (newStatus !== work.status) {
      await tx.laboratoryWork.update({where:{id:work.id},data:{status:newStatus}})
    }
    await tx.laboratoryWorkHistory.create({data:{
      clinicId:scope.clinicId,tenantId:scope.tenantId,laboratoryWorkId:work.id,actorId:scope.actorId,
      action: input.action === 'RENEGOTIATED' ? 'ALERT_RENEGOTIATED' : state === 'DISMISSED' ? 'ALERT_DISMISSED' : 'ALERT_RESOLVED',
      description: input.action === 'RENEGOTIATED' ? `Prazo renegociado. Prazo anterior preservado: ${oldDueDate?.toISOString() ?? 'não informado'}.` : `Pendência resolvida: ${input.solution}`,
      metadata: metadata as Prisma.InputJsonValue
    }})
  })
  await writeAudit({clinicId:scope.clinicId,tenantId:scope.tenantId,actorId:scope.actorId,module:'CLINICAL_SPECIALTY',action:'LAB_ALERT_RESOLVE',entityType:'LaboratoryWork',entityId:work.id,summary:`Pendência ${work.trackingCode}: ${input.action}`,beforeData:{status:work.status,dueDate:oldDueDate},afterData:{status:newStatus,dueDate:newDueDate},metadata,ipAddress:scope.ipAddress,userAgent:scope.userAgent})
  const protocol = await registerOperationalResolution(scope, { alertKey:alertKind==='LABORATORY_AT_RISK'?`lab-risk-${work.id}`:`lab-overdue-${work.id}`, area:'Laboratório', sourceEntityType:'LaboratoryWork', sourceEntityId:work.id, status:state==='DISMISSED'?'DISMISSED':'RESOLVED', action:input.action, reason:input.reason ?? null, note:input.observation ?? null, metadata })
  const pending = await getLaboratoryPendingState(workId, alertKind, scope)
  return { ...pending, protocol:protocol.protocol }
}

export async function syncLaboratoryAlertFromWorkState(workId: string, previousStatus: string, scope: Scope, alertKind: LaboratoryAlertKind = 'LABORATORY_OVERDUE') {
  const work = await getWork(workId, scope)
  const action = autoResolutionByStatus[work.status]
  if (!action || work.status === previousStatus) return getLaboratoryPendingState(workId, alertKind, scope)
  return resolveLaboratoryAlert(workId, {
    action, alertKind, solution:`Resolvido automaticamente pelo fluxo normal do laboratório ao alterar status para ${work.status}.`,
    observation:'Resolução automática: não exige segunda ação do usuário.', reason: action === 'CANCELLED' ? 'Cancelado no fluxo normal do laboratório.' : null
  }, scope)
}

export async function getLaboratoryPendingState(workId: string, alertKind: LaboratoryAlertKind, scope: Scope): Promise<LaboratoryPendingState> {
  const work = await getWork(workId, scope)
  const key = dueKey(alertKind, work.id, work.dueDate)
  const histories = await prisma.laboratoryWorkHistory.findMany({
    where:{clinicId:scope.clinicId,tenantId:scope.tenantId,laboratoryWorkId:work.id,action:{in:['ALERT_TREATMENT_STARTED','ALERT_RESOLVED','ALERT_RENEGOTIATED','ALERT_DISMISSED']}},
    orderBy:{createdAt:'desc'},take:30,select:{action:true,actorId:true,metadata:true,createdAt:true}
  })
  const matching = histories.find(h => {
    const m = (h.metadata || {}) as Record<string, unknown>
    return m.alertKey === key
  })
  if (!matching && alertKind === 'LABORATORY_OVERDUE' && work.dueDate && work.dueDate.getTime() > Date.now()) {
    const renegotiation = histories.find(h => {
      if (h.action !== 'ALERT_RENEGOTIATED') return false
      const m = (h.metadata || {}) as Record<string, any>
      return m.newDueDate && new Date(String(m.newDueDate)).getTime() === work.dueDate!.getTime()
    })
    if (renegotiation) {
      const m = (renegotiation.metadata || {}) as Record<string, any>
      return {state:'RESOLVED',active:false,resolutionDate:m.resolutionDate||renegotiation.createdAt.toISOString(),responsibleUserId:String(m.responsibleUserId||renegotiation.actorId||'')||null,reason:m.reason||null,solution:m.solution||'Prazo renegociado.',entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode},alertKind,alertKey:key,dueDate:work.dueDate.toISOString(),originalDueDate:m.originalDueDate||null,newDueDate:m.newDueDate||work.dueDate.toISOString(),resolutionAction:'RENEGOTIATED',protocolSeed:m.protocolSeed||null}
    }
  }
  if (matching) {
    const m = (matching.metadata || {}) as Record<string, any>
    const state = (m.state || (matching.action === 'ALERT_TREATMENT_STARTED' ? 'IN_TREATMENT' : matching.action === 'ALERT_DISMISSED' ? 'DISMISSED' : 'RESOLVED')) as PendingResolutionState
    return {state,active:state==='ACTIVE'||state==='IN_TREATMENT',resolutionDate:m.resolutionDate||null,responsibleUserId:String(m.responsibleUserId||matching.actorId||'')||null,reason:m.reason||null,solution:m.solution||null,entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode},alertKind,alertKey:key,dueDate:work.dueDate?.toISOString()??null,originalDueDate:m.originalDueDate||null,newDueDate:m.newDueDate||null,resolutionAction:m.resolutionAction||null,protocolSeed:m.protocolSeed||null}
  }
  if (terminalStatuses.has(work.status)) {
    return {state:'RESOLVED',active:false,resolutionDate:work.updatedAt.toISOString(),responsibleUserId:null,reason:null,solution:`Estado terminal do trabalho: ${work.status}. Chat 8 deve acionar o sincronizador no fluxo normal para registrar o responsável.`,entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode},alertKind,alertKey:key,dueDate:work.dueDate?.toISOString()??null,resolutionAction:autoResolutionByStatus[work.status]||null,protocolSeed:null}
  }
  return {state:'ACTIVE',active:true,resolutionDate:null,responsibleUserId:null,reason:null,solution:null,entity:{type:'LaboratoryWork',id:work.id,trackingCode:work.trackingCode},alertKind,alertKey:key,dueDate:work.dueDate?.toISOString()??null,resolutionAction:null,protocolSeed:null}
}
