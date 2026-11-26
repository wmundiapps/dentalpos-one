-- Acesso exclusivo do RH: login e senha próprios para ver colaboradores, salários e folha.
CREATE TABLE IF NOT EXISTS "HRVault" (
  "clinicId" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "recoveryEmail" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "resetCodeHash" TEXT,
  "resetExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "HRVault" ENABLE ROW LEVEL SECURITY;
