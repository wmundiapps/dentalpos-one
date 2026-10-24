-- Game Odonto Odisseia (menu "Game"): configuração, progresso, tempo de jogo do dia e prêmios.
-- Rodar no SQL Editor do Supabase (projeto DentalPos One, ref lfeqfzvmasqnnmqvkjyg). Só cria tabelas novas; não mexe em nada que já existe.
-- Tabelas nascem com RLS ligado e sem acesso para anon/authenticated (o sistema acessa pelo servidor).
CREATE TABLE IF NOT EXISTS "TrainingSettings" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "prize" TEXT NOT NULL DEFAULT 'Meio período de folga',
  "minLevel" TEXT NOT NULL DEFAULT 'mediano',
  "dailyLimitMinutes" INTEGER NOT NULL DEFAULT 5,
  "jobRotationSectors" TEXT[] DEFAULT ARRAY['rec', 'cme', 'fin', 'lab', 'asb']::TEXT[],
  "teamEnabled" BOOLEAN NOT NULL DEFAULT false,
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

-- Se a tabela já existia de um teste anterior, acrescenta o botão de liberação da equipe.
ALTER TABLE "TrainingSettings" ADD COLUMN IF NOT EXISTS "teamEnabled" BOOLEAN NOT NULL DEFAULT false;

REVOKE ALL ON "TrainingSettings", "TrainingProgress", "TrainingUsage", "TrainingPrize" FROM anon, authenticated;

-- Conferência: deve mostrar as 4 tabelas.
SELECT table_name FROM information_schema.tables WHERE table_name IN ('TrainingSettings','TrainingProgress','TrainingUsage','TrainingPrize') ORDER BY 1;
