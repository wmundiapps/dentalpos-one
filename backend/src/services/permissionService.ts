import { prisma } from '../lib/prisma'

export const PERMISSIONS = [
  ['dashboard.view', 'dashboard', 'view'],
  ['agenda.view', 'agenda', 'view'], ['agenda.create', 'agenda', 'create'], ['agenda.edit', 'agenda', 'edit'], ['agenda.cancel', 'agenda', 'cancel'],
  ['patients.view', 'patients', 'view'], ['patients.create', 'patients', 'create'], ['patients.edit', 'patients', 'edit'],
  ['clinical.view', 'clinical', 'view'], ['clinical.edit', 'clinical', 'edit'],
  ['laboratory.view', 'laboratory', 'view'], ['laboratory.create', 'laboratory', 'create'], ['laboratory.edit', 'laboratory', 'edit'],
  ['design.view', 'design', 'view'], ['design.edit', 'design', 'edit'],
  ['finance.view', 'finance', 'view'], ['finance.create', 'finance', 'create'], ['finance.edit', 'finance', 'edit'], ['finance.approve', 'finance', 'approve'], ['finance.values', 'finance', 'values'],
  ['accounting.view', 'accounting', 'view'], ['accounting.edit', 'accounting', 'edit'], ['accounting.approve', 'accounting', 'approve'], ['accounting.portal', 'accounting', 'portal'],
  ['hr.view', 'hr', 'view'], ['hr.create', 'hr', 'create'], ['hr.edit', 'hr', 'edit'], ['hr.sensitive', 'hr', 'sensitive'],
  ['sales.view', 'sales', 'view'], ['sales.edit', 'sales', 'edit'],
  ['marketing.view', 'marketing', 'view'], ['marketing.send', 'marketing', 'send'],
  ['documents.view', 'documents', 'view'], ['documents.edit', 'documents', 'edit'],
  ['settings.view', 'settings', 'view'], ['settings.edit', 'settings', 'edit'],
  ['users.view', 'users', 'view'], ['users.manage', 'users', 'manage'],
  ['audit.view', 'audit', 'view'],
  ['training.clinical', 'training', 'clinical'], ['training.jobrotation', 'training', 'jobrotation'], ['training.manage', 'training', 'manage']
] as const

export async function seedPermissionCatalog() {
  for (const [code, module, action] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { module, action },
      create: { code, module, action }
    })
  }
}

export async function getUserPermissionCodes(userId: string) {
  const memberships = await prisma.userAccessProfile.findMany({
    where: { userId, profile: { isActive: true } },
    include: { profile: { include: { permissions: { include: { permission: true } } } } }
  })
  return [...new Set(memberships.flatMap(m => m.profile.permissions.map(p => p.permission.code)))]
}

export async function createDefaultProfiles(clinicId: string, tenantId: string) {
  await seedPermissionCatalog()
  const permissions = await prisma.permission.findMany()
  const byCode = new Map(permissions.map(p => [p.code, p.id]))

  const definitions: Record<string, string[]> = {
    ADMIN: permissions.map(p => p.code),
    GESTOR: permissions.filter(p => !p.code.startsWith('hr.sensitive')).map(p => p.code),
    RECEPCAO: ['dashboard.view','agenda.view','agenda.create','agenda.edit','agenda.cancel','patients.view','patients.create','patients.edit','clinical.view','finance.view','finance.values','marketing.view','training.jobrotation'],
    DENTISTA: ['dashboard.view','agenda.view','patients.view','clinical.view','clinical.edit','laboratory.view','laboratory.create','design.view','design.edit','training.clinical'],
    LABORATORIO: ['dashboard.view','laboratory.view','laboratory.create','laboratory.edit','design.view','design.edit','training.jobrotation'],
    FINANCEIRO: ['dashboard.view','patients.view','finance.view','finance.create','finance.edit','finance.approve','finance.values','accounting.view','accounting.edit','training.jobrotation'],
    RH: ['dashboard.view','hr.view','hr.create','hr.edit','hr.sensitive','documents.view','documents.edit','finance.view'],
    CONTADOR: ['dashboard.view','finance.view','finance.values','accounting.view','accounting.edit','accounting.approve','accounting.portal','documents.view'],
    AUXILIAR: ['dashboard.view','agenda.view','patients.view','clinical.view','laboratory.view','training.jobrotation'],
    ADMINISTRACAO: ['dashboard.view','agenda.view','patients.view','patients.create','patients.edit','finance.view','documents.view','documents.edit','hr.view','settings.view','users.view','training.jobrotation'],
    JURIDICO: ['dashboard.view','patients.view','documents.view','documents.edit','hr.view','accounting.view','audit.view']
  }

  for (const [code, codes] of Object.entries(definitions)) {
    // Perfil que já existe é preservado: o gestor pode ter personalizado as permissões na tela de Permissões.
    const existing = await prisma.accessProfile.findUnique({ where: { clinicId_code: { clinicId, code } }, include: { _count: { select: { permissions: true } } } })
    if (existing) {
      if (!existing.isActive) await prisma.accessProfile.update({ where: { id: existing.id }, data: { isActive: true } })
      if (existing._count.permissions > 0) continue
    }
    const profile = existing || await prisma.accessProfile.create({ data: { clinicId, tenantId, code, name: code, isSystem: true } })
    const data = codes.map(permissionCode => byCode.get(permissionCode)).filter(Boolean).map(permissionId => ({ profileId: profile.id, permissionId: permissionId! }))
    if (data.length) await prisma.accessProfilePermission.createMany({ data, skipDuplicates: true })
  }
}
