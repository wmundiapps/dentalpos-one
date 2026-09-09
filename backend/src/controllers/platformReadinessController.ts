import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { runtimeChecks } from '../config/runtime'

type TableCheck = { name: string; exists: boolean }
type ColumnCheck = { tableName: string; columnName: string; exists: boolean }

const EXPECTED_5787_TABLES = [
  'PatientClinicalRecord',
  'PatientClinicalRecordRevision',
  'ClinicalCustomFieldDefinition',
  'SpecializedClinicalRecord',
  'SpecializedClinicalEvolution',
  'SpecializedClinicalAttachment',
  'DentalChartEntry',
  'DentalFindingDefinition',
  'PeriodontalExam',
  'PeriodontalSiteRecord',
  'TreatmentPlanRevision',
  'BudgetRevision',
  'FinancialAlertResolution',
  'OperationalAlertResolution',
  'ClinicalDocumentTemplate',
  'ClinicalDocument',
  'ClinicalDocumentHistory',
  'ClinicalFileCategory',
  'ClinicalFile',
  'SurgeryCase',
  'SurgeryFollowUp',
  'ImplantRecord',
  'ProsthesisCase',
  'ProsthesisHistory',
] as const

const EXPECTED_5787_COLUMNS = [
  ['TreatmentItem', 'planningData'],
  ['Budget', 'acceptedAt'],
  ['Budget', 'acceptedByName'],
  ['Budget', 'acceptedByDocument'],
  ['Budget', 'acceptanceEvidence'],
  ['ClinicalEvolution', 'appointmentId'],
  ['ClinicalEvolution', 'teeth'],
  ['ClinicalEvolution', 'regions'],
  ['ClinicalEvolution', 'anesthetic'],
  ['ClinicalEvolution', 'materials'],
  ['ClinicalEvolution', 'complications'],
  ['ClinicalEvolution', 'guidance'],
  ['ClinicalEvolution', 'attachments'],
  ['ClinicalEvolution', 'authoredBy'],
] as const

function quotedValues(values: readonly string[]) {
  return values.map(value => `('${value.replace(/'/g, "''")}')`).join(',')
}

async function inspect5787Schema() {
  const tableRows = await prisma.$queryRawUnsafe<Array<{ name: string; exists: boolean }>>(`
    SELECT
      expected.name,
      (to_regclass(format('"%s"', expected.name)) IS NOT NULL) AS "exists"
    FROM (VALUES ${quotedValues(EXPECTED_5787_TABLES)}) AS expected(name)
    ORDER BY expected.name
  `)

  const requestedColumns = EXPECTED_5787_COLUMNS
    .map(([tableName, columnName]) =>
      `('${tableName.replace(/'/g, "''")}','${columnName.replace(/'/g, "''")}')`,
    )
    .join(',')

  const columnRows = await prisma.$queryRawUnsafe<Array<{
    tableName: string
    columnName: string
    exists: boolean
  }>>(`
    SELECT
      expected.table_name AS "tableName",
      expected.column_name AS "columnName",
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = expected.table_name
          AND c.column_name = expected.column_name
      ) AS "exists"
    FROM (VALUES ${requestedColumns}) AS expected(table_name, column_name)
    ORDER BY expected.table_name, expected.column_name
  `)

  const history = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT (to_regclass('"_prisma_migrations"') IS NOT NULL) AS "exists"
  `

  const tables: TableCheck[] = tableRows.map(row => ({
    name: row.name,
    exists: Boolean(row.exists),
  }))
  const columns: ColumnCheck[] = columnRows.map(row => ({
    tableName: row.tableName,
    columnName: row.columnName,
    exists: Boolean(row.exists),
  }))

  return {
    tables,
    columns,
    missingTables: tables.filter(row => !row.exists).map(row => row.name),
    missingColumns: columns
      .filter(row => !row.exists)
      .map(row => `${row.tableName}.${row.columnName}`),
    prismaMigrationHistoryPresent: Boolean(history[0]?.exists),
  }
}

async function safeIntegrationSnapshot(clinicId: string, tenantId: string) {
  const [providers, senders, storage, resetEmailSender] = await Promise.allSettled([
    prisma.paymentProviderConfig.findMany({
      where: { clinicId, tenantId },
      select: {
        provider: true,
        environment: true,
        isActive: true,
        credentialsConfigured: true,
        webhookConfigured: true,
      },
      orderBy: { provider: 'asc' },
    }),
    prisma.revahSender.count({
      where: { clinicId, tenantId, isActive: true },
    }),
    prisma.tenantStorageConfig.count({
      where: { clinicId, tenantId, isActive: true },
    }),
    prisma.revahSender.count({
      where: {
        clinicId,
        tenantId,
        channel: 'EMAIL',
        isActive: true,
        isDefault: true,
      },
    }),
  ])

  return {
    paymentProviders: providers.status === 'fulfilled' ? providers.value : [],
    activeRevahSenders: senders.status === 'fulfilled' ? senders.value : 0,
    activeStorageConfigs: storage.status === 'fulfilled' ? storage.value : 0,
    passwordResetEmailSenderConfigured:
      resetEmailSender.status === 'fulfilled' && resetEmailSender.value > 0,
  }
}

export async function readiness(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })

  let databaseOk = false
  let databaseSchema: Awaited<ReturnType<typeof inspect5787Schema>> | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
    databaseOk = true
    databaseSchema = await inspect5787Schema()
  } catch {
    databaseOk = false
    databaseSchema = null
  }

  const integrations = await safeIntegrationSnapshot(
    req.user.clinicId,
    req.user.tenantId,
  )

  const schema5787Ok = Boolean(
    databaseSchema &&
    databaseSchema.missingTables.length === 0 &&
    databaseSchema.missingColumns.length === 0,
  )

  const stripeActive = integrations.paymentProviders.some(
    provider => provider.provider === 'STRIPE' && provider.isActive,
  )
  const asaasActive = integrations.paymentProviders.some(
    provider => provider.provider === 'ASAAS' && provider.isActive,
  )

  const checks = [
    {
      key: 'database',
      label: 'Banco de dados acessível',
      ok: databaseOk,
      critical: true,
      detail: databaseOk
        ? 'Conexão com PostgreSQL confirmada.'
        : 'A API não conseguiu consultar o PostgreSQL.',
    },
    {
      key: 'clinical-schema-5787',
      label: 'Schema clínico do Piloto 5787',
      ok: schema5787Ok,
      critical: true,
      detail: !databaseOk
        ? 'Não foi possível inspecionar o schema porque o banco não respondeu.'
        : schema5787Ok
          ? 'Tabelas e colunas clínicas esperadas para os Chats 1–7 estão presentes.'
          : `${databaseSchema?.missingTables.length || 0} tabela(s) e ${databaseSchema?.missingColumns.length || 0} coluna(s) do Piloto 5787 ainda não foram localizadas.`,
    },
    {
      key: 'prisma-history',
      label: 'Histórico Prisma identificável',
      ok: Boolean(databaseSchema?.prismaMigrationHistoryPresent),
      critical: false,
      detail: databaseSchema?.prismaMigrationHistoryPresent
        ? 'A tabela _prisma_migrations existe no banco.'
        : 'A tabela _prisma_migrations não foi localizada; por isso não é seguro aplicar migrate deploy às cegas.',
    },
    {
      key: 'stripe-webhook',
      label: 'Webhook Stripe do DentalPos',
      ok: !stripeActive || Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()),
      critical: stripeActive,
      detail: stripeActive
        ? 'Stripe ativo exige STRIPE_WEBHOOK_SECRET no backend para validar eventos assinados.'
        : 'Stripe não está ativo para esta clínica; este requisito não bloqueia o piloto.',
    },
    {
      key: 'asaas-webhook',
      label: 'Webhook Asaas do DentalPos',
      ok: !asaasActive || Boolean(String(process.env.ASAAS_WEBHOOK_TOKEN || '').trim()),
      critical: asaasActive,
      detail: asaasActive
        ? 'Asaas ativo exige ASAAS_WEBHOOK_TOKEN no backend.'
        : 'Asaas não está ativo para esta clínica; este requisito não bloqueia o piloto.',
    },
    {
      key: 'password-reset-email',
      label: 'E-mail transacional para redefinição de senha',
      ok: integrations.passwordResetEmailSenderConfigured,
      critical: true,
      detail: integrations.passwordResetEmailSenderConfigured
        ? 'Há um remetente EMAIL padrão ativo no REVAH para entregar links de redefinição.'
        : 'Configure um remetente EMAIL padrão ativo no REVAH antes de liberar produção.',
    },
    ...runtimeChecks(),
  ]

  const criticalPending = checks.filter(check => check.critical && !check.ok)

  return res.json({
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      appEnv: process.env.APP_ENV || process.env.NODE_ENV || 'development',
      releaseChannel: process.env.RELEASE_CHANNEL || 'internal',
      publicAppUrl: process.env.PUBLIC_APP_URL || null,
    },
    checks,
    databaseSchema,
    integrations,
    productionReady: criticalPending.length === 0,
    criticalPending: criticalPending.length,
  })
}
