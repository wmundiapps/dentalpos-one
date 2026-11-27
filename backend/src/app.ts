import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import routes from './routes'
import { ContextRequest, requestContext } from './middleware/requestContext'
import { prisma } from './lib/prisma'
import { apiSecurityHeaders, origemPermitida, originGuard } from './modules/seguranca/origem'
import { instalarLogSeguro, sanitizarUrl } from './modules/lgpd/mascara'
import { timingSafeEqual } from 'crypto'
import { concluirLogin } from './controllers/authController'
import { getDemoAccess } from './services/demoAccessService'
import { montarLoginFacial } from './modules/seguranca/loginFacial'

dotenv.config()

const app = express()
const isProduction = process.env.NODE_ENV === 'production'
// 20mb: cobre o repositório de arquivos do AVA (Word/Excel/PDF/fotos enviados em base64 sem servidor de blob próprio).
const bodyLimit = process.env.API_BODY_LIMIT || '20mb'

// Origens confiáveis do DentalPos e allowlist de origem: ver modules/seguranca/origem.ts (mesma regra do CORS e do originGuard).

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1)
}

app.disable('x-powered-by')
app.use(requestContext)

// Barreira de origem (POST/PUT/PATCH/DELETE vindos de outro site => 403 + SegEvento). Sem Origin (webhooks/cron) passa.
app.use('/api', originGuard)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (origemPermitida(origin)) return callback(null, true)
      return callback(new Error('Origem não autorizada pelo CORS.'))
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Clinic-ID', 'X-Tenant-ID', 'X-Request-ID', 'Idempotency-Key', 'X-HR-Vault']
  })
)

app.use(
  helmet({
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false
  })
)
// Cabeçalhos extras da API (depois do helmet para prevalecerem sobre os padrões dele).
app.use('/api', apiSecurityHeaders)
app.use(compression())
// LGPD: o log de acesso HTTP nunca registra token/senha/CPF completo (query string e caminho são sanitizados) e
// qualquer console.* passa por redação (JWT, Bearer, senha=..., CPF formatado).
instalarLogSeguro()
morgan.token('url', (req) => sanitizarUrl(String((req as any).originalUrl || req.url || '')))
morgan.token('referrer', (req) => sanitizarUrl(String(req.headers.referer || req.headers.referrer || '')) || undefined as any)
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

// Prazo da demonstração: com DEMO_EXPIRES_AT (ISO) definido, informa a data e bloqueia a API depois dela.
app.get('/api/demo-info', (_req, res) => {
  const raw = process.env.DEMO_EXPIRES_AT
  const t = raw ? Date.parse(raw) : NaN
  if (!Number.isFinite(t)) return res.json({ expiresAt: null, expired: false, daysLeft: null })
  const ms = t - Date.now()
  res.json({ expiresAt: new Date(t).toISOString(), expired: ms <= 0, daysLeft: Math.max(0, Math.ceil(ms / 86400000)) })
})
// Nunca bloquear a API inteira por DEMO_EXPIRES_AT: isso derrubaria também contas que não são de demonstração
// (ex.: o proprietário). O bloqueio de quem é de fato conta de demonstração é por usuário, via accessExpiresAt
// (ver edu-demo-user.ts, edu-guest-user.ts, edu-uninga-test-users.ts e o check em authController.ts).

// Limite por IP + conta: o campus compartilha poucos IPs (NAT), então um limite só por IP bloquearia alunos legítimos.
// O limite por IP sozinho (AUTH_RATE_LIMIT_IP_MAX) segura varredura de várias contas a partir de uma única origem.
const contaDoPedido = (req: any) => String(req.body?.email || req.body?.cpf || req.body?.login || '').trim().toLowerCase().slice(0, 120)
const authLimiterIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_IP_MAX || 1500),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }
})
const authLimiterConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  keyGenerator: (req: any) => `${req.ip}|${contaDoPedido(req)}`,
  skipSuccessfulRequests: true, // só tentativas que falham contam: login legítimo repetido não bloqueia ninguém
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' }
})

const authLimiter: import('express').RequestHandler = (req, res, next) => authLimiterIp(req, res, (e?: unknown) => (e ? next(e) : authLimiterConta(req, res, next)))

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_MAX || 20000), // campus com NAT: muitos usuários por IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite temporário de requisições atingido.' }
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/password-reset/request', authLimiter)
app.use('/api/auth/password-reset/confirm', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/2fa/verify', authLimiter)
app.use('/api/auth/device/status', authLimiter)
// Acesso direto à demonstração por link (sem digitar login e senha). Só existe com DEMO_ACCESS_KEY definida.
// Compara em tempo constante só quando os tamanhos batem (evita lançar em chaves de tamanhos diferentes).
function chaveConfere(enviada: Buffer, candidata: string): boolean {
  if (!candidata) return false
  const c = Buffer.from(candidata)
  return enviada.length === c.length && timingSafeEqual(enviada, c)
}

// PROSPECT_USERS_JSON (opcional): vários links de demonstração ativos ao mesmo tempo, um por instituição/contato
// interessado, cada um com sua própria chave de acesso e e-mail de login. Formato: [{"accessKey":"...","email":"..."}, ...]
function prospectDemoEmail(enviada: Buffer): string | null {
  try {
    const lista = JSON.parse(process.env.PROSPECT_USERS_JSON || '[]')
    if (!Array.isArray(lista)) return null
    for (const item of lista) {
      if (chaveConfere(enviada, String(item?.accessKey || ''))) return String(item?.email || '').toLowerCase() || null
    }
  } catch { /* PROSPECT_USERS_JSON ausente ou inválida: ignora */ }
  return null
}

app.post('/api/demo-acesso', authLimiter, async (req, res) => {
  try {
    const enviada = Buffer.from(String(req.body?.k || ''))
    const email = chaveConfere(enviada, String(process.env.DEMO_ACCESS_KEY || ''))
      ? String(process.env.DEMO_ACCESS_EMAIL || 'apresentacao@uninga.br').toLowerCase()
      : prospectDemoEmail(enviada)
    if (!email) return res.status(403).json({ error: 'Link de acesso inválido.' })
    const user = await prisma.user.findFirst({ where: { email, isActive: true }, orderBy: { createdAt: 'asc' } })
    if (!user) return res.status(404).json({ error: 'Usuário da demonstração não encontrado.' })
    const demo = await getDemoAccess(user.clinicId)
    return res.json(await concluirLogin(req, user as any, demo, 'Acesso direto à demonstração.'))
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: 'Erro interno do servidor.' })
  }
})
montarLoginFacial(app, authLimiter)
app.use('/api/demo/register', authLimiter)
app.use('/api', apiLimiter)

app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    application: 'CompletoDonto',
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

    const clientStatus = Number(err?.status || err?.statusCode)
    const status = err?.message === 'Origem não autorizada pelo CORS.' ? 403 : clientStatus >= 400 && clientStatus < 500 ? clientStatus : 500
    return res.status(status).json({
      error: status === 403 ? err.message : status === 413 ? 'Corpo da requisição acima do limite permitido.' : status < 500 ? 'Requisição inválida.' : 'Erro interno do servidor.',
      requestId: contextReq.requestId
    })
  }
)

export default app