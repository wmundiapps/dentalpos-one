import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const editable = ['displayName','logo','primaryColor','secondaryColor','accentColor','themeMode','timezone','language'] as const

export async function show(req: AuthRequest, res: Response) {
  const clinic = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  return res.json(clinic)
}

export async function update(req: AuthRequest, res: Response) {
  const before = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!before) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const data: Record<string, unknown> = {}
  for (const key of editable) if (key in req.body) data[key] = req.body[key]
  const clinic = await prisma.clinic.update({ where: { id: before.id }, data })
  await writeAudit({ clinicId: before.id, tenantId: before.tenantId, actorId: req.user!.id, module: 'settings', action: 'update_identity', entityType: 'Clinic', entityId: before.id, beforeData: before, afterData: clinic, ipAddress: req.ip, userAgent: req.headers['user-agent'] })
  return res.json(clinic)
}
