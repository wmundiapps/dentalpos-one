-- Chat 2 - Odontograma e Periodontograma
-- Migration aditiva e segura. NÃO EXECUTADA.
CREATE TABLE IF NOT EXISTS "DentalChartEntry" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "dentition" TEXT NOT NULL DEFAULT 'ADULT',
  "tooth" INTEGER NOT NULL,
  "surface" TEXT,
  "findingCode" TEXT NOT NULL,
  "findingLabel" TEXT NOT NULL,
  "clinicalState" TEXT NOT NULL DEFAULT 'CURRENT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "sourceEvolutionId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DentalChartEntry_clinic_patient_idx"
  ON "DentalChartEntry" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "DentalChartEntry_tenant_idx"
  ON "DentalChartEntry" ("tenantId");
CREATE INDEX IF NOT EXISTS "DentalChartEntry_patient_tooth_idx"
  ON "DentalChartEntry" ("patientId", "tooth");
CREATE INDEX IF NOT EXISTS "DentalChartEntry_state_idx"
  ON "DentalChartEntry" ("clinicalState", "status");

CREATE TABLE IF NOT EXISTS "DentalFindingDefinition" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "DentalFindingDefinition_clinic_code_key"
  ON "DentalFindingDefinition" ("clinicId", "code");
CREATE INDEX IF NOT EXISTS "DentalFindingDefinition_tenant_idx"
  ON "DentalFindingDefinition" ("tenantId");

CREATE TABLE IF NOT EXISTS "PeriodontalExam" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "dentition" TEXT NOT NULL DEFAULT 'ADULT',
  "examinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "professionalId" TEXT,
  "professionalName" TEXT,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PeriodontalExam_clinic_patient_date_idx"
  ON "PeriodontalExam" ("clinicId", "patientId", "examinedAt");
CREATE INDEX IF NOT EXISTS "PeriodontalExam_tenant_idx"
  ON "PeriodontalExam" ("tenantId");

CREATE TABLE IF NOT EXISTS "PeriodontalSiteRecord" (
  "id" TEXT PRIMARY KEY,
  "examId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "tooth" INTEGER NOT NULL,
  "site" TEXT NOT NULL,
  "probingDepth" INTEGER NOT NULL DEFAULT 0,
  "recession" INTEGER NOT NULL DEFAULT 0,
  "clinicalAttachmentLevel" INTEGER NOT NULL DEFAULT 0,
  "bleeding" BOOLEAN NOT NULL DEFAULT FALSE,
  "plaque" BOOLEAN NOT NULL DEFAULT FALSE,
  "suppuration" BOOLEAN NOT NULL DEFAULT FALSE,
  "mobility" INTEGER,
  "furcation" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeriodontalSiteRecord_exam_fk"
    FOREIGN KEY ("examId") REFERENCES "PeriodontalExam"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PeriodontalSiteRecord_exam_tooth_site_key"
  ON "PeriodontalSiteRecord" ("examId", "tooth", "site");
CREATE INDEX IF NOT EXISTS "PeriodontalSiteRecord_clinic_patient_idx"
  ON "PeriodontalSiteRecord" ("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "PeriodontalSiteRecord_tenant_idx"
  ON "PeriodontalSiteRecord" ("tenantId");
