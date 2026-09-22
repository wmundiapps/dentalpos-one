-- CreateTable
CREATE TABLE "edu_questions" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'OBJETIVA_UNICA',
    "statement" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIA',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rubric" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "edu_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_exams" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "type" TEXT NOT NULL DEFAULT 'AVALIACAO',
    "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_exam_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "edu_exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_exam_attempts" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "objectiveScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "essayScore" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,

    CONSTRAINT "edu_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_exam_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "essayText" TEXT,
    "isCorrect" BOOLEAN,
    "pointsEarned" DOUBLE PRECISION,
    "aiScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "manualScore" DOUBLE PRECISION,
    "manualFeedback" TEXT,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "edu_exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_questions_clinicId_subjectId_isActive_idx" ON "edu_questions"("clinicId", "subjectId", "isActive");

-- CreateIndex
CREATE INDEX "edu_questions_tenantId_idx" ON "edu_questions"("tenantId");

-- CreateIndex
CREATE INDEX "edu_question_options_questionId_idx" ON "edu_question_options"("questionId");

-- CreateIndex
CREATE INDEX "edu_exams_clinicId_status_idx" ON "edu_exams"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_exams_tenantId_idx" ON "edu_exams"("tenantId");

-- CreateIndex
CREATE INDEX "edu_exam_questions_examId_idx" ON "edu_exam_questions"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_exam_questions_examId_questionId_key" ON "edu_exam_questions"("examId", "questionId");

-- CreateIndex
CREATE INDEX "edu_exam_attempts_examId_status_idx" ON "edu_exam_attempts"("examId", "status");

-- CreateIndex
CREATE INDEX "edu_exam_attempts_studentId_idx" ON "edu_exam_attempts"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_exam_attempts_examId_studentId_key" ON "edu_exam_attempts"("examId", "studentId");

-- CreateIndex
CREATE INDEX "edu_exam_answers_attemptId_idx" ON "edu_exam_answers"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_exam_answers_attemptId_examQuestionId_key" ON "edu_exam_answers"("attemptId", "examQuestionId");

-- AddForeignKey
ALTER TABLE "edu_questions" ADD CONSTRAINT "edu_questions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_questions" ADD CONSTRAINT "edu_questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_question_options" ADD CONSTRAINT "edu_question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exams" ADD CONSTRAINT "edu_exams_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exams" ADD CONSTRAINT "edu_exams_classId_fkey" FOREIGN KEY ("classId") REFERENCES "edu_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_questions" ADD CONSTRAINT "edu_exam_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "edu_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_questions" ADD CONSTRAINT "edu_exam_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "edu_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_attempts" ADD CONSTRAINT "edu_exam_attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "edu_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_attempts" ADD CONSTRAINT "edu_exam_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_answers" ADD CONSTRAINT "edu_exam_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "edu_exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_exam_answers" ADD CONSTRAINT "edu_exam_answers_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "edu_exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

