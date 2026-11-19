-- Estoque: consumo por procedimento (baixa automática), contagem de usos e histórico de duração por reposição.
-- Rodar no SQL Editor do Supabase (projeto DentalPos One, ref lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP TABLE das três tabelas).
CREATE TABLE IF NOT EXISTS "StockProcedureRule" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL,
  "procedureKey" TEXT NOT NULL,
  "procedureLabel" TEXT NOT NULL,
  "productId" TEXT NOT NULL REFERENCES "SalesProduct"("id") ON DELETE CASCADE,
  "mode" TEXT NOT NULL DEFAULT 'DEBIT',
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "perTooth" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockProcedureRule_clinicId_procedureKey_productId_key" ON "StockProcedureRule"("clinicId", "procedureKey", "productId");
CREATE INDEX IF NOT EXISTS "StockProcedureRule_clinicId_procedureKey_idx" ON "StockProcedureRule"("clinicId", "procedureKey");
CREATE INDEX IF NOT EXISTS "StockProcedureRule_tenantId_idx" ON "StockProcedureRule"("tenantId");

CREATE TABLE IF NOT EXISTS "StockUsageEvent" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL REFERENCES "SalesProduct"("id") ON DELETE CASCADE,
  "procedureLabel" TEXT NOT NULL,
  "evolutionId" TEXT NOT NULL,
  "patientId" TEXT,
  "mode" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "cycleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockUsageEvent_evolutionId_productId_key" ON "StockUsageEvent"("evolutionId", "productId");
CREATE INDEX IF NOT EXISTS "StockUsageEvent_clinicId_productId_cycleId_idx" ON "StockUsageEvent"("clinicId", "productId", "cycleId");
CREATE INDEX IF NOT EXISTS "StockUsageEvent_tenantId_idx" ON "StockUsageEvent"("tenantId");

CREATE TABLE IF NOT EXISTS "StockCycle" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL REFERENCES "SalesProduct"("id") ON DELETE CASCADE,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "procedureCount" INTEGER NOT NULL,
  "unitsDebited" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL DEFAULT 'RESTOCK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StockCycle_clinicId_productId_endedAt_idx" ON "StockCycle"("clinicId", "productId", "endedAt");
CREATE INDEX IF NOT EXISTS "StockCycle_tenantId_idx" ON "StockCycle"("tenantId");

-- Tabelas novas nascem com RLS ligado e sem acesso para anon/authenticated.
ALTER TABLE "StockProcedureRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockUsageEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCycle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StockProcedureRule", "StockUsageEvent", "StockCycle" FROM anon, authenticated;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('StockProcedureRule', 'StockUsageEvent', 'StockCycle');
