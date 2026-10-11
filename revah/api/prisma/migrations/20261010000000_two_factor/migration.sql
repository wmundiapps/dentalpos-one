-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpBackupHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" BIGINT,
ADD COLUMN     "totpPending" TEXT,
ADD COLUMN     "totpSecret" TEXT;

