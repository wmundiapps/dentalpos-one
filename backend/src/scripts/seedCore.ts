import { prisma } from '../lib/prisma'
import { createDefaultProfiles, seedPermissionCatalog } from '../services/permissionService'

async function main() {
  await seedPermissionCatalog()
  const clinics = await prisma.clinic.findMany({ select: { id: true, tenantId: true } })
  for (const clinic of clinics) await createDefaultProfiles(clinic.id, clinic.tenantId)
  console.log(`Core seed concluído para ${clinics.length} clínica(s).`)
}

main().finally(async () => prisma.$disconnect())
