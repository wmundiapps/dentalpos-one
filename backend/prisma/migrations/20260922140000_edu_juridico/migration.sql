-- CreateTable
CREATE TABLE "edu_legal_cases" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ADMINISTRATIVO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "involvedName" TEXT NOT NULL,
    "studentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "responsibleUserId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_legal_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_legal_hearings" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "mediatorName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_legal_hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_legal_documents" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_legal_cases_clinicId_status_idx" ON "edu_legal_cases"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_legal_cases_tenantId_idx" ON "edu_legal_cases"("tenantId");

-- CreateIndex
CREATE INDEX "edu_legal_hearings_caseId_idx" ON "edu_legal_hearings"("caseId");

-- CreateIndex
CREATE INDEX "edu_legal_documents_caseId_idx" ON "edu_legal_documents"("caseId");

-- AddForeignKey
ALTER TABLE "edu_legal_cases" ADD CONSTRAINT "edu_legal_cases_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_legal_cases" ADD CONSTRAINT "edu_legal_cases_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_legal_hearings" ADD CONSTRAINT "edu_legal_hearings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "edu_legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_legal_documents" ADD CONSTRAINT "edu_legal_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "edu_legal_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

