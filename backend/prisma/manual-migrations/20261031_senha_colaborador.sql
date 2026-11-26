-- Senha individual do colaborador para consultar o próprio ponto (sem acesso a dados de outros).
CREATE TABLE IF NOT EXISTS "HREmployeePortal" (
  "employeeId" TEXT PRIMARY KEY REFERENCES "HREmployee"("id") ON DELETE CASCADE,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "HREmployeePortal_clinicId_idx" ON "HREmployeePortal"("clinicId");
ALTER TABLE "HREmployeePortal" ENABLE ROW LEVEL SECURITY;
