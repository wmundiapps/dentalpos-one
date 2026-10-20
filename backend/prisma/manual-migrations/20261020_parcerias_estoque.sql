-- Parcerias de estoque: empresas parceiras avisadas quando o estoque da clínica fica baixo (só com autorização da clínica).
-- Parceiro paga contrapartida mensal (meio salário mínimo); só parceiro ATIVO e em dia recebe avisos.
-- Rodar no SQL Editor do Supabase (projeto CompletoDonto, ref lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP TABLE).
CREATE TABLE IF NOT EXISTS "StockPartner" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "whatsapp" TEXT,
  "categories" TEXT[] NOT NULL DEFAULT '{}',
  "monthlyFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "paidUntil" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "StockPartnerNotice" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL REFERENCES "StockPartner"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StockPartnerNotice_lookup_idx" ON "StockPartnerNotice"("clinicId","partnerId","productId","sentAt");
ALTER TABLE "StockPartner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockPartnerNotice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StockPartner" FROM anon, authenticated;
REVOKE ALL ON TABLE "StockPartnerNotice" FROM anon, authenticated;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('StockPartner','StockPartnerNotice') ORDER BY 1;
