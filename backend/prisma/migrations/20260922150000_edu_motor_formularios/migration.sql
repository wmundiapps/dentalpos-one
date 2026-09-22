-- CreateTable
CREATE TABLE "edu_form_templates" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "department" TEXT NOT NULL DEFAULT 'GERAL',
    "fields" JSONB NOT NULL,
    "workflowSteps" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_form_submissions" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "submittedByStudentId" TEXT,
    "submittedByUserId" TEXT,
    "submitterName" TEXT,
    "data" JSONB NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stepHistory" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_form_templates_clinicId_department_isActive_idx" ON "edu_form_templates"("clinicId", "department", "isActive");

-- CreateIndex
CREATE INDEX "edu_form_templates_tenantId_idx" ON "edu_form_templates"("tenantId");

-- CreateIndex
CREATE INDEX "edu_form_submissions_clinicId_status_idx" ON "edu_form_submissions"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_form_submissions_templateId_idx" ON "edu_form_submissions"("templateId");

-- CreateIndex
CREATE INDEX "edu_form_submissions_tenantId_idx" ON "edu_form_submissions"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_form_templates" ADD CONSTRAINT "edu_form_templates_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_form_submissions" ADD CONSTRAINT "edu_form_submissions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_form_submissions" ADD CONSTRAINT "edu_form_submissions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "edu_form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_form_submissions" ADD CONSTRAINT "edu_form_submissions_submittedByStudentId_fkey" FOREIGN KEY ("submittedByStudentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

