ALTER TABLE "FinancialEntry" ADD COLUMN IF NOT EXISTS "settledById" TEXT;
ALTER TABLE "FinancialEntry" ADD COLUMN IF NOT EXISTS "settledByName" TEXT;
ALTER TABLE "FinancialEntry" ADD COLUMN IF NOT EXISTS "paymentReceipt" TEXT;
