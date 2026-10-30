-- Calibragem remota do local do polo: o RH libera e a pessoa do polo confirma a localização pelo celular do polo.
ALTER TABLE "HRWorkplace" ADD COLUMN IF NOT EXISTS "calibrating" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "HRWorkplace" ADD COLUMN IF NOT EXISTS "calibratedAt" TIMESTAMP(3);
ALTER TABLE "HRWorkplace" ADD COLUMN IF NOT EXISTS "calibratedAccuracy" INTEGER;
