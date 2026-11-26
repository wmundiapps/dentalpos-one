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

// Quais itens do menu o usuário pode ver. Perfil já configurado na tela de Permissões (tem códigos menu.*) vale pelos itens marcados;
// perfil ainda não configurado vale pelas permissões de visualização de cada módulo (comportamento anterior).
export async function myMenuAccess(req: AuthRequest, res: Response) {
  if (req.user!.role === 'ADMIN') return res.json({ all: true, menuCodes: [], legacyModules: [] })
  const memberships = await prisma.userAccessProfile.findMany({
    where: { userId: req.user!.id, profile: { isActive: true } },
    include: { profile: { include: { permissions: { include: { permission: true } } } } }
  })
  if (memberships.some(m => m.profile.code === 'ADMIN')) return res.json({ all: true, menuCodes: [], legacyModules: [] })
  const menuCodes = new Set<string>()
  const legacyModules = new Set<string>()
  let hasLegacy = false
  for (const m of memberships) {
    const codes = m.profile.permissions.map(p => p.permission.code)
    const menu = codes.filter(c => c.startsWith('menu.'))
    if (menu.length) menu.forEach(c => menuCodes.add(c))
    else { hasLegacy = true; codes.filter(c => c.endsWith('.view')).forEach(c => legacyModules.add(c.split('.')[0])) }
  }
  return res.json({ all: false, menuCodes: [...menuCodes], legacyModules: [...legacyModules], hasLegacy: hasLegacy || memberships.length === 0 })
}

export async function assignProfile(req: AuthRequest, res: Response) {
  const userId = String(req.params.userId)
  const { profileId } = req.body
  const user = await prisma.user.findFirst({ where: { id: userId, clinicId: req.user!.clinicId } })
  const profile = await prisma.accessProfile.findFirst({ where: { id: profileId, clinicId: req.user!.clinicId } })
  if (!user || !profile) return res.status(404).json({ error: 'Usuário ou perfil não encontrado.' })
  if (profile.code === 'ADMIN' && req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Somente o Administrador (Master) pode atribuir o perfil Administrador.' })
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

// Usuários da clínica com os perfis de acesso de cada um (tela de Permissões).
export async function usersAccess(req: AuthRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, accessProfiles: { select: { profileId: true } } },
    orderBy: { firstName: 'asc' }
  })
  return res.json(users.map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, profileIds: u.accessProfiles.map(p => p.profileId) })))
}

// Define exatamente quais permissões o perfil tem. Quem não é ADMIN só concede o que ele mesmo possui.
export async function setProfilePermissions(req: AuthRequest, res: Response) {
  const id = String(req.params.id)
  const profile = await prisma.accessProfile.findFirst({ where: { id, clinicId: req.user!.clinicId } })
  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado.' })
  if (profile.code === 'ADMIN') return res.status(400).json({ error: 'O perfil Administrador (Master) tem acesso total e não pode ser alterado.' })
  const requested: string[] = Array.isArray(req.body?.codes) ? req.body.codes.map(String) : []
  const mine = req.user!.role === 'ADMIN' ? null : await getUserPermissionCodes(req.user!.id)
  const current = await prisma.accessProfilePermission.findMany({ where: { profileId: id }, include: { permission: true } })
  const currentCodes = current.map(p => p.permission.code)
  // Não permite conceder o que o próprio usuário não tem; permissões que o perfil já tinha são mantidas se não forem desmarcadas.
  // Itens de menu (menu.*) podem ser liberados por quem gerencia usuários; o catálogo deles nasce aqui, conforme são marcados.
  const isMenu = (code: string) => /^menu\.[a-z0-9_]{1,80}$/.test(code)
  const allowedToGrant = (code: string) => isMenu(code) || mine === null || mine.includes(code) || currentCodes.includes(code)
  const finalCodes = [...new Set(requested)].filter(allowedToGrant)
  for (const code of finalCodes.filter(isMenu)) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: 'menu', action: 'view' } })
  }
  const all = await prisma.permission.findMany({ where: { code: { in: finalCodes } } })
  await prisma.$transaction([
    prisma.accessProfilePermission.deleteMany({ where: { profileId: id } }),
    prisma.accessProfilePermission.createMany({ data: all.map(p => ({ profileId: id, permissionId: p.id })), skipDuplicates: true })
  ])
  await writeAudit({ clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, actorId: req.user!.id, module: 'settings', action: 'set_profile_permissions', entityType: 'AccessProfile', entityId: id, beforeData: { codes: currentCodes }, afterData: { codes: all.map(p => p.code) }, summary: `Permissões do perfil ${profile.code} atualizadas.` })
  return res.json({ ok: true, codes: all.map(p => p.code) })
}
