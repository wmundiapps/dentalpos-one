-- Ponto por reconhecimento facial: guarda só os códigos do rosto (sem foto), com consentimento do colaborador.
CREATE TABLE IF NOT EXISTS "HREmployeeFace" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL REFERENCES "HREmployee"("id") ON DELETE CASCADE,
  "samples" JSONB NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "consentById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "HREmployeeFace_clinicId_employeeId_key" ON "HREmployeeFace"("clinicId","employeeId");
CREATE INDEX IF NOT EXISTS "HREmployeeFace_tenantId_idx" ON "HREmployeeFace"("tenantId");
ALTER TABLE "HREmployeeFace" ENABLE ROW LEVEL SECURITY;
