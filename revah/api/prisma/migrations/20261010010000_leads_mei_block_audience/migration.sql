-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "isMei" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CompanyRecord" ADD COLUMN     "isMei" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LeadBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAudience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnaes" TEXT[],
    "uf" TEXT,
    "city" TEXT,
    "meiFilter" TEXT NOT NULL DEFAULT 'ALL',
    "inviteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAudience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadBlock_tenantId_hash_key" ON "LeadBlock"("tenantId", "hash");

-- CreateIndex
CREATE INDEX "LeadAudience_tenantId_idx" ON "LeadAudience"("tenantId");

-- AddForeignKey
ALTER TABLE "LeadBlock" ADD CONSTRAINT "LeadBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAudience" ADD CONSTRAINT "LeadAudience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

