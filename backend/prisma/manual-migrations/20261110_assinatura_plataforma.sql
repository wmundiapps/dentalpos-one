-- Assinatura da clinica: teste de 30 dias com cartao e cobranca automatica (50% por 12 meses).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Confira o nome do projeto no canto da tela.
CREATE TABLE IF NOT EXISTS "PlatformSubscription" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL UNIQUE,
  "tenantId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "fullPrice" NUMERIC(12,2) NOT NULL,
  "promoPrice" NUMERIC(12,2) NOT NULL,
  "promoCycles" INTEGER NOT NULL DEFAULT 12,
  "cyclesPaid" INTEGER NOT NULL DEFAULT 0,
  "paidPaymentIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "trialDays" INTEGER NOT NULL DEFAULT 30,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "accessUntil" TIMESTAMP(3),
  "fullPriceAppliedAt" TIMESTAMP(3),
  "asaasCustomerId" TEXT,
  "asaasSubscriptionId" TEXT,
  "cardBrand" TEXT,
  "cardLast4" TEXT,
  "reminderSentAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "lastEvent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PlatformSubscription_status_trialEndsAt_idx" ON "PlatformSubscription" ("status", "trialEndsAt");
CREATE INDEX IF NOT EXISTS "PlatformSubscription_asaasSubscriptionId_idx" ON "PlatformSubscription" ("asaasSubscriptionId");
-- Sem acesso para anon/authenticated: so o backend (service role) le e escreve.
ALTER TABLE "PlatformSubscription" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PlatformSubscription" FROM anon, authenticated;
