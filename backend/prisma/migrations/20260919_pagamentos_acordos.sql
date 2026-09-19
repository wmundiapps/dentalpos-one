-- =====================================================================
-- DentalPos One — Pagamentos e acordos financeiros
-- Arquivo: 20260919_pagamentos_acordos.sql
-- ONDE RODAR: SQL Editor do Supabase
--   https://supabase.com/dashboard/project/lfeqfzvmasqnnmqvkjyg/sql/new
-- NAO rodar no PowerShell. NAO usar prisma migrate nem db push.
-- Guardar copia em backend/prisma/migrations/
--
-- Tudo aqui e aditivo: CREATE TABLE IF NOT EXISTS.
-- Nenhuma tabela existente e alterada, renomeada ou apagada.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — CONTAS DE RECEBIMENTO E ACORDOS
-- =====================================================================

-- 1. Conta de recebimento de cada beneficiario (clinica ou profissional)
CREATE TABLE IF NOT EXISTS "PaymentAccount" (
  "id"                TEXT PRIMARY KEY,
  "clinicId"          TEXT NOT NULL,
  "provider"          TEXT NOT NULL DEFAULT 'ASAAS'
                      CHECK ("provider" IN ('ASAAS','IUGU','OUTRO')),
  "beneficiaryType"   TEXT NOT NULL
                      CHECK ("beneficiaryType" IN ('CLINICA','PROFISSIONAL')),
  "doctorId"          TEXT,
  "holderName"        TEXT NOT NULL,
  "holderDocument"    TEXT NOT NULL,
  "holderType"        TEXT NOT NULL CHECK ("holderType" IN ('PF','PJ')),
  "externalAccountId" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'PENDENTE'
                      CHECK ("status" IN ('PENDENTE','ATIVA','SUSPENSA','ENCERRADA')),
  "isDefault"         BOOLEAN NOT NULL DEFAULT false,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PaymentAccount_clinicId_idx" ON "PaymentAccount"("clinicId");
CREATE INDEX IF NOT EXISTS "PaymentAccount_doctorId_idx" ON "PaymentAccount"("doctorId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAccount_provider_external_key"
  ON "PaymentAccount"("provider","externalAccountId")
  WHERE "externalAccountId" IS NOT NULL;


-- 2. Acordo financeiro entre a clinica e o prestador
CREATE TABLE IF NOT EXISTS "PartnershipAgreement" (
  "id"                  TEXT PRIMARY KEY,
  "clinicId"            TEXT NOT NULL,
  "doctorId"            TEXT NOT NULL,
  "arrangement"         TEXT NOT NULL
                        CHECK ("arrangement" IN
                        ('PARTICIPACAO_PJ','PARTICIPACAO_PF','HONORARIO_TABELA',
                         'DIARIA','ARRENDAMENTO','CLT')),
  "professionalPercent" NUMERIC(5,2),
  "tableMode"           TEXT CHECK ("tableMode" IN
                        ('TABELA_FIXA','PERCENTUAL_LIQUIDO','PERCENTUAL_BRUTO')),
  "taxLoadPercent"      NUMERIC(5,2),
  "taxLoadReviewedAt"   DATE,
  "dailyRate"           NUMERIC(12,2),
  "rentAmount"          NUMERIC(12,2),
  "rentDueDay"          INTEGER CHECK ("rentDueDay" BETWEEN 1 AND 28),
  "defaultRisk"         TEXT NOT NULL DEFAULT 'COMPARTILHADA'
                        CHECK ("defaultRisk" IN ('COMPARTILHADA','CLINICA')),
  "separateFinance"     BOOLEAN NOT NULL DEFAULT false,
  "paymentDay"          INTEGER CHECK ("paymentDay" BETWEEN 1 AND 28),
  "startDate"           DATE NOT NULL DEFAULT CURRENT_DATE,
  "endDate"             DATE,
  "status"              TEXT NOT NULL DEFAULT 'ATIVO'
                        CHECK ("status" IN ('ATIVO','SUSPENSO','ENCERRADO')),
  "notes"               TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PartnershipAgreement_clinicId_idx" ON "PartnershipAgreement"("clinicId");
CREATE INDEX IF NOT EXISTS "PartnershipAgreement_doctorId_idx" ON "PartnershipAgreement"("doctorId");

-- CLT: a clinica carrega a inadimplencia sozinha
ALTER TABLE "PartnershipAgreement" DROP CONSTRAINT IF EXISTS "PartnershipAgreement_clt_risk_chk";
ALTER TABLE "PartnershipAgreement" ADD CONSTRAINT "PartnershipAgreement_clt_risk_chk"
  CHECK ("arrangement" <> 'CLT' OR "defaultRisk" = 'CLINICA');

-- Arrendamento: financeiro sempre separado da clinica
ALTER TABLE "PartnershipAgreement" DROP CONSTRAINT IF EXISTS "PartnershipAgreement_arrend_chk";
ALTER TABLE "PartnershipAgreement" ADD CONSTRAINT "PartnershipAgreement_arrend_chk"
  CHECK ("arrangement" <> 'ARRENDAMENTO' OR "separateFinance" = true);


-- 3. Tabela de precos do acordo, por procedimento
CREATE TABLE IF NOT EXISTS "AgreementProcedurePrice" (
  "id"                  TEXT PRIMARY KEY,
  "agreementId"         TEXT NOT NULL,
  "procedureCode"       TEXT,
  "procedureName"       TEXT NOT NULL,
  "grossAmount"         NUMERIC(12,2),
  "professionalAmount"  NUMERIC(12,2),
  "professionalPercent" NUMERIC(5,2),
  "active"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AgreementProcedurePrice_agreementId_idx"
  ON "AgreementProcedurePrice"("agreementId");


-- =====================================================================
-- PARTE 2 — COBRANCAS SEGMENTADAS, MEMORIA DE CALCULO, TERMO E WEBHOOK
-- =====================================================================

-- 4. Termo de ciencia da cobranca unica (bitributacao)
CREATE TABLE IF NOT EXISTS "SingleChargeTerm" (
  "id"             TEXT PRIMARY KEY,
  "clinicId"       TEXT NOT NULL,
  "agreementId"    TEXT,
  "patientId"      TEXT,
  "issuerAccountId" TEXT,
  "termVersion"    TEXT NOT NULL DEFAULT 'v1',
  "textSnapshot"   TEXT NOT NULL,
  "acceptedByUserId" TEXT NOT NULL,
  "acceptedByName" TEXT NOT NULL,
  "acceptedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedIp"     TEXT,
  "acceptedDevice" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SingleChargeTerm_clinicId_idx" ON "SingleChargeTerm"("clinicId");
CREATE INDEX IF NOT EXISTS "SingleChargeTerm_agreementId_idx" ON "SingleChargeTerm"("agreementId");


-- 5. Grupo de cobrancas de um tratamento (o "plano" visto pelo paciente)
CREATE TABLE IF NOT EXISTS "ChargeGroup" (
  "id"             TEXT PRIMARY KEY,
  "clinicId"       TEXT NOT NULL,
  "patientId"      TEXT NOT NULL,
  "treatmentPlanId" TEXT,
  "groupingMode"   TEXT NOT NULL DEFAULT 'BENEFICIARIO'
                   CHECK ("groupingMode" IN ('BENEFICIARIO','FASE','UNICA')),
  "totalAmount"    NUMERIC(12,2) NOT NULL DEFAULT 0,
  "singleChargeTermId" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'ABERTO'
                   CHECK ("status" IN ('ABERTO','QUITADO','CANCELADO')),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ChargeGroup_clinicId_idx"  ON "ChargeGroup"("clinicId");
CREATE INDEX IF NOT EXISTS "ChargeGroup_patientId_idx" ON "ChargeGroup"("patientId");

-- Cobranca unica so existe com termo de ciencia assinado
ALTER TABLE "ChargeGroup" DROP CONSTRAINT IF EXISTS "ChargeGroup_unica_exige_termo_chk";
ALTER TABLE "ChargeGroup" ADD CONSTRAINT "ChargeGroup_unica_exige_termo_chk"
  CHECK ("groupingMode" <> 'UNICA' OR "singleChargeTermId" IS NOT NULL);


-- 6. Cobranca individual, uma por beneficiario
CREATE TABLE IF NOT EXISTS "BeneficiaryCharge" (
  "id"                 TEXT PRIMARY KEY,
  "clinicId"           TEXT NOT NULL,
  "chargeGroupId"      TEXT NOT NULL,
  "paymentAccountId"   TEXT NOT NULL,
  "agreementId"        TEXT,
  "doctorId"           TEXT,
  "beneficiaryType"    TEXT NOT NULL
                       CHECK ("beneficiaryType" IN ('CLINICA','PROFISSIONAL')),
  "description"        TEXT NOT NULL,
  "grossAmount"        NUMERIC(12,2) NOT NULL,
  "discountAmount"     NUMERIC(12,2) NOT NULL DEFAULT 0,
  "financialCost"      NUMERIC(12,2) NOT NULL DEFAULT 0,
  "netAmount"          NUMERIC(12,2) NOT NULL,
  "paymentMethod"      TEXT NOT NULL
                       CHECK ("paymentMethod" IN ('BOLETO','PIX','CARTAO','DINHEIRO','PERMUTA','OUTRO')),
  "installments"       INTEGER NOT NULL DEFAULT 1 CHECK ("installments" >= 1),
  "interestOwner"      TEXT NOT NULL DEFAULT 'CLINICA'
                       CHECK ("interestOwner" IN ('CLINICA','PACIENTE')),
  "dueDate"            DATE NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'PENDENTE'
                       CHECK ("status" IN ('PENDENTE','PAGA','VENCIDA','CANCELADA','ESTORNADA')),
  "paidAt"             TIMESTAMP(3),
  "paidAmount"         NUMERIC(12,2),
  "externalChargeId"   TEXT,
  "externalInvoiceUrl" TEXT,
  "financialEntryId"   TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BeneficiaryCharge_clinicId_idx"      ON "BeneficiaryCharge"("clinicId");
CREATE INDEX IF NOT EXISTS "BeneficiaryCharge_chargeGroupId_idx" ON "BeneficiaryCharge"("chargeGroupId");
CREATE INDEX IF NOT EXISTS "BeneficiaryCharge_doctorId_idx"      ON "BeneficiaryCharge"("doctorId");
CREATE INDEX IF NOT EXISTS "BeneficiaryCharge_status_due_idx"    ON "BeneficiaryCharge"("status","dueDate");
CREATE UNIQUE INDEX IF NOT EXISTS "BeneficiaryCharge_external_key"
  ON "BeneficiaryCharge"("externalChargeId")
  WHERE "externalChargeId" IS NOT NULL;


-- 7. Memoria de calculo por procedimento (transparencia obrigatoria)
CREATE TABLE IF NOT EXISTS "ChargeCalculation" (
  "id"                  TEXT PRIMARY KEY,
  "chargeId"            TEXT NOT NULL,
  "procedureCode"       TEXT,
  "procedureName"       TEXT NOT NULL,
  "toothOrArch"         TEXT,
  "grossAmount"         NUMERIC(12,2) NOT NULL,
  "discountAmount"      NUMERIC(12,2) NOT NULL DEFAULT 0,
  "professionalPercent" NUMERIC(5,2),
  "professionalAmount"  NUMERIC(12,2) NOT NULL DEFAULT 0,
  "clinicAmount"        NUMERIC(12,2) NOT NULL DEFAULT 0,
  "financialCost"       NUMERIC(12,2) NOT NULL DEFAULT 0,
  "materialCost"        NUMERIC(12,2) NOT NULL DEFAULT 0,
  "labCost"             NUMERIC(12,2) NOT NULL DEFAULT 0,
  "taxLoadPercent"      NUMERIC(5,2),
  "taxLoadAmount"       NUMERIC(12,2) NOT NULL DEFAULT 0,
  "netToBeneficiary"    NUMERIC(12,2) NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ChargeCalculation_chargeId_idx" ON "ChargeCalculation"("chargeId");


-- 8. Eventos recebidos do gateway (webhook), com protecao contra duplicidade
CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
  "id"           TEXT PRIMARY KEY,
  "provider"     TEXT NOT NULL DEFAULT 'ASAAS',
  "eventType"    TEXT NOT NULL,
  "externalId"   TEXT,
  "payload"      JSONB NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'RECEBIDO'
                 CHECK ("status" IN ('RECEBIDO','PROCESSADO','IGNORADO','ERRO')),
  "errorMessage" TEXT,
  "receivedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"  TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_external_key"
  ON "PaymentWebhookEvent"("provider","eventType","externalId")
  WHERE "externalId" IS NOT NULL;


-- =====================================================================
-- PARTE 3 — CHAVES ESTRANGEIRAS
-- Criadas so quando a tabela de destino existe, para nao derrubar nada.
-- =====================================================================

DO $$
BEGIN
  -- entre as tabelas novas
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgreementProcedurePrice_agreement_fk') THEN
    ALTER TABLE "AgreementProcedurePrice"
      ADD CONSTRAINT "AgreementProcedurePrice_agreement_fk"
      FOREIGN KEY ("agreementId") REFERENCES "PartnershipAgreement"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeneficiaryCharge_group_fk') THEN
    ALTER TABLE "BeneficiaryCharge"
      ADD CONSTRAINT "BeneficiaryCharge_group_fk"
      FOREIGN KEY ("chargeGroupId") REFERENCES "ChargeGroup"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BeneficiaryCharge_account_fk') THEN
    ALTER TABLE "BeneficiaryCharge"
      ADD CONSTRAINT "BeneficiaryCharge_account_fk"
      FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChargeCalculation_charge_fk') THEN
    ALTER TABLE "ChargeCalculation"
      ADD CONSTRAINT "ChargeCalculation_charge_fk"
      FOREIGN KEY ("chargeId") REFERENCES "BeneficiaryCharge"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChargeGroup_term_fk') THEN
    ALTER TABLE "ChargeGroup"
      ADD CONSTRAINT "ChargeGroup_term_fk"
      FOREIGN KEY ("singleChargeTermId") REFERENCES "SingleChargeTerm"("id");
  END IF;

  -- para tabelas ja existentes, so se existirem mesmo
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Doctor') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnershipAgreement_doctor_fk') THEN
      ALTER TABLE "PartnershipAgreement"
        ADD CONSTRAINT "PartnershipAgreement_doctor_fk"
        FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAccount_doctor_fk') THEN
      ALTER TABLE "PaymentAccount"
        ADD CONSTRAINT "PaymentAccount_doctor_fk"
        FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id");
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Patient') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChargeGroup_patient_fk') THEN
      ALTER TABLE "ChargeGroup"
        ADD CONSTRAINT "ChargeGroup_patient_fk"
        FOREIGN KEY ("patientId") REFERENCES "Patient"("id");
    END IF;
  END IF;
END $$;


-- =====================================================================
-- CONFERENCIA
-- =====================================================================
SELECT table_name AS tabela_criada
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PaymentAccount','PartnershipAgreement','AgreementProcedurePrice',
                     'SingleChargeTerm','ChargeGroup','BeneficiaryCharge',
                     'ChargeCalculation','PaymentWebhookEvent')
ORDER BY table_name;
