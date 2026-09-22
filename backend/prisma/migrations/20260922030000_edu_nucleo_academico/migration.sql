-- CreateTable
CREATE TABLE "edu_programs" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'GRADUACAO',
    "modality" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "totalTerms" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_subjects" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "workloadHours" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_curriculums" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_curriculums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_curriculum_subjects" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "workloadHours" INTEGER NOT NULL DEFAULT 0,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_curriculum_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_terms" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SEMESTRE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "enrollmentStart" TIMESTAMP(3),
    "enrollmentEnd" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_students" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "documentNumber" TEXT,
    "birthDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_enrollments" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "enrollmentNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_classes" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "curriculumSubjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_class_enrollments" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CURSANDO',
    "finalGrade" DOUBLE PRECISION,
    "finalAttendancePct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_sessions" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEORICA',
    "title" TEXT NOT NULL,
    "location" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_session_bookings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_session_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_attendances" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "justified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_programs_clinicId_isActive_idx" ON "edu_programs"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_programs_tenantId_idx" ON "edu_programs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_programs_clinicId_code_key" ON "edu_programs"("clinicId", "code");

-- CreateIndex
CREATE INDEX "edu_subjects_clinicId_isActive_idx" ON "edu_subjects"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_subjects_tenantId_idx" ON "edu_subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_subjects_clinicId_code_key" ON "edu_subjects"("clinicId", "code");

-- CreateIndex
CREATE INDEX "edu_curriculums_clinicId_isActive_idx" ON "edu_curriculums"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_curriculums_tenantId_idx" ON "edu_curriculums"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_curriculums_programId_version_key" ON "edu_curriculums"("programId", "version");

-- CreateIndex
CREATE INDEX "edu_curriculum_subjects_curriculumId_termNumber_idx" ON "edu_curriculum_subjects"("curriculumId", "termNumber");

-- CreateIndex
CREATE UNIQUE INDEX "edu_curriculum_subjects_curriculumId_subjectId_key" ON "edu_curriculum_subjects"("curriculumId", "subjectId");

-- CreateIndex
CREATE INDEX "edu_terms_clinicId_isActive_idx" ON "edu_terms"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_terms_tenantId_idx" ON "edu_terms"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_terms_programId_name_key" ON "edu_terms"("programId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "edu_students_userId_key" ON "edu_students"("userId");

-- CreateIndex
CREATE INDEX "edu_students_clinicId_status_idx" ON "edu_students"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_students_tenantId_idx" ON "edu_students"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_students_clinicId_email_key" ON "edu_students"("clinicId", "email");

-- CreateIndex
CREATE INDEX "edu_enrollments_clinicId_status_idx" ON "edu_enrollments"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_enrollments_tenantId_idx" ON "edu_enrollments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_enrollments_clinicId_enrollmentNumber_key" ON "edu_enrollments"("clinicId", "enrollmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "edu_enrollments_studentId_programId_key" ON "edu_enrollments"("studentId", "programId");

-- CreateIndex
CREATE INDEX "edu_classes_clinicId_isActive_idx" ON "edu_classes"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_classes_tenantId_idx" ON "edu_classes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_classes_termId_curriculumSubjectId_code_key" ON "edu_classes"("termId", "curriculumSubjectId", "code");

-- CreateIndex
CREATE INDEX "edu_class_enrollments_studentId_status_idx" ON "edu_class_enrollments"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "edu_class_enrollments_classId_studentId_key" ON "edu_class_enrollments"("classId", "studentId");

-- CreateIndex
CREATE INDEX "edu_sessions_classId_scheduledAt_idx" ON "edu_sessions"("classId", "scheduledAt");

-- CreateIndex
CREATE INDEX "edu_sessions_clinicId_status_idx" ON "edu_sessions"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_sessions_tenantId_idx" ON "edu_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "edu_session_bookings_sessionId_status_idx" ON "edu_session_bookings"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "edu_session_bookings_sessionId_studentId_key" ON "edu_session_bookings"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "edu_attendances_studentId_idx" ON "edu_attendances"("studentId");

-- CreateIndex
CREATE INDEX "edu_attendances_clinicId_idx" ON "edu_attendances"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_attendances_sessionId_studentId_key" ON "edu_attendances"("sessionId", "studentId");

-- AddForeignKey
ALTER TABLE "edu_programs" ADD CONSTRAINT "edu_programs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_subjects" ADD CONSTRAINT "edu_subjects_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_curriculums" ADD CONSTRAINT "edu_curriculums_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_curriculums" ADD CONSTRAINT "edu_curriculums_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_curriculum_subjects" ADD CONSTRAINT "edu_curriculum_subjects_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "edu_curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_curriculum_subjects" ADD CONSTRAINT "edu_curriculum_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "edu_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_terms" ADD CONSTRAINT "edu_terms_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_terms" ADD CONSTRAINT "edu_terms_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_students" ADD CONSTRAINT "edu_students_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollments" ADD CONSTRAINT "edu_enrollments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollments" ADD CONSTRAINT "edu_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollments" ADD CONSTRAINT "edu_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollments" ADD CONSTRAINT "edu_enrollments_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "edu_curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollments" ADD CONSTRAINT "edu_enrollments_termId_fkey" FOREIGN KEY ("termId") REFERENCES "edu_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_classes" ADD CONSTRAINT "edu_classes_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_classes" ADD CONSTRAINT "edu_classes_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_classes" ADD CONSTRAINT "edu_classes_curriculumSubjectId_fkey" FOREIGN KEY ("curriculumSubjectId") REFERENCES "edu_curriculum_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_classes" ADD CONSTRAINT "edu_classes_termId_fkey" FOREIGN KEY ("termId") REFERENCES "edu_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_class_enrollments" ADD CONSTRAINT "edu_class_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "edu_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_class_enrollments" ADD CONSTRAINT "edu_class_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_class_enrollments" ADD CONSTRAINT "edu_class_enrollments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "edu_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sessions" ADD CONSTRAINT "edu_sessions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_sessions" ADD CONSTRAINT "edu_sessions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "edu_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_session_bookings" ADD CONSTRAINT "edu_session_bookings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "edu_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_session_bookings" ADD CONSTRAINT "edu_session_bookings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_attendances" ADD CONSTRAINT "edu_attendances_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_attendances" ADD CONSTRAINT "edu_attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "edu_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_attendances" ADD CONSTRAINT "edu_attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

