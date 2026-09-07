import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'

export type OperationalResolutionStatus = 'RESOLVED' | 'DISMISSED'
export type OperationalResolutionArea = 'Laboratório' | 'Agenda' | 'Financeiro' | 'RH' | 'Pacientes' | 'Estoque'

type Context = { clinicId:string; tenantId:string; actorId:string; ipAddress?:string; userAgent?:string }

type RegisterInput = {
  alertKey?: string | null
  area: OperationalResolutionArea
  sourceEntityType?: string | null
  sourceEntityId?: string | null
  status: OperationalResolutionStatus
  action: string
  reason?: string | null
  note?: string | null
  metadata?: Record<string, unknown>
}

function clean(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function protocolFromSequence(sequence: number) {
  return `RES-5787-${String(sequence).padStart(6, '0')}`
}

export async function registerOperationalResolution(ctx: Context, input: RegisterInput) {
  const reason = clean(input.reason)
  const note = clean(input.note)
  if (input.status === 'DISMISSED' && !reason) throw new Error('Motivo é obrigatório para dispensar um aviso.')
  if (!clean(input.alertKey) && !(clean(input.sourceEntityType) && clean(input.sourceEntityId))) {
    throw new Error('A resolução precisa identificar o alerta ou sua entidade de origem.')
  }

  const existing = await prisma.operationalAlertResolution.findFirst({
    where: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      OR: [
        ...(clean(input.alertKey) ? [{ alertKey: clean(input.alertKey)! }] : []),
        ...(clean(input.sourceEntityType) && clean(input.sourceEntityId) ? [{ sourceEntityType: clean(input.sourceEntityType)!, sourceEntityId: clean(input.sourceEntityId)! }] : []),
      ],
    },
    orderBy: { resolvedAt: 'desc' },
  })
  if (existing) return existing

  const created = await prisma.operationalAlertResolution.create({
    data: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      alertKey: clean(input.alertKey),
      area: input.area,
      sourceEntityType: clean(input.sourceEntityType),
      sourceEntityId: clean(input.sourceEntityId),
      status: input.status,
      action: input.action,
      reason,
      note,
      resolvedById: ctx.actorId,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
  })
  const protocol = protocolFromSequence(created.sequence)
  const updated = await prisma.operationalAlertResolution.update({ where: { id: created.id }, data: { protocol } })

  await writeAudit({
    clinicId: ctx.clinicId,
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    module: 'operations',
    action: input.status === 'DISMISSED' ? 'OPERATIONAL_ALERT_DISMISSED' : 'OPERATIONAL_ALERT_RESOLVED',
    entityType: input.sourceEntityType || 'OperationalAlert',
    entityId: input.sourceEntityId || input.alertKey || created.id,
    afterData: updated,
    metadata: input.metadata,
    summary: `${protocol} • ${input.area} • ${input.status === 'DISMISSED' ? 'aviso dispensado' : 'pendência resolvida'}.`,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })
  return updated
}

export async function listOperationalResolutions(ctx: Pick<Context,'clinicId'|'tenantId'>, sourceEntityIds?: string[]) {
  return prisma.operationalAlertResolution.findMany({
    where: {
      clinicId: ctx.clinicId,
      tenantId: ctx.tenantId,
      ...(sourceEntityIds?.length ? { sourceEntityId: { in: sourceEntityIds } } : {}),
    },
    orderBy: { resolvedAt: 'desc' },
    take: 500,
  })
}

export async function dismissOperationalAlert(ctx: Context, input: Omit<RegisterInput,'status'>) {
  return registerOperationalResolution(ctx, { ...input, status: 'DISMISSED' })
}
