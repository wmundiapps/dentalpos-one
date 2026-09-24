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
    // Vendas internacionais: cartão. Adicione boleto/pix se a conta Stripe permitir.
    paymentMethods: list(process.env.STRIPE_PAYMENT_METHODS || 'card'),
  },

  // Asaas: vendas no Brasil (Pix, boleto e cartão), assinatura mensal.
  asaas: {
    apiKey: process.env.ASAAS_API_KEY || '',
    baseUrl: (process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3').replace(/\/$/, ''),
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || '',
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
  ai: 'basic' | 'advanced'
  templates: number | null
  integrations: number | null // chaves de API / integrações de CRM
  csvImport: boolean
}

// Limites por plano, iguais aos anunciados em revah.com.br (ajustáveis por PLAN_LIMITS_JSON).
// TRIAL = conta criada que ainda não cadastrou a forma de pagamento.
const defaultLimits: Record<Plan, PlanLimits> = {
  TRIAL: { users: 1, channels: 2, monthlyMessages: 0, voice: false, ai: 'basic', templates: 5, integrations: 0, csvImport: false },
  START: { users: 3, channels: 3, monthlyMessages: 5000, voice: false, ai: 'basic', templates: 5, integrations: 1, csvImport: false },
  PRO: { users: 10, channels: null, monthlyMessages: 25000, voice: true, ai: 'advanced', templates: null, integrations: null, csvImport: true },
  ENTERPRISE: { users: null, channels: null, monthlyMessages: null, voice: true, ai: 'advanced', templates: null, integrations: null, csvImport: true },
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

// Teste grátis: 14 dias com a forma de pagamento cadastrada; até 20 contatos por campanha no período.
export const TRIAL_RULES = {
  days: Number(process.env.TRIAL_DAYS || 14),
  maxRecipientsPerCampaign: 20,
  maxMessages: Number(process.env.TRIAL_MAX_MESSAGES || 1000),
}

export const PLAN_PRICES_BRL: Record<'START' | 'PRO', number> = {
  START: Number(process.env.PRICE_START_BRL || 247),
  PRO: Number(process.env.PRICE_PRO_BRL || 597),
}
export const LEADS_PRICE_BRL = Number(process.env.PRICE_LEADS_BRL || 0)
