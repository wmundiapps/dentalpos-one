import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { createDefaultProfiles, getUserPermissionCodes, seedPermissionCatalog } from '../services/permissionService'
import { writeAudit } from '../services/auditService'

export async function catalog(_req: AuthRequest, res: Response) {
  await seedPermissionCatalog()
  return res.json(await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] }))
}

export async function profiles(req: AuthRequest, res: Response) {
  return res.json(await prisma.accessProfile.findMany({
    where: { clinicId: req.user!.clinicId, isActive: true },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: { name: 'asc' }
  }))
}

export async function bootstrapProfiles(req: AuthRequest, res: Response) {
  await createDefaultProfiles(req.user!.clinicId, req.user!.tenantId)
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'settings', action: 'bootstrap_access', summary: 'Perfis padrão de acesso criados/atualizados.' })
  return res.json({ ok: true })
}

export async function myPermissions(req: AuthRequest, res: Response) {
  if (req.user!.role === 'ADMIN') return res.json({ role: 'ADMIN', permissions: ['*'] })
  return res.json({ role: req.user!.role, permissions: await getUserPermissionCodes(req.user!.id) })
}

export async function assignProfile(req: AuthRequest, res: Response) {
  const userId = String(req.params.userId)
  const { profileId } = req.body
  const user = await prisma.user.findFirst({ where: { id: userId, clinicId: req.user!.clinicId } })
  const profile = await prisma.accessProfile.findFirst({ where: { id: profileId, clinicId: req.user!.clinicId } })
  if (!user || !profile) return res.status(404).json({ error: 'Usuário ou perfil não encontrado.' })
  await prisma.userAccessProfile.upsert({ where: { userId_profileId: { userId, profileId } }, update: {}, create: { userId, profileId } })
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'users', action: 'assign_profile', entityType: 'User', entityId: userId, afterData: { profileId } })
  return res.json({ ok: true })
}

export async function removeProfile(req: AuthRequest, res: Response) {
  const userId = String(req.params.userId)
  const profileId = String(req.params.profileId)
  await prisma.userAccessProfile.deleteMany({ where: { userId, profileId, user: { clinicId: req.user!.clinicId } } })
  return res.json({ ok: true })
}
