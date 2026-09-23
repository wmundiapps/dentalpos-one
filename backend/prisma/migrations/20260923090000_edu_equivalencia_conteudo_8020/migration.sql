-- AlterTable
ALTER TABLE "edu_content_items" ADD COLUMN     "sourceText" TEXT,
ADD COLUMN     "summary8020" TEXT;

-- CreateTable
CREATE TABLE "edu_equivalency_requests" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "originInstitution" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "notes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_equivalency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_equivalency_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originSubjectName" TEXT NOT NULL,
    "originWorkloadHours" INTEGER NOT NULL,
    "originGrade" DOUBLE PRECISION,
    "targetSubjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "approvedWorkloadHours" INTEGER,
    "analystNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_equivalency_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_equivalency_requests_clinicId_status_idx" ON "edu_equivalency_requests"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_equivalency_requests_studentId_idx" ON "edu_equivalency_requests"("studentId");

-- CreateIndex
CREATE INDEX "edu_equivalency_requests_tenantId_idx" ON "edu_equivalency_requests"("tenantId");

-- CreateIndex
CREATE INDEX "edu_equivalency_items_requestId_idx" ON "edu_equivalency_items"("requestId");

-- CreateIndex
CREATE INDEX "edu_equivalency_items_targetSubjectId_idx" ON "edu_equivalency_items"("targetSubjectId");

-- AddForeignKey
ALTER TABLE "edu_equivalency_requests" ADD CONSTRAINT "edu_equivalency_requests_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_equivalency_requests" ADD CONSTRAINT "edu_equivalency_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_equivalency_requests" ADD CONSTRAINT "edu_equivalency_requests_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_equivalency_items" ADD CONSTRAINT "edu_equivalency_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "edu_equivalency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_equivalency_items" ADD CONSTRAINT "edu_equivalency_items_targetSubjectId_fkey" FOREIGN KEY ("targetSubjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

