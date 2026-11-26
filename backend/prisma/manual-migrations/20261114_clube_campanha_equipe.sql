-- Clube da clinica: campanha da equipe (vendas, origem do paciente, meta e premiacao), cashback e avaliacoes (equipe e paciente).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Confira o nome do projeto no canto da tela.
-- Nada aqui apaga ou altera dados existentes: so cria tabelas novas.

-- Configuracao da campanha por clinica (meta, valores da premiacao, cashback, e-mails do gestor, token do link publico de avaliacao).
CREATE TABLE IF NOT EXISTS "ClubSettings" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL UNIQUE,
  "tenantId" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "surveyToken" TEXT NOT NULL UNIQUE,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Origem do paciente (define se entra na comissao da equipe). Uma linha por paciente.
CREATE TABLE IF NOT EXISTS "PatientOrigin" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL UNIQUE,
  "origin" TEXT NOT NULL,
  "detail" TEXT,
  "setByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PatientOrigin_clinicId_origin_idx" ON "PatientOrigin" ("clinicId", "origin");

-- Vendas e pagamentos do Clube (formulario da equipe).
-- kind: MANUTENCAO (contrato novo de manutencao, valor = 1a parcela), MENSALIDADE (parcelas seguintes),
--       ADESAO (pagamento unico), TRATAMENTO (contrato de tratamento).
CREATE TABLE IF NOT EXISTS "ClubSale" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "saleDate" DATE NOT NULL,
  "captureChannel" TEXT NOT NULL,
  "sellerIds" TEXT[] NOT NULL DEFAULT '{}',
  "mainSellerId" TEXT,
  "notes" TEXT,
  "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "paymentConfirmedAt" TIMESTAMP(3),
  "paymentConfirmedBy" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ClubSale_clinicId_saleDate_idx" ON "ClubSale" ("clinicId", "saleDate");
CREATE INDEX IF NOT EXISTS "ClubSale_clinicId_patientId_idx" ON "ClubSale" ("clinicId", "patientId");

-- Participantes do cashback (cadastro no Cashbacksmart da clinica).
CREATE TABLE IF NOT EXISTS "CashbackMember" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL UNIQUE,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "freeUntil" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- Lotes de cashback: cada credito vira um lote com saldo e validade; usos e transferencias consomem os lotes que vencem primeiro.
CREATE TABLE IF NOT EXISTS "CashbackLot" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "remaining" DOUBLE PRECISION NOT NULL,
  "expiresAt" DATE NOT NULL,
  "saleId" TEXT,
  "fromPatientId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CashbackLot_clinicId_patientId_expiresAt_idx" ON "CashbackLot" ("clinicId", "patientId", "expiresAt");

-- Movimentos de cashback (credito, uso, transferencia), para o extrato.
CREATE TABLE IF NOT EXISTS "CashbackMove" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "counterpartPatientId" TEXT,
  "relation" TEXT,
  "saleId" TEXT,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CashbackMove_clinicId_patientId_idx" ON "CashbackMove" ("clinicId", "patientId");

-- Avaliacao semanal da equipe (autoavaliacao e colega). So o gestor le.
CREATE TABLE IF NOT EXISTS "TeamEvaluation" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "weekKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "evaluatorUserId" TEXT NOT NULL,
  "evaluatedUserId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("clinicId", "weekKey", "evaluatorUserId", "evaluatedUserId")
);
CREATE INDEX IF NOT EXISTS "TeamEvaluation_clinicId_weekKey_idx" ON "TeamEvaluation" ("clinicId", "weekKey");

-- Avaliacao do paciente (identificada ou anonima), pelo link publico da clinica.
CREATE TABLE IF NOT EXISTS "PatientSurvey" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "anonymous" BOOLEAN NOT NULL DEFAULT true,
  "name" TEXT,
  "phone" TEXT,
  "answers" JSONB NOT NULL,
  "recommend" INTEGER NOT NULL,
  "highlightStaff" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PatientSurvey_clinicId_createdAt_idx" ON "PatientSurvey" ("clinicId", "createdAt");

ALTER TABLE "ClubSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientOrigin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubSale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbackMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbackLot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbackMove" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeamEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientSurvey" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClubSettings", "PatientOrigin", "ClubSale", "CashbackMember", "CashbackLot", "CashbackMove", "TeamEvaluation", "PatientSurvey" FROM anon, authenticated;
