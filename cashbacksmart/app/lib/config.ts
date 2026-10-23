const int = (name: string, def: number) => {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};

export const config = {
  appName: 'Cashbacksmart',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Cliente: grátis. Premium opcional (saldo nunca expira): R$ 4/mês, cobrado uma vez por ano
  premiumMonthlyCents: int('PREMIUM_MONTHLY_CENTS', 400),
  // Loja: 6 meses grátis, depois R$ 49,90/mês + 20% sobre o cashback que o cliente usar (resgatado)
  businessTrialDays: int('BUSINESS_TRIAL_DAYS', 180),
  businessMonthlyCents: int('BUSINESS_MONTHLY_CENTS', 4990),
  cashbackFeeBps: int('CASHBACK_FEE_BPS', 2000),
  feeBase: (process.env.FEE_BASE === 'granted' ? 'granted' : 'redeemed') as 'granted' | 'redeemed',
  feeDuringTrial: process.env.FEE_DURING_TRIAL !== '0',

  invoiceDueDays: int('INVOICE_DUE_DAYS', 3),
  graceDays: int('GRACE_DAYS', 5),
  cancelWindowDays: int('CANCEL_WINDOW_DAYS', 7),
  localCampaignsPerMonth: int('LOCAL_CAMPAIGNS_PER_MONTH', 4),
  redemptionCodeMinutes: int('REDEMPTION_CODE_MINUTES', 15),
  minExpiresDays: int('MIN_EXPIRES_DAYS', 30),

  // Indicação: o indicado ganha 30 dias de Premium e quem indicou ganha +30 dias (até 12 por ano)
  referralBonusDays: int('REFERRAL_BONUS_DAYS', 30),
  referralMaxPerYear: int('REFERRAL_MAX_PER_YEAR', 12),

  // Nota fiscal enviada pelo cliente
  claimMaxPerDay: int('CLAIM_MAX_PER_DAY', 5),
  claimMaxPerMonth: int('CLAIM_MAX_PER_MONTH', 20),
  claimMaxCents: int('CLAIM_MAX_CENTS', 500000),
  claimAutoApproveHours: int('CLAIM_AUTO_APPROVE_HOURS', 48),
  claimAutoApproveMaxCents: int('CLAIM_AUTO_APPROVE_MAX_CENTS', 30000),
  claimMergeHours: int('CLAIM_MERGE_HOURS', 3),
  claimRejectBlock: int('CLAIM_REJECT_BLOCK', 3),

  // Celular verificado por SMS é exigido para promoções de boas-vindas e envio de notas
  requirePhoneVerification: process.env.REQUIRE_PHONE_VERIFICATION
    ? process.env.REQUIRE_PHONE_VERIFICATION === '1'
    : !!process.env.TWILIO_ACCOUNT_SID,
};

export function premiumPriceCents() {
  return config.premiumMonthlyCents * 12;
}

export const CATEGORIES = [
  'Alimentação', 'Mercado', 'Farmácia', 'Beleza e estética', 'Saúde', 'Moda', 'Casa e construção',
  'Automotivo', 'Pets', 'Educação', 'Serviços', 'Academia e esporte', 'Eletrônicos', 'Outros',
];

export const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
