// Configuração por variáveis de ambiente (nada de segredo no código).
const env = process.env;
const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: num(env.PORT, 4100),
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  /** Origens aceitas em requisições que alteram dados (proteção contra CSRF). */
  allowedOrigins: (env.ALLOWED_ORIGINS ?? env.APP_URL ?? 'http://localhost:5173,http://localhost:4100').split(',').map((s) => s.trim()).filter(Boolean),
  /** Teto opcional da taxa em centavos (0 = sem teto). Decisão comercial: ver README. */
  feeCapCents: num(env.FEE_CAP_CENTS, 0),
  /** Dias para pagar a taxa depois de marcar como vendido. */
  feeDueDays: num(env.FEE_DUE_DAYS, 7),
  /** Dias de atraso para travar a criação de novos anúncios. */
  feeBlockAfterDays: num(env.FEE_BLOCK_AFTER_DAYS, 3),
  /** Preço declarado abaixo disto (fração do maior preço anunciado) vira alerta de sub-declaração. */
  underDeclareRatio: num(env.UNDER_DECLARE_RATIO, 0.7),
  /** Nº de anúncios de "Outros" com o mesmo termo para criar um grupo automático. */
  outrosGroupMin: num(env.OUTROS_GROUP_MIN, 5),
  outrosGroupWindowDays: num(env.OUTROS_GROUP_WINDOW_DAYS, 90),
  /** Anúncios novos de quem ainda não foi verificado: 0 = só verificados publicam. */
  allowUnverifiedPublish: env.ALLOW_UNVERIFIED_PUBLISH === 'true',
  /** Anúncios com risco alto vão para revisão manual antes de ir ao ar. */
  reviewRiskThreshold: num(env.REVIEW_RISK_THRESHOLD, 40),
  blockRiskThreshold: num(env.BLOCK_RISK_THRESHOLD, 80),
  retentionOriginDays: num(env.RETENTION_ORIGIN_DAYS, 365 * 5),
  company: {
    name: env.COMPANY_NAME ?? '[RAZÃO SOCIAL DA OPERADORA]',
    cnpj: env.COMPANY_CNPJ ?? '[CNPJ]',
    address: env.COMPANY_ADDRESS ?? '[ENDEREÇO]',
    dpo: env.DPO_NAME ?? '[ENCARREGADO(A) PELO TRATAMENTO DE DADOS]',
  },
  payments: {
    provider: (env.PAYMENT_PROVIDER ?? (env.MP_ACCESS_TOKEN ? 'mercadopago' : 'mock')) as 'mock' | 'mercadopago',
    mpToken: env.MP_ACCESS_TOKEN ?? '',
    mpWebhookSecret: env.MP_WEBHOOK_SECRET ?? '',
  },
  smtp: { host: env.SMTP_HOST ?? '', port: num(env.SMTP_PORT, 587), user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '', from: env.MAIL_FROM ?? 'Vendeu <nao-responda@vendeu.app>' },
  blobToken: env.BLOB_READ_WRITE_TOKEN ?? '',
};

export function assertProductionConfig() {
  if (!config.isProd) return;
  const missing = ['DATABASE_URL', 'JWT_SECRET', 'DOCUMENT_ENCRYPTION_KEY', 'HASH_PEPPER'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variáveis ausentes em produção: ${missing.join(', ')}`);
  if (config.payments.provider === 'mock') throw new Error('PAYMENT_PROVIDER=mock não pode ser usado em produção');
}
