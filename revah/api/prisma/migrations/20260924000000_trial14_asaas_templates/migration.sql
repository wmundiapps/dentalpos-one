-- AlterTable
ALTER TABLE "BillingEvent" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'STRIPE';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "asaasLeadsSubscriptionId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ALTER COLUMN "stripeSubscriptionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "billingProvider" TEXT,
ADD COLUMN     "trialEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL DEFAULT 'Geral',
    "channel" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTemplate_tenantId_idx" ON "MessageTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_asaasSubscriptionId_key" ON "Subscription"("asaasSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_asaasLeadsSubscriptionId_key" ON "Subscription"("asaasLeadsSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_asaasCustomerId_key" ON "Tenant"("asaasCustomerId");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contas criadas no modelo antigo (2 campanhas grátis) passam a precisar cadastrar a forma de pagamento para iniciar os 14 dias.
UPDATE "Tenant" SET "status" = 'PENDING_PAYMENT' WHERE "status" = 'TRIAL' AND "trialEndsAt" IS NULL AND "source" = 'DIRECT';
