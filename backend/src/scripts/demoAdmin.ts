import { prisma } from '../lib/prisma'
import {
  DEMO_ACCESS_FLAG,
  demoOptions,
  getDemoAccess,
} from '../services/demoAccessService'

function arg(name: string) {
  const prefix = `--${name}=`
  return process.argv.find(item => item.startsWith(prefix))?.slice(prefix.length)
}

function modulesArg() {
  return Array.from(
    new Set(
      String(arg('modules') || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

async function requireClinic(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, tenantId: true, name: true, displayName: true, plan: true },
  })
  if (!clinic) throw new Error('Clínica não encontrada.')
  return clinic
}

async function requireDemoFlag(clinicId: string) {
  const flag = await prisma.tenantFeatureFlag.findUnique({
    where: { clinicId_key: { clinicId, key: DEMO_ACCESS_FLAG } },
  })
  if (!flag) throw new Error('Configuração de demo não encontrada para esta clínica.')
  return flag
}

async function list() {
  const clinics = await prisma.clinic.findMany({
    where: {
      OR: [
        { plan: { startsWith: 'DEMO' } },
        { featureFlags: { some: { key: DEMO_ACCESS_FLAG, enabled: true } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, displayName: true, plan: true },
  })

  if (!clinics.length) {
    console.log('Nenhuma clínica demo encontrada.')
    return
  }

  for (const clinic of clinics) {
    const demo = await getDemoAccess(clinic.id)
    console.log(
      [
        clinic.id,
        clinic.displayName || clinic.name,
        `plano=${clinic.plan}`,
        `fase=${demo.phase}`,
        `fim=${demo.endAt || '-'}`,
        `módulos=${demo.modules.join(',') || '-'}`,
      ].join(' | '),
    )
  }
}

async function setModules(clinicId: string) {
  const modules = modulesArg()
  if (!modules.length) throw new Error('Informe --modules=agenda,patients,...')

  const clinic = await requireClinic(clinicId)
  const flag = await requireDemoFlag(clinicId)
  const metadata = (flag.metadata || {}) as Record<string, unknown>

  await prisma.tenantFeatureFlag.update({
    where: { id: flag.id },
    data: {
      enabled: true,
      rolloutStage: 'PILOT',
      metadata: { ...metadata, modules, version: 1 },
    },
  })

  if (!String(clinic.plan).toUpperCase().startsWith('DEMO')) {
    await prisma.clinic.update({ where: { id: clinicId }, data: { plan: 'DEMO' } })
  }

  console.log(`OK módulos=${modules.join(',')} clínica=${clinicId}`)
}

async function extend(clinicId: string) {
  await requireClinic(clinicId)
  const flag = await requireDemoFlag(clinicId)
  const metadata = (flag.metadata || {}) as Record<string, unknown>
  const currentEnd = new Date(String(metadata.endAt || ''))
  if (Number.isNaN(currentEnd.getTime())) throw new Error('Data final atual inválida.')

  const explicitEnd = arg('end')
  const days = Number(arg('days') || 0)
  let nextEnd: Date

  if (explicitEnd) {
    nextEnd = new Date(`${explicitEnd}T23:59:59.999-03:00`)
    if (Number.isNaN(nextEnd.getTime())) throw new Error('Use --end=AAAA-MM-DD.')
  } else {
    if (!Number.isInteger(days) || days <= 0 || days > 365) {
      throw new Error('Informe --days=N ou --end=AAAA-MM-DD.')
    }
    nextEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000)
  }

  if (nextEnd.getTime() <= Date.now()) throw new Error('A nova data final deve ser futura.')

  const currentGrace = new Date(String(metadata.graceUntil || ''))
  const existingGraceDays =
    !Number.isNaN(currentGrace.getTime()) && currentGrace >= currentEnd
      ? Math.round((currentGrace.getTime() - currentEnd.getTime()) / (24 * 60 * 60 * 1000))
      : demoOptions().graceDays
  const graceUntil = new Date(
    nextEnd.getTime() + Math.max(0, existingGraceDays) * 24 * 60 * 60 * 1000,
  )

  await prisma.tenantFeatureFlag.update({
    where: { id: flag.id },
    data: {
      enabled: true,
      metadata: {
        ...metadata,
        version: 1,
        endAt: nextEnd.toISOString(),
        graceUntil: graceUntil.toISOString(),
      },
    },
  })

  await prisma.clinic.update({ where: { id: clinicId }, data: { plan: 'DEMO' } })

  console.log(
    `OK clínica=${clinicId} fim=${nextEnd.toISOString()} somente-leitura-até=${graceUntil.toISOString()}`,
  )
}

async function convert(clinicId: string) {
  const plan = String(arg('plan') || 'PRO').trim().toUpperCase()
  if (!plan || plan.startsWith('DEMO')) throw new Error('Informe um plano pago válido.')

  await requireClinic(clinicId)
  const flag = await requireDemoFlag(clinicId)

  await prisma.$transaction([
    prisma.clinic.update({ where: { id: clinicId }, data: { plan } }),
    prisma.tenantFeatureFlag.update({
      where: { id: flag.id },
      data: { enabled: false, rolloutStage: 'PRODUCTION' },
    }),
  ])

  console.log(`OK clínica=${clinicId} convertida para plano=${plan}. Dados preservados.`)
}

async function info(clinicId: string) {
  const clinic = await requireClinic(clinicId)
  const demo = await getDemoAccess(clinicId)
  console.log(JSON.stringify({ clinic, demo }, null, 2))
}

async function main() {
  const command = String(process.argv[2] || 'list').toLowerCase()
  const clinicId = String(arg('clinicId') || '')

  if (command === 'list') return list()
  if (!clinicId) throw new Error('Informe --clinicId=ID_DA_CLINICA.')

  if (command === 'modules') return setModules(clinicId)
  if (command === 'extend') return extend(clinicId)
  if (command === 'convert') return convert(clinicId)
  if (command === 'info') return info(clinicId)

  throw new Error(
    'Comandos: list | info --clinicId=... | modules --clinicId=... --modules=agenda,patients | extend --clinicId=... --days=15 | convert --clinicId=... --plan=PRO',
  )
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
