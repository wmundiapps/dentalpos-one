-- CreateTable
CREATE TABLE "edu_admission_exams" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "examDate" TIMESTAMP(3),
    "applicationStart" TIMESTAMP(3) NOT NULL,
    "applicationEnd" TIMESTAMP(3) NOT NULL,
    "vacancies" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_admission_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_applications" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionExamId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL,
    "candidatePhone" TEXT,
    "documentNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INSCRITO',
    "score" DOUBLE PRECISION,
    "revahContactId" TEXT,
    "enrolledStudentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_admission_exams_clinicId_status_idx" ON "edu_admission_exams"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_admission_exams_tenantId_idx" ON "edu_admission_exams"("tenantId");

-- CreateIndex
CREATE INDEX "edu_applications_clinicId_status_idx" ON "edu_applications"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_applications_admissionExamId_status_idx" ON "edu_applications"("admissionExamId", "status");

-- CreateIndex
CREATE INDEX "edu_applications_tenantId_idx" ON "edu_applications"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_applications_admissionExamId_candidateEmail_key" ON "edu_applications"("admissionExamId", "candidateEmail");

-- AddForeignKey
ALTER TABLE "edu_admission_exams" ADD CONSTRAINT "edu_admission_exams_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_admission_exams" ADD CONSTRAINT "edu_admission_exams_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_applications" ADD CONSTRAINT "edu_applications_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_applications" ADD CONSTRAINT "edu_applications_admissionExamId_fkey" FOREIGN KEY ("admissionExamId") REFERENCES "edu_admission_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

