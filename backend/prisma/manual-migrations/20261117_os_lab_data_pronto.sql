-- Ordem de serviço do laboratório: data em que o trabalho precisa estar pronto (definida ao atualizar o andamento).
-- Só adiciona coluna. Rodar no projeto Completodonto (lfeqfzvmasqnnmqvkjyg).
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "readyBy" TIMESTAMP(3);
