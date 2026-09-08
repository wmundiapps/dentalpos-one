import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import routes from './routes'
import { allowedCorsOrigins } from './config/runtime'
import { ContextRequest, requestContext } from './middleware/requestContext'
import { prisma } from './lib/prisma'

dotenv.config()

const app = express()
const isProduction = process.env.NODE_ENV === 'production'
const bodyLimit = process.env.API_BODY_LIMIT || '2mb'
const allowedOrigins = allowedCorsOrigins()

const trustedDentalPosVercelOrigins = new Set([
  'https://dentalpos-one.vercel.app',
  'https://dentalpos-one-git-chat8-5787-in-e16b45-robsonraveloliveira-7222.vercel.app',
])

function isTrustedDentalPosVercelOrigin(origin: string) {
  return trustedDentalPosVercelOrigins.has(origin)
}

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1)
}

app.disable('x-powered-by')
app.use(requestContext)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      if (isTrustedDentalPosVercelOrigin(origin)) return callback(null, true)
      if (!isProduction && allowedOrigins.length === 0) return callback(null, true)
      return callback(new Error('Origem não autorizada pelo CORS.'))
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Clinic-ID', 'X-Tenant-ID', 'X-Request-ID', 'Idempotency-Key']
  })
)

app.use(
  helmet({
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false
  })
)
app.use(compression())
app.use(morgan(isProduction ? 'combined' : 'dev'))

app.use(
  express.json({
    limit: bodyLimit,
    verify(req, _res, buf) {
      ;(req as ContextRequest).rawBody = Buffer.from(buf)
    }
  })
)
app.use(express.urlencoded({ extended: true, limit: bodyLimit }))

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  next()
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_MAX || 1200),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite temporário de requisições atingido.' }
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/password-reset/request', authLimiter)
app.use('/api/auth/password-reset/confirm', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/demo/register', authLimiter)
app.use('/api', apiLimiter)

app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    application: 'DentalPos One',
    version: '1.0.0',
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  })
})

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ status: 'ready', timestamp: new Date().toISOString() })
  } catch {
    return res.status(503).json({ status: 'not-ready', timestamp: new Date().toISOString() })
  }
})

app.get('/__5787_schema_probe', async (_req, res) => {
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Rota nÃ£o encontrada.' })
  }

  const expectedTables = [
    'SalesProduct',
    'SalesLead',
    'SalesLeadEvent',
    'TenantFeatureFlag',
    'Supplier',
    'IntegrationWebhookEvent',
    'PasswordResetToken',
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
  ]

  const expectedColumns: Record<string, string[]> = {
    TreatmentItem: ['planningData'],
    Budget: ['acceptedAt', 'acceptedByName', 'acceptedByDocument', 'acceptanceEvidence'],
    ClinicalEvolution: [
      'appointmentId',
      'teeth',
      'regions',
      'anesthetic',
      'materials',
      'complications',
      'guidance',
      'attachments',
      'authoredBy',
    ],
  }

  try {
    await prisma.$queryRaw`SELECT 1`

    const tableRows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()',
    )
    const haveTables = new Set(tableRows.map(row => row.table_name))
    const missingTables = expectedTables.filter(name => !haveTables.has(name))

    const columnRows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
      'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()',
    )
    const haveColumns = new Set(
      columnRows.map(row => `${row.table_name}.${row.column_name}`),
    )

    const missingColumns: string[] = []
    for (const [table, columns] of Object.entries(expectedColumns)) {
      for (const column of columns) {
        const key = `${table}.${column}`
        if (!haveColumns.has(key)) missingColumns.push(key)
      }
    }

    const migrationHistory = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
      `SELECT to_regclass('"_prisma_migrations"')::text AS name`,
    )

    return res.json({
      ok: missingTables.length === 0 && missingColumns.length === 0,
      database: true,
      prismaMigrationHistoryPresent: Boolean(migrationHistory[0]?.name),
      missingTables,
      missingColumns,
    })
  } catch {
    return res.status(503).json({
      ok: false,
      database: false,
      error: 'schema_probe_failed',
    })
  }
})
app.use('/api', routes)

app.use((req: express.Request, res) => {
  const contextReq = req as ContextRequest
  return res.status(404).json({
    error: 'Rota não encontrada.',
    requestId: contextReq.requestId
  })
})

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const contextReq = req as ContextRequest
    console.error(`[${contextReq.requestId || 'sem-request-id'}]`, err)

    const status = err?.message === 'Origem não autorizada pelo CORS.' ? 403 : 500
    return res.status(status).json({
      error: status === 403 ? err.message : 'Erro interno do servidor.',
      requestId: contextReq.requestId
    })
  }
)

export default app
