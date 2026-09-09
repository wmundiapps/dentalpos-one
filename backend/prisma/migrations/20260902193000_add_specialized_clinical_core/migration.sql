-- Chat 7: núcleo clínico especializado (Ortodontia, Ortopedia Funcional e DTM/Dor Orofacial)
-- Migration exclusivamente aditiva. Não foi executada pelo desenvolvimento.

CREATE TABLE "SpecializedClinicalRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "chiefComplaint" TEXT,
    "diagnosis" TEXT,
    "diagnosticHypothesis" TEXT,
    "treatmentPlan" TEXT,
    "responsibleId" TEXT,
    "responsibleName" TEXT,
    "clinicalData" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecializedClinicalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecializedClinicalEvolution" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "evolutionType" TEXT NOT NULL,
    "professionalId" TEXT,
    "professionalName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "clinicalData" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecializedClinicalEvolution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecializedClinicalAttachment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "clinicalFileId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "storageKey" TEXT,
    "capturedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecializedClinicalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpecializedClinicalRecord_clinicId_patientId_specialty_idx" ON "SpecializedClinicalRecord"("clinicId", "patientId", "specialty");
CREATE INDEX "SpecializedClinicalRecord_clinicId_specialty_status_idx" ON "SpecializedClinicalRecord"("clinicId", "specialty", "status");
CREATE INDEX "SpecializedClinicalRecord_tenantId_idx" ON "SpecializedClinicalRecord"("tenantId");
CREATE INDEX "SpecializedClinicalEvolution_clinicId_patientId_occurredAt_idx" ON "SpecializedClinicalEvolution"("clinicId", "patientId", "occurredAt");
CREATE INDEX "SpecializedClinicalEvolution_clinicId_recordId_occurredAt_idx" ON "SpecializedClinicalEvolution"("clinicId", "recordId", "occurredAt");
CREATE INDEX "SpecializedClinicalEvolution_tenantId_idx" ON "SpecializedClinicalEvolution"("tenantId");
CREATE INDEX "SpecializedClinicalAttachment_clinicId_patientId_category_idx" ON "SpecializedClinicalAttachment"("clinicId", "patientId", "category");
CREATE INDEX "SpecializedClinicalAttachment_clinicId_recordId_idx" ON "SpecializedClinicalAttachment"("clinicId", "recordId");
CREATE INDEX "SpecializedClinicalAttachment_tenantId_idx" ON "SpecializedClinicalAttachment"("tenantId");
CREATE INDEX "SpecializedClinicalAttachment_clinicalFileId_idx" ON "SpecializedClinicalAttachment"("clinicalFileId");

ALTER TABLE "SpecializedClinicalRecord"
    ADD CONSTRAINT "SpecializedClinicalRecord_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SpecializedClinicalRecord_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpecializedClinicalEvolution"
    ADD CONSTRAINT "SpecializedClinicalEvolution_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SpecializedClinicalEvolution_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SpecializedClinicalEvolution_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "SpecializedClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpecializedClinicalAttachment"
    ADD CONSTRAINT "SpecializedClinicalAttachment_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SpecializedClinicalAttachment_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "SpecializedClinicalAttachment_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "SpecializedClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
