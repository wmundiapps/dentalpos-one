-- DentalPos One — Ordens de laboratório no banco (arquivo permanente) + avisos diários
-- Rodar no SQL Editor do projeto DentalPos One ANTES do deploy do backend. Só adiciona; idempotente.

CREATE TABLE IF NOT EXISTS "LabOrder" (
  "id"                TEXT PRIMARY KEY,
  "clinicId"          TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "localId"           TEXT NOT NULL,
  "trackingCode"      TEXT,
  "patientName"       TEXT NOT NULL,
  "dentistName"       TEXT,
  "workType"          TEXT NOT NULL,
  "status"            TEXT NOT NULL,
  "priority"          TEXT,
  "dueDate"           TIMESTAMP(3),
  "deliveredAt"       TIMESTAMP(3),
  "data"              JSONB NOT NULL,
  "notifyLabMemberId" TEXT,
  "notifyChannels"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deletedAt"         TIMESTAMP(3),
  "deletedById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabOrder_clinicId_localId_key" ON "LabOrder"("clinicId", "localId");
CREATE INDEX IF NOT EXISTS "LabOrder_clinicId_deletedAt_idx" ON "LabOrder"("clinicId", "deletedAt");
CREATE INDEX IF NOT EXISTS "LabOrder_tenantId_idx" ON "LabOrder"("tenantId");

-- Os avisos agora são diários e calculados no dia; cancela os avisos antigos pré-programados que ainda estavam pendentes.
UPDATE "LabNotification" SET "status" = 'CANCELLED', "errorMessage" = 'Substituído pelos avisos diários.'
WHERE "status" = 'PENDING' AND "type" IN ('FOLLOW_UP', 'BEFORE_DUE', 'ON_DUE_DAY');
