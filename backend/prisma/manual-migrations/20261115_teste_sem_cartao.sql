-- Teste de 30 dias sem cartão: guarda quais avisos já foram enviados durante o teste (evita e-mail repetido).
-- Só adiciona coluna (nada é apagado). Rodar no projeto DentalPos One (lfeqfzvmasqnnmqvkjyg).
ALTER TABLE "PlatformSubscription" ADD COLUMN IF NOT EXISTS "trialNotices" JSONB NOT NULL DEFAULT '[]'::jsonb;
