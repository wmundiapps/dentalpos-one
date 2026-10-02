-- DentalPos One — Régua de cobrança (avisos ao paciente em atraso)
-- Só cria uma tabela nova; idempotente. A régua só envia mensagens depois de ligada na tela de Configurações.

CREATE TABLE IF NOT EXISTS "DunningNotice" (
  "id"               TEXT PRIMARY KEY,
  "clinicId"         TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "financialEntryId" TEXT NOT NULL,
  "patientId"        TEXT,
  "stage"            TEXT NOT NULL,
  "channel"          TEXT NOT NULL,
  "message"          TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledFor"     TIMESTAMP(3) NOT NULL,
  "sentAt"           TIMESTAMP(3),
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DunningNotice_financialEntryId_stage_key" ON "DunningNotice"("financialEntryId", "stage");
CREATE INDEX IF NOT EXISTS "DunningNotice_clinicId_status_scheduledFor_idx" ON "DunningNotice"("clinicId", "status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "DunningNotice_clinicId_createdAt_idx" ON "DunningNotice"("clinicId", "createdAt");
