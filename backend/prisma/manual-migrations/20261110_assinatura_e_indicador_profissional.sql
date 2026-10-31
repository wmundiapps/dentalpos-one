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
  "cardTokenEnc" TEXT,
  "debtAtCancel" NUMERIC(12,2) NOT NULL DEFAULT 0,
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

-- ===== Indicador profissional: pacientes procuram profissionais (so por cidade, contato so pelo sistema) =====
CREATE TABLE IF NOT EXISTS "ProfessionalListing" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL UNIQUE,
  "tenantId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "displayName" TEXT NOT NULL,
  "specialty" TEXT,
  "city" TEXT NOT NULL,
  "citySlug" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "services" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "about" TEXT,
  "channels" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "consentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ProfessionalListing_active_citySlug_idx" ON "ProfessionalListing" ("active", "citySlug");

CREATE TABLE IF NOT EXISTS "ProfessionalLead" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "whatsapp" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "citySlug" TEXT NOT NULL,
  "state" TEXT,
  "service" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ProfessionalLead_whatsapp_createdAt_idx" ON "ProfessionalLead" ("whatsapp", "createdAt");
CREATE INDEX IF NOT EXISTS "ProfessionalLead_ipHash_createdAt_idx" ON "ProfessionalLead" ("ipHash", "createdAt");

CREATE TABLE IF NOT EXISTS "ProfessionalLeadReveal" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "citySlug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("leadId", "citySlug")
);

CREATE TABLE IF NOT EXISTS "ProfessionalLeadContact" (
  "id" TEXT PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ENVIADO',
  "channels" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("leadId", "listingId")
);
CREATE INDEX IF NOT EXISTS "ProfessionalLeadContact_clinicId_createdAt_idx" ON "ProfessionalLeadContact" ("clinicId", "createdAt");

ALTER TABLE "ProfessionalListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfessionalLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfessionalLeadReveal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProfessionalLeadContact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProfessionalListing", "ProfessionalLead", "ProfessionalLeadReveal", "ProfessionalLeadContact" FROM anon, authenticated;
