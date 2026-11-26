-- Assinatura do paciente/dentista no procedimento realizado (comprovante para cobrança).
CREATE TABLE IF NOT EXISTS "ClinicalEvolutionSignature" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "evolutionId" TEXT NOT NULL UNIQUE,
  "contentHash" TEXT NOT NULL,
  "patientSignature" TEXT,
  "patientSignerName" TEXT,
  "patientSignedAt" TIMESTAMP(3),
  "patientIp" TEXT,
  "patientUserAgent" TEXT,
  "dentistSignature" TEXT,
  "dentistSignerName" TEXT,
  "dentistSignedAt" TIMESTAMP(3),
  "dentistIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "ClinicalEvolutionSignature_clinicId_patientId_idx" ON "ClinicalEvolutionSignature"("clinicId","patientId");
ALTER TABLE "ClinicalEvolutionSignature" ENABLE ROW LEVEL SECURITY;
