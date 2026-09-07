import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { registerOperationalResolution } from './operationalAlertResolutionService'

export type AlertState = 'ACTIVE' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED'
export type AlertAction = 'PAYMENT' | 'SETTLEMENT' | 'RENEGOTIATION' | 'CANCELLATION' | 'ADJUSTMENT' | 'REVERSAL' | 'DISMISSAL' | 'MARK_IN_PROGRESS'
export type SourceEntity = 'FinancialEntry' | 'Payment' | 'Budget'

type Context = { clinicId:string; tenantId:string; actorId:string; ipAddress?:string; userAgent?:string }
type ResolveInput = { sourceEntityType:SourceEntity; sourceEntityId:string; action:AlertAction; reason?:string; replacementEntityType?:SourceEntity; replacementEntityId?:string; metadata?:Record<string,unknown> }
const REASON_REQUIRED = new Set<AlertAction>(['CANCELLATION','ADJUSTMENT','REVERSAL','DISMISSAL'])

async function getSource(ctx:Context, type:SourceEntity, id:string) {
  if (type === 'FinancialEntry') return prisma.financialEntry.findFirst({ where:{ id, clinicId:ctx.clinicId, tenantId:ctx.tenantId }, select:{ id:true, patientId:true, supplierId:true, personName:true, amount:true, status:true, paidAt:true, dueDate:true, origin:true, originId:true } })
  if (type === 'Payment') return prisma.payment.findFirst({ where:{ id, clinicId:ctx.clinicId, tenantId:ctx.tenantId }, select:{ id:true, amount:true, status:true, paidDate:true, budget:{ select:{ patientId:true } } } })
  return prisma.budget.findFirst({ where:{ id, clinicId:ctx.clinicId, tenantId:ctx.tenantId }, select:{ id:true, patientId:true, totalAmount:true, status:true } })
}

function snapshot(type:SourceEntity, source:any) {
  if (type === 'FinancialEntry') return { patientId:source.patientId||null, supplierId:source.supplierId||null, personName:source.personName||null, amount:Number(source.amount||0) }
  if (type === 'Payment') return { patientId:source.budget?.patientId||null, supplierId:null, personName:null, amount:Number(source.amount||0) }
  return { patientId:source.patientId||null, supplierId:null, personName:null, amount:Number(source.totalAmount||0) }
}

function operationReallyResolved(type:SourceEntity, source:any, action:AlertAction) {
  if (action === 'DISMISSAL') return true
  if (type === 'FinancialEntry') {
    if (action === 'PAYMENT' || action === 'SETTLEMENT') return source.status === 'PAID' && Boolean(source.paidAt)
    if (action === 'CANCELLATION') return source.status === 'CANCELLED'
    if (action === 'RENEGOTIATION') return ['RENEGOTIATED','CANCELLED'].includes(source.status)
    if (action === 'ADJUSTMENT' || action === 'REVERSAL') return ['ADJUSTED','REVERSED','CANCELLED'].includes(source.status)
  }
  if (type === 'Payment') {
    if (action === 'PAYMENT' || action === 'SETTLEMENT') return source.status === 'PAID' && Boolean(source.paidDate)
    if (action === 'CANCELLATION') return source.status === 'CANCELLED'
    if (action === 'REVERSAL') return ['REVERSED','REFUNDED','CANCELLED'].includes(source.status)
  }
  if (type === 'Budget') {
    if (action === 'CANCELLATION') return source.status === 'CANCELLED'
    if (action === 'RENEGOTIATION') return ['SUPERSEDED','CANCELLED'].includes(source.status)
    if (action === 'ADJUSTMENT') return ['ADJUSTED','SUPERSEDED'].includes(source.status)
  }
  return false
}

export async function ensureAlertState(ctx:Context, sourceEntityType:SourceEntity, sourceEntityId:string) {
  const source = await getSource(ctx, sourceEntityType, sourceEntityId)
  if (!source) throw new Error('Entidade financeira não encontrada.')
  const s = snapshot(sourceEntityType, source)
  return prisma.financialAlertResolution.upsert({
    where:{ clinicId_sourceEntityType_sourceEntityId:{ clinicId:ctx.clinicId, sourceEntityType, sourceEntityId } },
    create:{ clinicId:ctx.clinicId, tenantId:ctx.tenantId, sourceEntityType, sourceEntityId, status:'ACTIVE', ...s },
    update:s
  })
}

export async function markFinancialAlertInProgress(ctx:Context, sourceEntityType:SourceEntity, sourceEntityId:string) {
  const current = await ensureAlertState(ctx, sourceEntityType, sourceEntityId)
  if (['RESOLVED','DISMISSED'].includes(current.status)) return current
  const updated = await prisma.financialAlertResolution.update({ where:{ id:current.id }, data:{ status:'IN_PROGRESS', action:'MARK_IN_PROGRESS', resolvedById:null, resolvedAt:null } })
  await writeAudit({ clinicId:ctx.clinicId, tenantId:ctx.tenantId, actorId:ctx.actorId, module:'finance', action:'FINANCIAL_ALERT_IN_PROGRESS', entityType:sourceEntityType, entityId:sourceEntityId, beforeData:current, afterData:updated, summary:'Alerta financeiro colocado em tratamento.', ipAddress:ctx.ipAddress, userAgent:ctx.userAgent })
  return updated
}

export async function resolveFinancialAlertFromOperation(ctx:Context, input:ResolveInput) {
  const reason = input.reason?.trim() || ''
  if (REASON_REQUIRED.has(input.action) && !reason) throw new Error('Motivo é obrigatório para esta ação.')
  if (input.action === 'RENEGOTIATION' && (!input.replacementEntityType || !input.replacementEntityId)) throw new Error('Renegociação exige referência da nova condição financeira.')

  const source = await getSource(ctx, input.sourceEntityType, input.sourceEntityId)
  if (!source) throw new Error('Entidade financeira não encontrada.')
  if (!operationReallyResolved(input.sourceEntityType, source, input.action)) throw new Error('A operação financeira correspondente ainda não foi concluída. O alerta não pode ser encerrado artificialmente.')

  const current = await ensureAlertState(ctx, input.sourceEntityType, input.sourceEntityId)
  const nextStatus:AlertState = input.action === 'DISMISSAL' ? 'DISMISSED' : 'RESOLVED'
  const updated = await prisma.financialAlertResolution.update({ where:{ id:current.id }, data:{ status:nextStatus, action:input.action, reason:reason||null, resolvedById:ctx.actorId, resolvedAt:new Date(), ...snapshot(input.sourceEntityType, source), replacementEntityType:input.replacementEntityType||null, replacementEntityId:input.replacementEntityId||null } })
  await writeAudit({ clinicId:ctx.clinicId, tenantId:ctx.tenantId, actorId:ctx.actorId, module:'finance', action:`FINANCIAL_ALERT_${nextStatus}`, entityType:input.sourceEntityType, entityId:input.sourceEntityId, beforeData:current, afterData:updated, metadata:{ operation:input.action, reason:reason||null, replacementEntityType:input.replacementEntityType||null, replacementEntityId:input.replacementEntityId||null, ...input.metadata }, summary:nextStatus==='DISMISSED'?'Alerta financeiro dispensado com justificativa.':'Alerta financeiro resolvido pela operação financeira real.', ipAddress:ctx.ipAddress, userAgent:ctx.userAgent })
  const protocol = await registerOperationalResolution(ctx, { area:'Financeiro', sourceEntityType:input.sourceEntityType, sourceEntityId:input.sourceEntityId, status:nextStatus==='DISMISSED'?'DISMISSED':'RESOLVED', action:input.action, reason:reason||null, metadata:{ replacementEntityType:input.replacementEntityType||null, replacementEntityId:input.replacementEntityId||null, ...input.metadata } })
  return { ...updated, protocol:protocol.protocol }
}

export function getFinancialAlertResolutionStates(ctx:Pick<Context,'clinicId'|'tenantId'>, ids?:string[]) {
  return prisma.financialAlertResolution.findMany({ where:{ clinicId:ctx.clinicId, tenantId:ctx.tenantId, ...(ids?.length?{sourceEntityId:{in:ids}}:{}) }, orderBy:{ updatedAt:'desc' } })
}
