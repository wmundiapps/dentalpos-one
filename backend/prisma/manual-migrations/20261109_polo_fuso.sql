-- Fuso horário de cada polo (minutos em relação ao UTC): Brasília -180, Mato Grosso do Sul -240.
ALTER TABLE "HRWorkplace" ADD COLUMN IF NOT EXISTS "utcOffsetMinutes" INTEGER NOT NULL DEFAULT -180;
UPDATE "HRWorkplace" SET "utcOffsetMinutes" = -240 WHERE slug LIKE '%-ms';
