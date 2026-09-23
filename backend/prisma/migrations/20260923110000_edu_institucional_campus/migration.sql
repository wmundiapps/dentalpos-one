-- CreateTable
CREATE TABLE "edu_institution_profiles" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "site" TEXT,
    "contactUrl" TEXT,
    "ombudsmanEmail" TEXT,
    "ombudsmanPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_institution_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_campuses" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POLO',
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "mapLat" DOUBLE PRECISION,
    "mapLng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_campuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edu_institution_profiles_clinicId_key" ON "edu_institution_profiles"("clinicId");

-- CreateIndex
CREATE INDEX "edu_institution_profiles_tenantId_idx" ON "edu_institution_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "edu_campuses_clinicId_isActive_idx" ON "edu_campuses"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_campuses_tenantId_idx" ON "edu_campuses"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_institution_profiles" ADD CONSTRAINT "edu_institution_profiles_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_campuses" ADD CONSTRAINT "edu_campuses_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

