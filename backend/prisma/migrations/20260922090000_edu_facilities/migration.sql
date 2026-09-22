-- CreateTable
CREATE TABLE "edu_assets" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTRO',
    "location" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionValue" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_maintenance_orders" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT,
    "location" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "requestedById" TEXT,
    "assignedTo" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_parking_spots" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ALUNO',
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "assignedToStudentId" TEXT,
    "assignedToUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_parking_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_expiring_items" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTRO',
    "title" TEXT NOT NULL,
    "relatedAssetId" TEXT,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "preparationDays" INTEGER NOT NULL DEFAULT 0,
    "safetyMarginDays" INTEGER NOT NULL DEFAULT 0,
    "responsibleUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_expiring_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_assets_clinicId_status_idx" ON "edu_assets"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_assets_tenantId_idx" ON "edu_assets"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_assets_clinicId_code_key" ON "edu_assets"("clinicId", "code");

-- CreateIndex
CREATE INDEX "edu_maintenance_orders_clinicId_status_idx" ON "edu_maintenance_orders"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_maintenance_orders_tenantId_idx" ON "edu_maintenance_orders"("tenantId");

-- CreateIndex
CREATE INDEX "edu_parking_spots_clinicId_type_idx" ON "edu_parking_spots"("clinicId", "type");

-- CreateIndex
CREATE INDEX "edu_parking_spots_tenantId_idx" ON "edu_parking_spots"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_parking_spots_clinicId_code_key" ON "edu_parking_spots"("clinicId", "code");

-- CreateIndex
CREATE INDEX "edu_expiring_items_clinicId_status_expiresAt_idx" ON "edu_expiring_items"("clinicId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "edu_expiring_items_tenantId_idx" ON "edu_expiring_items"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_assets" ADD CONSTRAINT "edu_assets_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_maintenance_orders" ADD CONSTRAINT "edu_maintenance_orders_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_maintenance_orders" ADD CONSTRAINT "edu_maintenance_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "edu_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_parking_spots" ADD CONSTRAINT "edu_parking_spots_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_parking_spots" ADD CONSTRAINT "edu_parking_spots_assignedToStudentId_fkey" FOREIGN KEY ("assignedToStudentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_expiring_items" ADD CONSTRAINT "edu_expiring_items_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

