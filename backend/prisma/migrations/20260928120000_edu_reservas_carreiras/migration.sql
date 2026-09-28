-- CreateTable
CREATE TABLE "edu_bookable_resources" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SALA',
    "location" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_bookable_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_resource_bookings" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_resource_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_job_postings" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ESTAGIO',
    "modality" TEXT NOT NULL DEFAULT 'PRESENCIAL',
    "location" TEXT,
    "applicationUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "postedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_job_applications" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_bookable_resources_clinicId_isActive_idx" ON "edu_bookable_resources"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_bookable_resources_tenantId_idx" ON "edu_bookable_resources"("tenantId");

-- CreateIndex
CREATE INDEX "edu_resource_bookings_resourceId_startAt_endAt_idx" ON "edu_resource_bookings"("resourceId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "edu_resource_bookings_clinicId_status_idx" ON "edu_resource_bookings"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_resource_bookings_tenantId_idx" ON "edu_resource_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "edu_job_postings_clinicId_isActive_idx" ON "edu_job_postings"("clinicId", "isActive");

-- CreateIndex
CREATE INDEX "edu_job_postings_tenantId_idx" ON "edu_job_postings"("tenantId");

-- CreateIndex
CREATE INDEX "edu_job_applications_postingId_idx" ON "edu_job_applications"("postingId");

-- CreateIndex
CREATE INDEX "edu_job_applications_studentId_idx" ON "edu_job_applications"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_job_applications_postingId_studentId_key" ON "edu_job_applications"("postingId", "studentId");

-- AddForeignKey
ALTER TABLE "edu_bookable_resources" ADD CONSTRAINT "edu_bookable_resources_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_resource_bookings" ADD CONSTRAINT "edu_resource_bookings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_resource_bookings" ADD CONSTRAINT "edu_resource_bookings_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "edu_bookable_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_job_postings" ADD CONSTRAINT "edu_job_postings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_job_applications" ADD CONSTRAINT "edu_job_applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "edu_job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_job_applications" ADD CONSTRAINT "edu_job_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

