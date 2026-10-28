-- Ponto por CPF + rosto: foto de referência do cadastro e foto de cada batida (comprovante).
ALTER TABLE "HREmployeeFace" ADD COLUMN IF NOT EXISTS "photo" TEXT;
CREATE TABLE IF NOT EXISTS "HRTimePunchPhoto" (
  "punchId" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "photo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HRTimePunchPhoto_clinicId_employeeId_idx" ON "HRTimePunchPhoto"("clinicId","employeeId");
ALTER TABLE "HRTimePunchPhoto" ENABLE ROW LEVEL SECURITY;
