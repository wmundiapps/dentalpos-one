-- Atendimento automatico de vendas no WhatsApp (leads da campanha e historico das conversas).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Confira o nome do projeto no canto da tela.
CREATE TABLE IF NOT EXISTS "MarketingLead" (
  "id" TEXT PRIMARY KEY,
  "whatsapp" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "email" TEXT,
  "clinicName" TEXT,
  "city" TEXT,
  "source" TEXT,
  "utm" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "consentAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'NOVO',
  "optOut" BOOLEAN NOT NULL DEFAULT false,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "MarketingLead_status_createdAt_idx" ON "MarketingLead" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "MarketingMessage" (
  "id" TEXT PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "waMessageId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "MarketingMessage_phone_createdAt_idx" ON "MarketingMessage" ("phone", "createdAt");

ALTER TABLE "MarketingLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MarketingLead", "MarketingMessage" FROM anon, authenticated;
