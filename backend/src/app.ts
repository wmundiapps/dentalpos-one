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
