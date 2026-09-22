-- CreateTable
CREATE TABLE "edu_committees" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OUTRA',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_committee_members" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "userId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_committee_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_pdi_goals" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "indicator" TEXT,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "responsibleUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_pdi_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_pdi_evidences" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_pdi_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_regulatory_watches" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OUTRO',
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "rawExcerpt" TEXT,
    "aiRelevant" BOOLEAN,
    "aiSummary" TEXT,
    "relevance" TEXT NOT NULL DEFAULT 'NAO_ANALISADO',
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "responsibleUserId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_regulatory_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_committees_clinicId_type_isActive_idx" ON "edu_committees"("clinicId", "type", "isActive");

-- CreateIndex
CREATE INDEX "edu_committees_tenantId_idx" ON "edu_committees"("tenantId");

-- CreateIndex
CREATE INDEX "edu_committee_members_committeeId_idx" ON "edu_committee_members"("committeeId");

-- CreateIndex
CREATE INDEX "edu_pdi_goals_clinicId_status_idx" ON "edu_pdi_goals"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_pdi_goals_tenantId_idx" ON "edu_pdi_goals"("tenantId");

-- CreateIndex
CREATE INDEX "edu_pdi_evidences_goalId_idx" ON "edu_pdi_evidences"("goalId");

-- CreateIndex
CREATE INDEX "edu_regulatory_watches_clinicId_status_idx" ON "edu_regulatory_watches"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_regulatory_watches_clinicId_relevance_idx" ON "edu_regulatory_watches"("clinicId", "relevance");

-- CreateIndex
CREATE INDEX "edu_regulatory_watches_tenantId_idx" ON "edu_regulatory_watches"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_committees" ADD CONSTRAINT "edu_committees_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_committee_members" ADD CONSTRAINT "edu_committee_members_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "edu_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_pdi_goals" ADD CONSTRAINT "edu_pdi_goals_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_pdi_evidences" ADD CONSTRAINT "edu_pdi_evidences_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "edu_pdi_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_regulatory_watches" ADD CONSTRAINT "edu_regulatory_watches_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

