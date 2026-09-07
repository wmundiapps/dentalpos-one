-- Migration aditiva do prontuário versionado. Preparada para revisão e execução pelo fluxo de integração.
-- Este arquivo NÃO foi executado por este chat.
BEGIN;

CREATE TABLE IF NOT EXISTS "PatientClinicalRecord" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "data" JSONB NOT NULL,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "alertSummary" TEXT,
  "responsibleProfessionalId" TEXT,
  "responsibleProfessionalName" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientClinicalRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatientClinicalRecord_patientId_key" ON "PatientClinicalRecord"("patientId");
CREATE INDEX IF NOT EXISTS "PatientClinicalRecord_clinicId_patientId_idx" ON "PatientClinicalRecord"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "PatientClinicalRecord_tenantId_idx" ON "PatientClinicalRecord"("tenantId");
CREATE INDEX IF NOT EXISTS "PatientClinicalRecord_clinicId_status_idx" ON "PatientClinicalRecord"("clinicId", "status");

CREATE TABLE IF NOT EXISTS "PatientClinicalRecordRevision" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "clinicalRecordId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "dataSnapshot" JSONB NOT NULL,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "alertSummary" TEXT,
  "changeReason" TEXT NOT NULL,
  "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "authorId" TEXT NOT NULL,
  "authorName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientClinicalRecordRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientClinicalRecordRevision_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientClinicalRecordRevision_clinicalRecordId_fkey" FOREIGN KEY ("clinicalRecordId") REFERENCES "PatientClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatientClinicalRecordRevision_clinicalRecordId_revisionNumber_key" ON "PatientClinicalRecordRevision"("clinicalRecordId", "revisionNumber");
CREATE INDEX IF NOT EXISTS "PatientClinicalRecordRevision_clinicId_patientId_createdAt_idx" ON "PatientClinicalRecordRevision"("clinicId", "patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "PatientClinicalRecordRevision_tenantId_idx" ON "PatientClinicalRecordRevision"("tenantId");

CREATE TABLE IF NOT EXISTS "ClinicalCustomFieldDefinition" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "fieldType" TEXT NOT NULL,
  "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required" BOOLEAN NOT NULL DEFAULT false,
  "sensitive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalCustomFieldDefinition_clinicId_key_key" ON "ClinicalCustomFieldDefinition"("clinicId", "key");
CREATE INDEX IF NOT EXISTS "ClinicalCustomFieldDefinition_tenantId_idx" ON "ClinicalCustomFieldDefinition"("tenantId");
CREATE INDEX IF NOT EXISTS "ClinicalCustomFieldDefinition_clinicId_section_displayOrder_idx" ON "ClinicalCustomFieldDefinition"("clinicId", "section", "displayOrder");

COMMIT;
