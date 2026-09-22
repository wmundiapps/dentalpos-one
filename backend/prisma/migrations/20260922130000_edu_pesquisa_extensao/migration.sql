-- CreateTable
CREATE TABLE "edu_funding_agencies" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_funding_agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_funding_calls" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "resultDate" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_funding_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_research_projects" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PESQUISA',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coordinatorName" TEXT NOT NULL,
    "programId" TEXT,
    "fundingAgencyId" TEXT,
    "fundingCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSTA',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budgetAmount" DOUBLE PRECISION,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_research_project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_research_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_funding_agencies_tenantId_idx" ON "edu_funding_agencies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_funding_agencies_clinicId_name_key" ON "edu_funding_agencies"("clinicId", "name");

-- CreateIndex
CREATE INDEX "edu_funding_calls_clinicId_status_idx" ON "edu_funding_calls"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_funding_calls_tenantId_idx" ON "edu_funding_calls"("tenantId");

-- CreateIndex
CREATE INDEX "edu_research_projects_clinicId_status_idx" ON "edu_research_projects"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_research_projects_tenantId_idx" ON "edu_research_projects"("tenantId");

-- CreateIndex
CREATE INDEX "edu_research_project_members_projectId_idx" ON "edu_research_project_members"("projectId");

-- AddForeignKey
ALTER TABLE "edu_funding_agencies" ADD CONSTRAINT "edu_funding_agencies_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_funding_calls" ADD CONSTRAINT "edu_funding_calls_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_funding_calls" ADD CONSTRAINT "edu_funding_calls_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "edu_funding_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_projects" ADD CONSTRAINT "edu_research_projects_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_projects" ADD CONSTRAINT "edu_research_projects_programId_fkey" FOREIGN KEY ("programId") REFERENCES "edu_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_projects" ADD CONSTRAINT "edu_research_projects_fundingAgencyId_fkey" FOREIGN KEY ("fundingAgencyId") REFERENCES "edu_funding_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_projects" ADD CONSTRAINT "edu_research_projects_fundingCallId_fkey" FOREIGN KEY ("fundingCallId") REFERENCES "edu_funding_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_project_members" ADD CONSTRAINT "edu_research_project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "edu_research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_research_project_members" ADD CONSTRAINT "edu_research_project_members_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

