-- Produto de interesse do lead (atendimento automatico de vendas da WMundi).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Confira o nome do projeto no canto da tela.
ALTER TABLE "MarketingLead" ADD COLUMN IF NOT EXISTS "product" TEXT;
