import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

export async function index(req: AuthRequest, res: Response) {
  const clinics = await prisma.clinic.findMany({ where: { tenantId: req.user!.tenantId, id: req.user!.clinicId }, orderBy: { name: 'asc' } })
  return res.json(clinics)
}

export async function show(req: AuthRequest, res: Response) {
  const clinic = await prisma.clinic.findFirst({ where: { id: req.user!.clinicId, tenantId: req.user!.tenantId } })
  if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada.' })
  return res.json(clinic)
}

export async function store(_req: AuthRequest, res: Response) {
  return res.status(403).json({ error: 'Criação de clínica é uma operação de provisionamento e não está disponível por esta rota.' })
}

export async function update(req: AuthRequest, res: Response) {
  const id = String(req.params.id)
  if (id !== req.user!.clinicId) return res.status(403).json({ error: 'Clínica não autorizada.' })
  const before = await prisma.clinic.findFirst({ where: { id, tenantId: req.user!.tenantId } })
  if (!before) return res.status(404).json({ error: 'Clínica não encontrada.' })
  const blocked = new Set(['id','tenantId','createdAt','updatedAt'])
  const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => !blocked.has(key)))
  const clinic = await prisma.clinic.update({ where: { id }, data })
  await writeAudit({ clinicId: id, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'settings', action: 'update_clinic', entityType: 'Clinic', entityId: id, beforeData: before, afterData: clinic })
  return res.json(clinic)
}

export async function remove(_req: AuthRequest, res: Response) {
  return res.status(403).json({ error: 'Exclusão de clínica exige processo administrativo de provisionamento.' })
}
