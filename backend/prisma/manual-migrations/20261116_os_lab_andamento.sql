-- Ordem de serviço do laboratório: andamento (em andamento / finalizado) e texto de "como está" (aguardando projeto, falta fresar...).
-- Só adiciona colunas (nada é apagado). Rodar no projeto Completodonto (lfeqfzvmasqnnmqvkjyg).
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT 'IN_PROGRESS';
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "progressNote" TEXT;
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "progressAt" TIMESTAMP(3);
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "progressByName" TEXT;
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "progressLog" JSONB NOT NULL DEFAULT '[]'::jsonb;
