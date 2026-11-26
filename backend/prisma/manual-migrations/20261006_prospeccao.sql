-- DentalPos One — Prospecção (captador de leads da Receita Federal)
-- Rodar no SQL Editor do Supabase, projeto "DentalPos One" (ref lfeqfzvmasqnnmqvkjyg), ANTES de publicar o código.

CREATE TABLE IF NOT EXISTS "ProspectLead" (
  "id"            TEXT PRIMARY KEY,
  "cnpj"          TEXT NOT NULL,
  "razaoSocial"   TEXT NOT NULL,
  "nomeFantasia"  TEXT,
  "displayName"   TEXT NOT NULL,
  "email"         TEXT,
  "emailType"     TEXT,                       -- CORPORATIVO | WEBMAIL
  "phone1"        TEXT,
  "phone2"        TEXT,
  "uf"            TEXT NOT NULL,
  "city"          TEXT,
  "bairro"        TEXT,
  "cep"           TEXT,
  "address"       TEXT,
  "cnaePrincipal" TEXT,
  "segment"       TEXT NOT NULL DEFAULT 'CLINICA', -- CLINICA | LABORATORIO
  "naturezaJuridica" TEXT,
  "porte"         TEXT,
  "openedAt"      TEXT,
  "isMatriz"      BOOLEAN NOT NULL DEFAULT TRUE,
  "source"        TEXT NOT NULL DEFAULT 'RECEITA_FEDERAL',
  "status"        TEXT NOT NULL DEFAULT 'NOVO',    -- NOVO | EM_SEQUENCIA | SEQUENCIA_CONCLUIDA | QUENTE | RESPONDEU | CONVERTIDO | DESCADASTRADO | BOUNCE | EXCLUIDO
  "lastStep"      INTEGER NOT NULL DEFAULT 0,
  "firstSentAt"   TIMESTAMP(3),
  "lastSentAt"    TIMESTAMP(3),
  "hotAt"         TIMESTAMP(3),
  "token"         TEXT NOT NULL,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProspectLead_cnpj_key"  ON "ProspectLead" ("cnpj");
CREATE UNIQUE INDEX IF NOT EXISTS "ProspectLead_token_key" ON "ProspectLead" ("token");
CREATE INDEX IF NOT EXISTS "ProspectLead_status_idx" ON "ProspectLead" ("status", "lastSentAt");
CREATE INDEX IF NOT EXISTS "ProspectLead_email_idx"  ON "ProspectLead" ("email");

CREATE TABLE IF NOT EXISTS "ProspectEvent" (
  "id"         TEXT PRIMARY KEY,
  "leadId"     TEXT NOT NULL REFERENCES "ProspectLead"("id") ON DELETE CASCADE,
  "type"       TEXT NOT NULL,   -- IMPORTADO | ENVIO | ERRO_ENVIO | CLIQUE | DESCADASTRO | BOUNCE | RECLAMACAO | RESPOSTA | CONVERTIDO | STATUS
  "step"       INTEGER,
  "detail"     TEXT,
  "providerId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProspectEvent_lead_idx"     ON "ProspectEvent" ("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProspectEvent_provider_idx" ON "ProspectEvent" ("providerId");
CREATE INDEX IF NOT EXISTS "ProspectEvent_type_idx"     ON "ProspectEvent" ("type", "createdAt");

-- Lista de bloqueio: quem pediu para sair, deu bounce ou reclamou NUNCA recebe de novo, mesmo se reimportado.
CREATE TABLE IF NOT EXISTS "ProspectSuppression" (
  "email"     TEXT PRIMARY KEY,
  "reason"    TEXT NOT NULL,     -- DESCADASTRO | BOUNCE | RECLAMACAO | MANUAL
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ProspectConfig" (
  "id"             TEXT PRIMARY KEY,
  "sendingEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "dailyLimit"     INTEGER NOT NULL DEFAULT 10,
  "step2AfterDays" INTEGER NOT NULL DEFAULT 3,
  "step3AfterDays" INTEGER NOT NULL DEFAULT 7,
  "sendToWebmail"  BOOLEAN NOT NULL DEFAULT TRUE,
  "segments"       TEXT NOT NULL DEFAULT 'CLINICA',
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "ProspectConfig" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

-- Dados de prospecção não ficam expostos pela API pública do Supabase.
ALTER TABLE "ProspectLead"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectEvent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectSuppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProspectConfig"      ENABLE ROW LEVEL SECURITY;
