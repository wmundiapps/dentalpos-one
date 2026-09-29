-- CreateTable
CREATE TABLE "CompanyRecord" (
    "cnpj" TEXT NOT NULL,
    "basico" TEXT NOT NULL,
    "tradeName" TEXT,
    "legalName" TEXT,
    "cnae" TEXT NOT NULL,
    "cnaeSecondary" TEXT,
    "uf" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL,
    "city" TEXT,
    "cityNorm" TEXT,
    "district" TEXT,
    "zip" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "openedAt" TEXT,
    "size" TEXT,
    "refMonth" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRecord_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "CnaeCode" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "searchNorm" TEXT NOT NULL,

    CONSTRAINT "CnaeCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CompanyImport" (
    "id" TEXT NOT NULL,
    "refMonth" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "rows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "encryptedCredentials" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyRecord_uf_cityNorm_cnae_idx" ON "CompanyRecord"("uf", "cityNorm", "cnae");

-- CreateIndex
CREATE INDEX "CompanyRecord_cnae_uf_idx" ON "CompanyRecord"("cnae", "uf");

-- CreateIndex
CREATE INDEX "CompanyRecord_basico_idx" ON "CompanyRecord"("basico");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_tenantId_provider_externalId_key" ON "LeadSource"("tenantId", "provider", "externalId");

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

