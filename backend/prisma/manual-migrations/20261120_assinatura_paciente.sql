-- Assinatura do paciente (mensalidade vira crédito; 10% de desconto ao usar o crédito).
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Tabelas novas: RLS ligado, sem acesso para anon/authenticated.

CREATE TABLE IF NOT EXISTS "MembershipPlan" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthlyPrice" DECIMAL(12,2) NOT NULL,
  "monthlyCredit" DECIMAL(12,2) NOT NULL,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "MembershipPlan_clinicId_idx" ON "MembershipPlan"("clinicId");

CREATE TABLE IF NOT EXISTS "Membership" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
  "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "billingDay" INTEGER NOT NULL DEFAULT 5,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "cancelledAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Membership_clinic_status_idx" ON "Membership"("clinicId","status");
CREATE INDEX IF NOT EXISTS "Membership_patient_idx" ON "Membership"("patientId");

CREATE TABLE IF NOT EXISTS "MembershipInvoice" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "competence" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "creditAmount" DECIMAL(12,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "financialEntryId" TEXT,
  "invoiceUrl" TEXT,
  "pixCopyPaste" TEXT,
  "paidAt" TIMESTAMP(3),
  "creditedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("memberId","competence")
);
CREATE INDEX IF NOT EXISTS "MembershipInvoice_clinic_status_idx" ON "MembershipInvoice"("clinicId","status");
CREATE INDEX IF NOT EXISTS "MembershipInvoice_entry_idx" ON "MembershipInvoice"("financialEntryId");

CREATE TABLE IF NOT EXISTS "MembershipLedger" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "movement" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "balanceAfter" DECIMAL(12,2) NOT NULL,
  "procedureValue" DECIMAL(12,2),
  "discountAmount" DECIMAL(12,2),
  "description" TEXT NOT NULL,
  "actorId" TEXT,
  "idempotencyKey" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "MembershipLedger_member_idx" ON "MembershipLedger"("memberId","createdAt");

ALTER TABLE "MembershipPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipLedger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MembershipPlan","Membership","MembershipInvoice","MembershipLedger" FROM anon, authenticated;

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('MembershipPlan','Membership','MembershipInvoice','MembershipLedger') ORDER BY 1;
