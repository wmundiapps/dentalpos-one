import { prisma } from '../lib/prisma'

export async function audit(tenantId: string, userId: string | null | undefined, action: string, entity?: string, entityId?: string, data?: unknown) {
  try {
    await prisma.auditLog.create({
      data: { tenantId, userId: userId || null, action, entity, entityId, data: data === undefined ? undefined : (JSON.parse(JSON.stringify(data)) as any) },
    })
  } catch (e) {
    console.error('[revah] falha ao gravar auditoria', e)
  }
}
