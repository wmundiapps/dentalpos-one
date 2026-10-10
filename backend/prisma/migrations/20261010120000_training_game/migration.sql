-- Treinamento (Odonto Odisseia)
CREATE TABLE IF NOT EXISTS "TrainingSettings" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "prize" TEXT NOT NULL DEFAULT 'Meio período de folga',
  "minLevel" TEXT NOT NULL DEFAULT 'mediano',
  "dailyLimitMinutes" INTEGER NOT NULL DEFAULT 5,
  "jobRotationSectors" TEXT[] DEFAULT ARRAY['rec', 'cme', 'fin', 'lab', 'asb']::TEXT[],
  "permissionsSeededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingSettings_clinicId_key" ON "TrainingSettings"("clinicId");
CREATE INDEX IF NOT EXISTS "TrainingSettings_tenantId_idx" ON "TrainingSettings"("tenantId");
ALTER TABLE "TrainingSettings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "TrainingProgress" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingProgress_userId_module_key" ON "TrainingProgress"("userId", "module");
CREATE INDEX IF NOT EXISTS "TrainingProgress_clinicId_idx" ON "TrainingProgress"("clinicId");
ALTER TABLE "TrainingProgress" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "TrainingUsage" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "seconds" INTEGER NOT NULL DEFAULT 0,
  "lastBeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingUsage_userId_day_key" ON "TrainingUsage"("userId", "day");
CREATE INDEX IF NOT EXISTS "TrainingUsage_clinicId_day_idx" ON "TrainingUsage"("clinicId", "day");
ALTER TABLE "TrainingUsage" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "TrainingPrize" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "prize" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingPrize_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingPrize_code_key" ON "TrainingPrize"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "TrainingPrize_userId_module_key" ON "TrainingPrize"("userId", "module");
CREATE INDEX IF NOT EXISTS "TrainingPrize_clinicId_idx" ON "TrainingPrize"("clinicId");
ALTER TABLE "TrainingPrize" ENABLE ROW LEVEL SECURITY;
