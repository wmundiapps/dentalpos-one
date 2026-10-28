-- Fase do paciente na ficha: orçamento ou tratamento confirmado.
-- Rodar no SQL Editor do Supabase (projeto DentalPos One, ref lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP COLUMN).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "treatmentStage" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "treatmentStageAt" TIMESTAMP(3);
SELECT column_name FROM information_schema.columns WHERE table_name = 'Patient' AND column_name IN ('treatmentStage', 'treatmentStageAt');
