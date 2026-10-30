-- Polos/unidades com local exato para o ponto e colaborador vinculado a um polo.
CREATE TABLE IF NOT EXISTS "HRWorkplace" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "address" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "radiusMeters" INTEGER NOT NULL DEFAULT 150,
  "pinHash" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "HRWorkplace_clinicId_slug_key" ON "HRWorkplace"("clinicId","slug");
CREATE INDEX IF NOT EXISTS "HRWorkplace_slug_idx" ON "HRWorkplace"("slug");
ALTER TABLE "HRWorkplace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HREmployee" ADD COLUMN IF NOT EXISTS "workplaceId" TEXT;
