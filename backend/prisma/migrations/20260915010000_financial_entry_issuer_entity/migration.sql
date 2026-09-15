-- Razao social emissora do lancamento financeiro (Instituto Ravel vs Tecnoimplante).
-- Migration aditiva e segura. NAO EXECUTAR automaticamente.
ALTER TABLE "FinancialEntry" ADD COLUMN IF NOT EXISTS "issuerEntity" TEXT DEFAULT 'INSTITUTO_RAVEL';
