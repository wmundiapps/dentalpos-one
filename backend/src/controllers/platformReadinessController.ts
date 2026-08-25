import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { runtimeChecks } from '../config/runtime'

export async function readiness(req: AuthRequest, res: Response) {
  let databaseOk = false

  try {
    await prisma.$queryRaw`SELECT 1`
    databaseOk = true
  } catch {
    databaseOk = false
  }

  const [providerConfigs, activeSenders, storageConfigs] = await Promise.all([
    prisma.paymentProviderConfig.findMany({
      where: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        credentialsConfigured: true,
        webhookConfigured: true
      },
      orderBy: { provider: 'asc' }
    }),
    prisma.revahSender.count({
      where: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, isActive: true }
    }),
    prisma.tenantStorageConfig.count({
      where: { clinicId: req.user!.clinicId, tenantId: req.user!.tenantId, isActive: true }
    })
  ])

  const checks = [
    {
      key: 'database',
      label: 'Banco de dados acessível',
      ok: databaseOk,
      critical: true,
      detail: databaseOk ? 'Conexão com PostgreSQL confirmada.' : 'A API não conseguiu consultar o PostgreSQL.'
    },
    ...runtimeChecks()
  ]

  const criticalPending = checks.filter(check => check.critical && !check.ok)

  return res.json({
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
      releaseChannel: process.env.RELEASE_CHANNEL || 'internal',
      publicAppUrl: process.env.PUBLIC_APP_URL || null
    },
    checks,
    integrations: {
      paymentProviders: providerConfigs,
      activeRevahSenders: activeSenders,
      activeStorageConfigs: storageConfigs
    },
    productionReady: criticalPending.length === 0,
    criticalPending: criticalPending.length
  })
}
