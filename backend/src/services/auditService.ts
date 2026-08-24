import { prisma } from '../lib/prisma'

export interface AuditInput {
  clinicId: string
  tenantId: string
  actorId?: string
  module: string
  action: string
  entityType?: string
  entityId?: string
  summary?: string
  beforeData?: unknown
  afterData?: unknown
  metadata?: unknown
  ipAddress?: string
  userAgent?: string
}

export async function writeAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      clinicId: input.clinicId,
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: input.module,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      beforeData: input.beforeData as any,
      afterData: input.afterData as any,
      metadata: input.metadata as any,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    }
  })
}
