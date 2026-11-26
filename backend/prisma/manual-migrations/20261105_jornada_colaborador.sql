-- Horários do colaborador: entrada, saída para o almoço, volta do almoço e saída (HH:MM).
ALTER TABLE "HREmployee" ADD COLUMN IF NOT EXISTS "workStart" TEXT;
ALTER TABLE "HREmployee" ADD COLUMN IF NOT EXISTS "lunchStart" TEXT;
ALTER TABLE "HREmployee" ADD COLUMN IF NOT EXISTS "lunchEnd" TEXT;
ALTER TABLE "HREmployee" ADD COLUMN IF NOT EXISTS "workEnd" TEXT;
