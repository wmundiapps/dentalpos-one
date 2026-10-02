-- DentalPos One — Cobrança real (Asaas) com divisão automática (split) para dentistas
-- Rodar no SQL Editor do projeto DentalPos One ANTES de usar a cobrança. Só cria tabelas novas; idempotente.

CREATE TABLE IF NOT EXISTS "ReceivableCharge" (
  "id"               TEXT PRIMARY KEY,
  "clinicId"         TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "financialEntryId" TEXT NOT NULL,
  "provider"         TEXT NOT NULL DEFAULT 'ASAAS',
  "externalId"       TEXT NOT NULL,
  "installmentId"    TEXT,
  "billingType"      TEXT NOT NULL,
  "installmentCount" INTEGER NOT NULL DEFAULT 1,
  "value"            DECIMAL(12,2) NOT NULL,
  "dueDate"          DATE NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PENDENTE',
  "invoiceUrl"       TEXT,
  "pixCopyPaste"     TEXT,
  "barcode"          TEXT,
  "digitableLine"    TEXT,
  "paidPaymentIds"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "paidAt"           TIMESTAMP(3),
  "netValue"         DECIMAL(12,2),
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableCharge_clinicId_externalId_key" ON "ReceivableCharge"("clinicId", "externalId");
CREATE INDEX IF NOT EXISTS "ReceivableCharge_financialEntryId_idx" ON "ReceivableCharge"("financialEntryId");
CREATE INDEX IF NOT EXISTS "ReceivableCharge_clinicId_status_idx" ON "ReceivableCharge"("clinicId", "status");
CREATE INDEX IF NOT EXISTS "ReceivableCharge_tenantId_idx" ON "ReceivableCharge"("tenantId");

CREATE TABLE IF NOT EXISTS "PaymentSplitLine" (
  "id"            TEXT PRIMARY KEY,
  "clinicId"      TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "chargeId"      TEXT NOT NULL REFERENCES "ReceivableCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "doctorId"      TEXT NOT NULL,
  "walletId"      TEXT NOT NULL,
  "mode"          TEXT NOT NULL,
  "percent"       DECIMAL(7,4),
  "plannedAmount" DECIMAL(12,2) NOT NULL,
  "finalAmount"   DECIMAL(12,2),
  "status"        TEXT NOT NULL DEFAULT 'PENDENTE',
  "confirmedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "PaymentSplitLine_clinicId_doctorId_idx" ON "PaymentSplitLine"("clinicId", "doctorId");
CREATE INDEX IF NOT EXISTS "PaymentSplitLine_chargeId_idx" ON "PaymentSplitLine"("chargeId");
CREATE INDEX IF NOT EXISTS "PaymentSplitLine_tenantId_idx" ON "PaymentSplitLine"("tenantId");
