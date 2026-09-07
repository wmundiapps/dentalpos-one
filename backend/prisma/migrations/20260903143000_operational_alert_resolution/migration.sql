-- Chat 8 / Homologação 5787 — resolução auditável de alertas.
-- Migration aditiva. NÃO executada durante o desenvolvimento.

CREATE TABLE IF NOT EXISTS "FinancialAlertResolution" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "action" TEXT,
  "reason" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "patientId" TEXT,
  "supplierId" TEXT,
  "personName" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "replacementEntityType" TEXT,
  "replacementEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialAlertResolution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAlertResolution_clinic_source_key" ON "FinancialAlertResolution"("clinicId","sourceEntityType","sourceEntityId");
CREATE INDEX IF NOT EXISTS "FinancialAlertResolution_tenant_status_idx" ON "FinancialAlertResolution"("tenantId","status");
CREATE INDEX IF NOT EXISTS "FinancialAlertResolution_patient_idx" ON "FinancialAlertResolution"("patientId");
CREATE INDEX IF NOT EXISTS "FinancialAlertResolution_supplier_idx" ON "FinancialAlertResolution"("supplierId");
DO $$ BEGIN ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_user_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_patient_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FinancialAlertResolution" ADD CONSTRAINT "FinancialAlertResolution_supplier_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS "OperationalAlertResolution_sequence_seq";
CREATE TABLE IF NOT EXISTS "OperationalAlertResolution" (
  "id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT nextval('"OperationalAlertResolution_sequence_seq"'),
  "protocol" TEXT,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "alertKey" TEXT,
  "area" TEXT NOT NULL,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "status" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "note" TEXT,
  "resolvedById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalAlertResolution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalAlertResolution_sequence_key" ON "OperationalAlertResolution"("sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalAlertResolution_protocol_key" ON "OperationalAlertResolution"("protocol");
CREATE INDEX IF NOT EXISTS "OperationalAlertResolution_scope_idx" ON "OperationalAlertResolution"("clinicId","tenantId","resolvedAt");
CREATE INDEX IF NOT EXISTS "OperationalAlertResolution_alert_idx" ON "OperationalAlertResolution"("clinicId","alertKey");
CREATE INDEX IF NOT EXISTS "OperationalAlertResolution_source_idx" ON "OperationalAlertResolution"("clinicId","sourceEntityType","sourceEntityId");
