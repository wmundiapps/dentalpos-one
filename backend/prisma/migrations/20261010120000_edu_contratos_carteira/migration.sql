-- CreateTable
CREATE TABLE "edu_enrollment_contracts" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "monthlyFee" DOUBLE PRECISION,
    "tuitionDueDay" INTEGER NOT NULL DEFAULT 10,
    "termsText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE_ASSINATURA',
    "signingToken" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "signedIp" TEXT,
    "signedUserAgent" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_enrollment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_student_wallets" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edu_student_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edu_wallet_transactions" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edu_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edu_enrollment_contracts_enrollmentId_key" ON "edu_enrollment_contracts"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_enrollment_contracts_signingToken_key" ON "edu_enrollment_contracts"("signingToken");

-- CreateIndex
CREATE INDEX "edu_enrollment_contracts_clinicId_status_idx" ON "edu_enrollment_contracts"("clinicId", "status");

-- CreateIndex
CREATE INDEX "edu_enrollment_contracts_tenantId_idx" ON "edu_enrollment_contracts"("tenantId");

-- CreateIndex
CREATE INDEX "edu_enrollment_contracts_studentId_idx" ON "edu_enrollment_contracts"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "edu_student_wallets_studentId_key" ON "edu_student_wallets"("studentId");

-- CreateIndex
CREATE INDEX "edu_student_wallets_clinicId_idx" ON "edu_student_wallets"("clinicId");

-- CreateIndex
CREATE INDEX "edu_student_wallets_tenantId_idx" ON "edu_student_wallets"("tenantId");

-- CreateIndex
CREATE INDEX "edu_wallet_transactions_walletId_createdAt_idx" ON "edu_wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "edu_wallet_transactions_clinicId_idx" ON "edu_wallet_transactions"("clinicId");

-- CreateIndex
CREATE INDEX "edu_wallet_transactions_tenantId_idx" ON "edu_wallet_transactions"("tenantId");

-- AddForeignKey
ALTER TABLE "edu_enrollment_contracts" ADD CONSTRAINT "edu_enrollment_contracts_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollment_contracts" ADD CONSTRAINT "edu_enrollment_contracts_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "edu_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_enrollment_contracts" ADD CONSTRAINT "edu_enrollment_contracts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_student_wallets" ADD CONSTRAINT "edu_student_wallets_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_student_wallets" ADD CONSTRAINT "edu_student_wallets_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "edu_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_wallet_transactions" ADD CONSTRAINT "edu_wallet_transactions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edu_wallet_transactions" ADD CONSTRAINT "edu_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "edu_student_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

