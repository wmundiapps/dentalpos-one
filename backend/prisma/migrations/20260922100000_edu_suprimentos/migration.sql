-- CreateTable
CREATE TABLE "edu_supply_items" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTRO',
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salePrice" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_supply_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_supply_movements" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ENTRADA',
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_supply_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_purchase_orders" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "financialEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_purchase_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "edu_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_sales" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT,
    "buyerName" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONCLUIDA',
    "financialEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "edu_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_supply_items_clinicId_isActive_idx" ON "edu_supply_items"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_supply_items_tenantId_idx" ON "edu_supply_items"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_supply_items_clinicId_code_key" ON "edu_supply_items"("clinicId", "code");

-- CreateIndex
CREATE INDEX "edu_supply_movements_itemId_idx" ON "edu_supply_movements"("itemId");

-- CreateIndex
CREATE INDEX "edu_supply_movements_clinicId_type_idx" ON "edu_supply_movements"("clinicId", "type");

-- CreateIndex
CREATE INDEX "edu_purchase_orders_clinicId_status_idx" ON "edu_purchase_orders"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_purchase_orders_tenantId_idx" ON "edu_purchase_orders"("tenantId");

-- CreateIndex
CREATE INDEX "edu_purchase_order_items_orderId_idx" ON "edu_purchase_order_items"("orderId");

-- CreateIndex
CREATE INDEX "edu_sales_clinicId_status_idx" ON "edu_sales"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_sales_tenantId_idx" ON "edu_sales"("tenantId");

-- CreateIndex
CREATE INDEX "edu_sale_items_saleId_idx" ON "edu_sale_items"("saleId");

-- AddForeignKey
ALTER TABLE "edu_supply_items" ADD CONSTRAINT "edu_supply_items_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_supply_movements" ADD CONSTRAINT "edu_supply_movements_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_supply_movements" ADD CONSTRAINT "edu_supply_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "edu_supply_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_purchase_orders" ADD CONSTRAINT "edu_purchase_orders_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_purchase_order_items" ADD CONSTRAINT "edu_purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "edu_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_purchase_order_items" ADD CONSTRAINT "edu_purchase_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "edu_supply_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sales" ADD CONSTRAINT "edu_sales_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sales" ADD CONSTRAINT "edu_sales_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sale_items" ADD CONSTRAINT "edu_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "edu_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sale_items" ADD CONSTRAINT "edu_sale_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "edu_supply_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

