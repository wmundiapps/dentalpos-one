-- Campos do paciente que só existiam no mock local do frontend, agora no banco real.
-- Migration aditiva e segura. NAO EXECUTAR automaticamente.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Ativo';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "treatment" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "mainComplaint" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "medications" TEXT;
