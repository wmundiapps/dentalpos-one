-- Chat 3 reconstructed by Chat 8. Additive only. DO NOT execute automatically.
ALTER TABLE "TreatmentItem" ADD COLUMN IF NOT EXISTS "planningData" JSONB;

CREATE TABLE IF NOT EXISTS "TreatmentPlanRevision" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreatmentPlanRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TreatmentPlanRevision_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanRevision_patient_version_key" ON "TreatmentPlanRevision"("patientId","version");
CREATE INDEX IF NOT EXISTS "TreatmentPlanRevision_clinic_patient_idx" ON "TreatmentPlanRevision"("clinicId","patientId","createdAt");
CREATE INDEX IF NOT EXISTS "TreatmentPlanRevision_tenant_idx" ON "TreatmentPlanRevision"("tenantId");

ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "acceptedByName" TEXT;
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "acceptedByDocument" TEXT;
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "acceptanceEvidence" JSONB;

CREATE TABLE IF NOT EXISTS "BudgetRevision" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetRevision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetRevision_budget_version_key" ON "BudgetRevision"("budgetId","version");
CREATE INDEX IF NOT EXISTS "BudgetRevision_clinic_budget_idx" ON "BudgetRevision"("clinicId","budgetId","createdAt");
CREATE INDEX IF NOT EXISTS "BudgetRevision_tenant_idx" ON "BudgetRevision"("tenantId");
