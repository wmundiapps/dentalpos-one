import dotenv from 'dotenv'

dotenv.config()

function list(v?: string) {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean)
}

export const isProduction = process.env.NODE_ENV === 'production'

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'revah-dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  publicApiUrl: (process.env.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
  appUrl: (process.env.APP_URL || 'http://localhost:5174').replace(/\/$/, ''),
  siteUrl: (process.env.SITE_URL || 'https://revah.com.br').replace(/\/$/, ''),
  corsOrigins: list(process.env.CORS_ORIGINS),
  cronSecret: process.env.CRON_SECRET || '',
  superadminEmails: list(process.env.REVAH_SUPERADMIN_EMAILS).map((e) => e.toLowerCase()),

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      START: process.env.STRIPE_PRICE_START || '',
      PRO: process.env.STRIPE_PRICE_PRO || '',
      LEADS: process.env.STRIPE_PRICE_LEADS || '',
    },
    // Pix recorrente depende da conta Stripe; habilite adicionando "pix" quando disponível.
    paymentMethods: list(process.env.STRIPE_PAYMENT_METHODS || 'card,boleto'),
  },

  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.REVAH_AI_MODEL || 'claude-opus-5',
  },

  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || '',
    appSecret: process.env.META_APP_SECRET || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
  },

  leads: {
    googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || '',
    termsVersion: process.env.LEADS_TERMS_VERSION || '2026-09-v1',
  },

  dentalpos: {
    // Segredo compartilhado com o DentalPos One (SSO + provisionamento servidor-a-servidor).
    sharedSecret: process.env.DENTALPOS_SHARED_SECRET || '',
  },

  systemEmail: {
    // Usa a mesma conta Resend do DentalPos (domínio dentalpos.com.br verificado) se não houver uma própria.
    resendKey: process.env.REVAH_SYSTEM_RESEND_KEY || process.env.RESEND_API_KEY || '',
    from: process.env.REVAH_SYSTEM_EMAIL_FROM || 'REVAH <contato@dentalpos.com.br>',
    // Recebe o aviso de cada conta nova criada.
    adminNotify: process.env.REVAH_ADMIN_NOTIFY_EMAIL || 'contato@dentalpos.com.br',
  },

  worker: {
    batchSize: Number(process.env.WORKER_BATCH_SIZE || 25),
    // Intervalo mínimo entre envios de campanha no mesmo canal (ms) — protege a reputação do número.
    campaignThrottleMs: Number(process.env.CAMPAIGN_THROTTLE_MS || 1500),
  },
}

export type Plan = 'TRIAL' | 'START' | 'PRO' | 'ENTERPRISE'

export interface PlanLimits {
  users: number | null
  channels: number | null
  monthlyMessages: number | null
  voice: boolean
  ai: boolean
}

// Limites operacionais por plano (ajustáveis por PLAN_LIMITS_JSON sem novo deploy de código).
const defaultLimits: Record<Plan, PlanLimits> = {
  TRIAL: { users: 1, channels: 2, monthlyMessages: 100, voice: false, ai: true },
  START: { users: 3, channels: 3, monthlyMessages: 10000, voice: false, ai: true },
  PRO: { users: 10, channels: null, monthlyMessages: 50000, voice: true, ai: true },
  ENTERPRISE: { users: null, channels: null, monthlyMessages: null, voice: true, ai: true },
}

function loadLimits(): Record<Plan, PlanLimits> {
  try {
    const raw = process.env.PLAN_LIMITS_JSON
    if (!raw) return defaultLimits
    const parsed = JSON.parse(raw)
    return {
      TRIAL: { ...defaultLimits.TRIAL, ...parsed.TRIAL },
      START: { ...defaultLimits.START, ...parsed.START },
      PRO: { ...defaultLimits.PRO, ...parsed.PRO },
      ENTERPRISE: { ...defaultLimits.ENTERPRISE, ...parsed.ENTERPRISE },
    }
  } catch {
    return defaultLimits
  }
}

export const planLimits = loadLimits()

// Regra de negócio definida: 2 campanhas grátis, até 20 contatos cada.
export const TRIAL_RULES = { maxCampaigns: 2, maxRecipientsPerCampaign: 20 }

export const PLAN_PRICES_BRL: Record<Exclude<Plan, 'TRIAL' | 'ENTERPRISE'>, number> = {
  START: 197,
  PRO: 497,
}
