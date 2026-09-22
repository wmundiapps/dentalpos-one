-- CreateTable
CREATE TABLE "edu_document_uploads" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OUTRO',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_document_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_document_requests" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "protocolNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DECLARACAO_MATRICULA',
    "status" TEXT NOT NULL DEFAULT 'SOLICITADO',
    "deliveryMethod" TEXT NOT NULL DEFAULT 'DIGITAL',
    "notes" TEXT,
    "fileUrl" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_certificates" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CERTIFICADO_CONCLUSAO',
    "title" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registryCode" TEXT,
    "verificationCode" TEXT NOT NULL,
    "signedFileUrl" TEXT,
    "signatureStatus" TEXT NOT NULL DEFAULT 'NAO_APLICAVEL',
    "status" TEXT NOT NULL DEFAULT 'EMITIDO',
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edu_document_uploads_studentId_idx" ON "edu_document_uploads"("studentId");

-- CreateIndex
CREATE INDEX "edu_document_uploads_clinicId_idx" ON "edu_document_uploads"("clinicId");

-- CreateIndex
CREATE INDEX "edu_document_requests_clinicId_status_idx" ON "edu_document_requests"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_document_requests_studentId_idx" ON "edu_document_requests"("studentId");

-- CreateIndex
CREATE INDEX "edu_document_requests_tenantId_idx" ON "edu_document_requests"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_document_requests_clinicId_protocolNumber_key" ON "edu_document_requests"("clinicId", "protocolNumber");

-- CreateIndex
CREATE UNIQUE INDEX "edu_certificates_verificationCode_key" ON "edu_certificates"("verificationCode");

-- CreateIndex
CREATE INDEX "edu_certificates_clinicId_status_idx" ON "edu_certificates"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_certificates_studentId_idx" ON "edu_certificates"("studentId");

-- CreateIndex
CREATE INDEX "edu_certificates_tenantId_idx" ON "edu_certificates"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_document_uploads" ADD CONSTRAINT "edu_document_uploads_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_document_uploads" ADD CONSTRAINT "edu_document_uploads_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_document_requests" ADD CONSTRAINT "edu_document_requests_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_document_requests" ADD CONSTRAINT "edu_document_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_certificates" ADD CONSTRAINT "edu_certificates_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_certificates" ADD CONSTRAINT "edu_certificates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

