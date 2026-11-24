-- Carrossel de ofertas (WhatsApp + Telegram): cards na campanha, cliques e catálogo de ofertas.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "carousel" JSONB,
ADD COLUMN     "waTemplateStatus" TEXT,
ADD COLUMN     "waTemplateRejection" TEXT;

-- CreateTable
CREATE TABLE "CampaignClick" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "recipientId" TEXT,
    "channel" TEXT NOT NULL,
    "cardIndex" INTEGER NOT NULL,
    "cardTitle" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conversationId" TEXT,
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OFERTA',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignClick_campaignId_cardIndex_idx" ON "CampaignClick"("campaignId", "cardIndex");
CREATE INDEX "CampaignClick_tenantId_createdAt_idx" ON "CampaignClick"("tenantId", "createdAt");
CREATE INDEX "CatalogItem_tenantId_isActive_idx" ON "CatalogItem"("tenantId", "isActive");
CREATE UNIQUE INDEX "CatalogItem_tenantId_externalRef_key" ON "CatalogItem"("tenantId", "externalRef");

-- AddForeignKey
ALTER TABLE "CampaignClick" ADD CONSTRAINT "CampaignClick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segurança: tabelas novas nascem com RLS ligado e sem políticas (só a API do REVAH acessa).
ALTER TABLE "CampaignClick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogItem" ENABLE ROW LEVEL SECURITY;
