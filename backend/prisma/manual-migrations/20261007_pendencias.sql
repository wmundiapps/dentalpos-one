-- DentalPos One — Pendências com responsável e pontuação
-- Rodar no SQL Editor do projeto DentalPos One ANTES de usar a tela de Pendências. Só cria tabela nova; idempotente.

CREATE TABLE IF NOT EXISTS "PendingTask" (
  "id"            TEXT PRIMARY KEY,
  "clinicId"      TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "module"        TEXT,
  "status"        TEXT NOT NULL DEFAULT 'ABERTA',
  "priority"      TEXT NOT NULL DEFAULT 'MEDIA',
  "dueDate"       DATE,
  "assigneeId"    TEXT,
  "createdById"   TEXT,
  "completedById" TEXT,
  "completedAt"   TIMESTAMP(3),
  "points"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "PendingTask" ADD CONSTRAINT "PendingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "PendingTask_clinicId_status_idx" ON "PendingTask"("clinicId", "status");
CREATE INDEX IF NOT EXISTS "PendingTask_clinicId_assigneeId_status_idx" ON "PendingTask"("clinicId", "assigneeId", "status");
CREATE INDEX IF NOT EXISTS "PendingTask_clinicId_completedAt_idx" ON "PendingTask"("clinicId", "completedAt");
CREATE INDEX IF NOT EXISTS "PendingTask_tenantId_idx" ON "PendingTask"("tenantId");
