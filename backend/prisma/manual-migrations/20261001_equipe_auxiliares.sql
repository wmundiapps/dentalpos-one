-- DentalPos One — Equipe (ASB, TSB, laboratório de prótese) + auxiliar no agendamento
-- Rodar no SQL Editor do projeto DentalPos One (ref lfeqfzvmasqnnmqvkjyg) ANTES do deploy do backend.
-- Só adiciona; não apaga nem altera dados existentes.

CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id"             TEXT PRIMARY KEY,
  "clinicId"       TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "fullName"       TEXT NOT NULL,
  "phone"          TEXT,
  "email"          TEXT,
  "registryNumber" TEXT,
  "companyName"    TEXT,
  "notes"          TEXT,
  "showInAgenda"   BOOLEAN NOT NULL DEFAULT TRUE,
  "isActive"       BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "TeamMember_clinicId_idx" ON "TeamMember"("clinicId");
CREATE INDEX IF NOT EXISTS "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "assistantId" TEXT;

-- Telegram do laboratório de prótese (avisos das ordens de serviço)
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- Avisos programados das ordens de serviço do laboratório (WhatsApp Meta / SMS / Telegram)
CREATE TABLE IF NOT EXISTS "LabNotification" (
  "id"           TEXT PRIMARY KEY,
  "clinicId"     TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "workRef"      TEXT NOT NULL,
  "labMemberId"  TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "channel"      TEXT NOT NULL,
  "message"      TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "sentAt"       TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "LabNotification_clinicId_workRef_idx" ON "LabNotification"("clinicId", "workRef");
CREATE INDEX IF NOT EXISTS "LabNotification_status_scheduledFor_idx" ON "LabNotification"("status", "scheduledFor");

-- Número de cadastro (prontuário) automático do paciente, por clínica
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "recordNumber" INTEGER;

-- Numera os pacientes que ainda não têm número, na ordem de cadastro, continuando depois do maior já usado
WITH numbered AS (
  SELECT id, "clinicId", ROW_NUMBER() OVER (PARTITION BY "clinicId" ORDER BY "createdAt", id) AS rn
  FROM "Patient"
  WHERE "recordNumber" IS NULL
)
UPDATE "Patient" p
SET "recordNumber" = n.rn + COALESCE((SELECT MAX(x."recordNumber") FROM "Patient" x WHERE x."clinicId" = p."clinicId"), 0)
FROM numbered n
WHERE p.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS "Patient_clinicId_recordNumber_key" ON "Patient"("clinicId", "recordNumber");
