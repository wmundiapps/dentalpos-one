-- Valor de consulta padrão por profissional (Agenda + Agendamento Online)
-- Migration aditiva e segura. NÃO EXECUTAR automaticamente.
ALTER TABLE "Doctor" ADD COLUMN IF NOT EXISTS "consultationValue" DOUBLE PRECISION;
