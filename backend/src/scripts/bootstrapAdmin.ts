import { prisma } from '../lib/prisma'
import { createUser } from '../services/userService'
import { createDefaultProfiles } from '../services/permissionService'

async function main() {
  const tenantId = process.env.BOOTSTRAP_TENANT_ID || 'default'
  const clinicName = process.env.BOOTSTRAP_CLINIC_NAME || 'DentalPos Clínica Piloto'
  const cnpj = process.env.BOOTSTRAP_CLINIC_CNPJ || '00000000000000'
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

  if (!email || !password) throw new Error('Defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD.')

  let clinic = await prisma.clinic.findFirst({ where: { tenantId, cnpj } })
  if (!clinic) {
    clinic = await prisma.clinic.create({ data: { tenantId, name: clinicName, displayName: clinicName, email, phone: '', cnpj } })
  }

  await createDefaultProfiles(clinic.id, tenantId)

  let user = await prisma.user.findUnique({ where: { clinicId_email: { clinicId: clinic.id, email } } })
  if (!user) {
    user = await createUser({ clinicId: clinic.id, tenantId, firstName: 'Administrador', lastName: 'DentalPos', email, password, role: 'ADMIN', isActive: true })
  }

  const adminProfile = await prisma.accessProfile.findUnique({ where: { clinicId_code: { clinicId: clinic.id, code: 'ADMIN' } } })
  if (adminProfile) await prisma.userAccessProfile.upsert({ where: { userId_profileId: { userId: user.id, profileId: adminProfile.id } }, update: {}, create: { userId: user.id, profileId: adminProfile.id } })

  console.log(`Bootstrap concluído. clinicId=${clinic.id} admin=${email}`)
}

main().finally(async () => prisma.$disconnect())
