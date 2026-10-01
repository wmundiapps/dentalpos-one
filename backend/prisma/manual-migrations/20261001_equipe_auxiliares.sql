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
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TeamMember_clinicId_idx" ON "TeamMember"("clinicId");
CREATE INDEX IF NOT EXISTS "TeamMember_tenantId_idx" ON "TeamMember"("tenantId");

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "assistantId" TEXT;
