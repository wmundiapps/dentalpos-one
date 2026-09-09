-- Chat 5 — Arquivos e Exames Clínicos
-- Migration aditiva e segura. NÃO EXECUTAR automaticamente.
CREATE TABLE IF NOT EXISTS "ClinicalFileCategory" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'OTHER',
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalFileCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalFileCategory_clinicId_name_key"
  ON "ClinicalFileCategory"("clinicId", "name");
CREATE INDEX IF NOT EXISTS "ClinicalFileCategory_clinicId_kind_idx"
  ON "ClinicalFileCategory"("clinicId", "kind");
CREATE INDEX IF NOT EXISTS "ClinicalFileCategory_tenantId_idx"
  ON "ClinicalFileCategory"("tenantId");

CREATE TABLE IF NOT EXISTS "ClinicalFile" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "categoryId" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "extension" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageProvider" TEXT NOT NULL DEFAULT 'PENDING',
  "storageKey" TEXT NOT NULL,
  "storageStatus" TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',
  "externalUrl" TEXT,
  "checksum" TEXT,
  "previewKind" TEXT NOT NULL DEFAULT 'DOWNLOAD',
  "examDate" TIMESTAMP(3),
  "origin" TEXT,
  "requesterProfessionalId" TEXT,
  "requesterProfessionalName" TEXT,
  "description" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tooth" TEXT,
  "region" TEXT,
  "treatmentItemId" TEXT,
  "clinicalEvolutionId" TEXT,
  "metadata" JSONB,
  "createdById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClinicalFile_clinicId_patientId_createdAt_idx"
  ON "ClinicalFile"("clinicId", "patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClinicalFile_tenantId_idx" ON "ClinicalFile"("tenantId");
CREATE INDEX IF NOT EXISTS "ClinicalFile_patientId_kind_idx" ON "ClinicalFile"("patientId", "kind");
CREATE INDEX IF NOT EXISTS "ClinicalFile_categoryId_idx" ON "ClinicalFile"("categoryId");
CREATE INDEX IF NOT EXISTS "ClinicalFile_treatmentItemId_idx" ON "ClinicalFile"("treatmentItemId");
CREATE INDEX IF NOT EXISTS "ClinicalFile_clinicalEvolutionId_idx" ON "ClinicalFile"("clinicalEvolutionId");
CREATE INDEX IF NOT EXISTS "ClinicalFile_storageStatus_idx" ON "ClinicalFile"("storageStatus");

-- Categorias iniciais por clínica podem ser criadas pela API; nenhuma carga destrutiva é feita aqui.
