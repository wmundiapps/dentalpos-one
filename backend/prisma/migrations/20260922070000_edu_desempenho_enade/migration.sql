-- AlterTable
ALTER TABLE "edu_exams" ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "edu_questions" ADD COLUMN     "competency" TEXT;

-- CreateTable
CREATE TABLE "edu_reinforcement_plans" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "competency" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "dueDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_reinforcement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_reinforcement_actions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_reinforcement_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_reinforcement_plans_clinicId_status_idx" ON "edu_reinforcement_plans"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_reinforcement_plans_studentId_idx" ON "edu_reinforcement_plans"("studentId");

-- CreateIndex
CREATE INDEX "edu_reinforcement_plans_tenantId_idx" ON "edu_reinforcement_plans"("tenantId");

-- CreateIndex
CREATE INDEX "edu_reinforcement_actions_planId_idx" ON "edu_reinforcement_actions"("planId");

-- AddForeignKey
ALTER TABLE "edu_exams" ADD CONSTRAINT "edu_exams_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_reinforcement_plans" ADD CONSTRAINT "edu_reinforcement_plans_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_reinforcement_plans" ADD CONSTRAINT "edu_reinforcement_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_reinforcement_plans" ADD CONSTRAINT "edu_reinforcement_plans_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_reinforcement_actions" ADD CONSTRAINT "edu_reinforcement_actions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "edu_reinforcement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

