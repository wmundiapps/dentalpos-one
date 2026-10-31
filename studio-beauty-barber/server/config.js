// Configuração central. Tudo vem de variáveis de ambiente (ver .env.example).
// Segredos NUNCA ficam no código nem no GitHub: só em Railway/Vercel/Supabase.
import { randomBytes } from 'node:crypto';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function secret(name, devValue) {
  const v = env[name];
  if (v && v.length >= 32) return v;
  if (isProd) {
    throw new Error(`Variável ${name} obrigatória em produção (mínimo 32 caracteres).`);
  }
  return devValue;
}

const port = Number(env.PORT || 3000);
// Em desenvolvimento/piloto, canais sem credencial "simulam" o envio. Em produção, falham com aviso claro.
const simulate = env.SIMULATE_MESSAGING ? env.SIMULATE_MESSAGING === 'true' : !isProd;

export const cfg = {
  isProd,
  port,
  simulate,
  baseUrl: env.BASE_URL || `http://localhost:${port}`,
  appUrl: env.APP_URL || env.BASE_URL || `http://localhost:${port}`,
  landingUrl: env.LANDING_URL || 'https://studiobeautybarber.com',
  allowedOrigins: (env.ALLOWED_ORIGINS || 'https://studiobeautybarber.com,https://www.studiobeautybarber.com')
    .split(',').map((s) => s.trim()).filter(Boolean),

  databaseUrl: env.DATABASE_URL || '',
  sqlitePath: env.SQLITE_PATH || './data/sbb.db',

  appSecret: secret('APP_SECRET', 'dev-only-secret-change-me-0123456789abcdef'),
  encKey: secret('APP_ENC_KEY', 'dev-only-encryption-key-change-me-0123456789'),

  sessionDays: Number(env.SESSION_DAYS || 7),
  hqSlug: env.HQ_SLUG || 'studiobeautybarber-hq',
  // Código de recuperação do dono da plataforma (definido por ele na Vercel). Permite criar nova senha sem e-mail.
  recoveryCode: env.RECOVERY_CODE || '',

  // Integrações globais (da plataforma, para cobrar os assinantes)
  asaas: {
    apiKey: env.ASAAS_API_KEY || '',
    sandbox: env.ASAAS_SANDBOX !== 'false',
    webhookToken: env.ASAAS_WEBHOOK_TOKEN || '',
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  },
  meta: {
    appSecret: env.META_APP_SECRET || '',
    verifyToken: env.META_VERIFY_TOKEN || randomBytes(8).toString('hex'),
    graphVersion: env.META_GRAPH_VERSION || 'v21.0',
  },
  email: {
    resendKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'Studio Beauty Barber <contato@studiobeautybarber.com>',
  },
  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  },
  clamav: {
    host: env.CLAMAV_HOST || '',
    port: Number(env.CLAMAV_PORT || 3310),
  },
  turnstile: {
    secret: env.TURNSTILE_SECRET || '',
    siteKey: env.TURNSTILE_SITE_KEY || '',
  },

  // Preços dos planos (centavos). Acima de 20 profissionais: plano sob demanda, negociado à parte.
  plans: {
    smart: { name: 'Smart Individual', cents: 5990, staff: 1 },
    pequeno: { name: 'Pequeno', cents: 12900, staff: 3 },
    medio: { name: 'Médio', cents: 24900, staff: 8 },
    grande: { name: 'Grande', cents: 55900, staff: 20 },
  },
  trialDays: Number(env.TRIAL_DAYS || 30),

  // Limites
  maxBodyBytes: 1_000_000,
  maxUploadBytes: 2_000_000,
};
