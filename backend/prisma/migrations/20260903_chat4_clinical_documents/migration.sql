-- Chat 4 — additive-only migration. DO NOT run automatically.
ALTER TABLE "ClinicalEvolution"
  ADD COLUMN IF NOT EXISTS "appointmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "teeth" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "anesthetic" TEXT,
  ADD COLUMN IF NOT EXISTS "materials" TEXT,
  ADD COLUMN IF NOT EXISTS "complications" TEXT,
  ADD COLUMN IF NOT EXISTS "guidance" TEXT,
  ADD COLUMN IF NOT EXISTS "attachments" JSONB,
  ADD COLUMN IF NOT EXISTS "authoredBy" TEXT;

CREATE TABLE IF NOT EXISTS "ClinicalDocumentTemplate" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "footer" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClinicalDocumentTemplate_clinicId_documentType_idx" ON "ClinicalDocumentTemplate"("clinicId", "documentType");
CREATE INDEX IF NOT EXISTS "ClinicalDocumentTemplate_tenantId_idx" ON "ClinicalDocumentTemplate"("tenantId");

CREATE TABLE IF NOT EXISTS "ClinicalDocument" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "professionalId" TEXT,
  "professionalName" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "templateId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "footer" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "issuedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "authoredBy" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClinicalDocument_clinicId_patientId_idx" ON "ClinicalDocument"("clinicId", "patientId");
CREATE INDEX IF NOT EXISTS "ClinicalDocument_tenantId_idx" ON "ClinicalDocument"("tenantId");
CREATE INDEX IF NOT EXISTS "ClinicalDocument_documentType_status_idx" ON "ClinicalDocument"("documentType", "status");

CREATE TABLE IF NOT EXISTS "ClinicalDocumentHistory" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "footer" TEXT,
  "status" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "authoredBy" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalDocumentHistory_documentId_version_key" ON "ClinicalDocumentHistory"("documentId", "version");
CREATE INDEX IF NOT EXISTS "ClinicalDocumentHistory_clinicId_documentId_idx" ON "ClinicalDocumentHistory"("clinicId", "documentId");
CREATE INDEX IF NOT EXISTS "ClinicalDocumentHistory_tenantId_idx" ON "ClinicalDocumentHistory"("tenantId");
