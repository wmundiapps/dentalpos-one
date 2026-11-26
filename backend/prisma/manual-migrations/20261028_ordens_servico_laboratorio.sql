-- Ordens de serviço do laboratório (protocolo, recebimento e erros). Rodar uma vez no Supabase.
CREATE TABLE IF NOT EXISTS "LabServiceOrder" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "patientId" TEXT,
  "appointmentId" TEXT,
  "patientName" TEXT NOT NULL,
  "patientContact" TEXT NOT NULL,
  "dentistName" TEXT NOT NULL,
  "dentistContact" TEXT NOT NULL,
  "assistantName" TEXT NOT NULL,
  "laboratoryName" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "shade" TEXT NOT NULL,
  "elements" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "scanUpper" BOOLEAN NOT NULL DEFAULT false,
  "scanLower" BOOLEAN NOT NULL DEFAULT false,
  "scanBite" BOOLEAN NOT NULL DEFAULT false,
  "impressionUpper" BOOLEAN NOT NULL DEFAULT false,
  "impressionLower" BOOLEAN NOT NULL DEFAULT false,
  "waxBite" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "receivedAt" TIMESTAMP(3),
  "receivedByName" TEXT,
  "refusalReason" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "errors" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabServiceOrder_clinicId_protocol_key" ON "LabServiceOrder"("clinicId","protocol");
CREATE INDEX IF NOT EXISTS "LabServiceOrder_clinicId_status_idx" ON "LabServiceOrder"("clinicId","status");
CREATE INDEX IF NOT EXISTS "LabServiceOrder_tenantId_idx" ON "LabServiceOrder"("tenantId");
ALTER TABLE "LabServiceOrder" ENABLE ROW LEVEL SECURITY;
