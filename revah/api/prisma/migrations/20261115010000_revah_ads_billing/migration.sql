-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "adsCreditCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "adsSpendBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adsStripeSubscriptionId" TEXT,
ADD COLUMN     "adsSubscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "AdsCreditEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "spendCents" INTEGER,
    "platform" TEXT,
    "ref" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdsCreditEntry_ref_key" ON "AdsCreditEntry"("ref");

-- CreateIndex
CREATE INDEX "AdsCreditEntry_tenantId_createdAt_idx" ON "AdsCreditEntry"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdsCreditEntry" ADD CONSTRAINT "AdsCreditEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tabela nova nasce com RLS ligado (sem acesso pela API pública do Supabase).
ALTER TABLE "AdsCreditEntry" ENABLE ROW LEVEL SECURITY;
