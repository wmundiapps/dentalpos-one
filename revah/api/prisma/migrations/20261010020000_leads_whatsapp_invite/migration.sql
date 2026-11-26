-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "audienceId" TEXT,
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_inviteToken_key" ON "Lead"("inviteToken");

