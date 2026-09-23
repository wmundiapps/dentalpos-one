import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { config, isProduction } from './config'
import { errorHandler } from './lib/errors'
import { requireAuth, requireSuperadmin } from './middleware/auth'
// Registra os handlers da fila.
import './services/automations'
import './services/campaigns'
import './services/voice/engine'
import adminRoutes from './routes/admin'
import authRoutes from './routes/auth'
import automationRoutes from './routes/automations'
import billingRoutes from './routes/billing'
import campaignRoutes from './routes/campaigns'
import channelRoutes from './routes/channels'
import cronRoutes from './routes/cron'
import crmRoutes from './routes/crm'
import inboxRoutes from './routes/inbox'
import integrationRoutes from './routes/integrations'
import leadRoutes from './routes/leads'
import publicRoutes from './routes/public'
import settingsRoutes from './routes/settings'
import voiceRoutes from './routes/voice'
import webhookRoutes from './routes/webhooks'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  const allowed = new Set([config.appUrl, config.siteUrl, 'https://revah.com.br', 'https://www.revah.com.br', 'https://app.revah.com.br', ...config.corsOrigins])
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowed.has(origin) || (!isProduction && /^http:\/\/localhost:\d+$/.test(origin))) return cb(null, true)
        // Netlify (site estático atual) e previews.
        if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin)) return cb(null, true)
        cb(null, false)
      },
      credentials: true,
    }),
  )
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))
  app.use(compression())

  // Guarda o corpo bruto (assinaturas Stripe/Meta/DentalPos).
  const keepRaw = (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf
  }
  app.use(express.json({ limit: '6mb', verify: keepRaw }))
  app.use(express.urlencoded({ extended: false, limit: '1mb', verify: keepRaw }))

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } })
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false })

  app.get('/', (_req, res) => res.json({ service: 'REVAH API', docs: '/health' }))
  app.use(publicRoutes)
  app.use(cronRoutes)
  app.use('/webhooks', webhookRoutes)
  app.use('/auth', (req, res, next) => (req.method === 'POST' ? authLimiter(req, res, next) : next()), authRoutes)
  app.use(apiLimiter)
  app.use(billingRoutes)
  app.use(integrationRoutes)

  const authed = express.Router()
  authed.use(requireAuth)
  authed.use(crmRoutes, channelRoutes, campaignRoutes, inboxRoutes, automationRoutes, voiceRoutes, leadRoutes, settingsRoutes)
  authed.use('/admin', requireSuperadmin)
  authed.use(adminRoutes)
  app.use(authed)

  app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }))
  app.use(errorHandler)
  return app
}

const app = createApp()
export default app
