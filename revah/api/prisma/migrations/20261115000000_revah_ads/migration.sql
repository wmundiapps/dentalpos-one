-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "adsAddonActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AdPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "offer" TEXT,
    "audience" TEXT,
    "location" TEXT,
    "goal" TEXT NOT NULL DEFAULT 'MESSAGES',
    "dailyBudget" DECIMAL(10,2),
    "platform" TEXT NOT NULL DEFAULT 'META',
    "result" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdPlan_tenantId_idx" ON "AdPlan"("tenantId");

-- AddForeignKey
ALTER TABLE "AdPlan" ADD CONSTRAINT "AdPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tabela nova nasce com RLS ligado (sem acesso pela API pública do Supabase).
ALTER TABLE "AdPlan" ENABLE ROW LEVEL SECURITY;
