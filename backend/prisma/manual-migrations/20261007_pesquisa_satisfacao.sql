-- Pesquisa de satisfação pós-atendimento. Idempotente.
CREATE TABLE IF NOT EXISTS "SatisfactionSurvey" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "appointmentId" TEXT,
  "doctorId" TEXT,
  "journey" TEXT NOT NULL DEFAULT 'PRIMEIRA_CONSULTA',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "tokenHash" TEXT NOT NULL,
  "channel" TEXT,
  "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "dispatchError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SatisfactionSurvey_tokenHash_key" ON "SatisfactionSurvey"("tokenHash");
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_clinicId_patientId_createdAt_idx" ON "SatisfactionSurvey"("clinicId","patientId","createdAt");
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_clinicId_status_idx" ON "SatisfactionSurvey"("clinicId","status");
CREATE INDEX IF NOT EXISTS "SatisfactionSurvey_appointmentId_idx" ON "SatisfactionSurvey"("appointmentId");

CREATE TABLE IF NOT EXISTS "SatisfactionAnswer" (
  "id" TEXT PRIMARY KEY,
  "surveyId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT,
  "journey" TEXT NOT NULL,
  "nps" INTEGER NOT NULL,
  "comment" TEXT,
  "details" JSONB,
  "contracted" BOOLEAN,
  "notContractedReason" TEXT,
  "wantsContact" BOOLEAN NOT NULL DEFAULT FALSE,
  "testimonialConsent" BOOLEAN NOT NULL DEFAULT FALSE,
  "lowScoreHandled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SatisfactionAnswer_surveyId_key" ON "SatisfactionAnswer"("surveyId");
CREATE INDEX IF NOT EXISTS "SatisfactionAnswer_clinicId_createdAt_idx" ON "SatisfactionAnswer"("clinicId","createdAt");
CREATE INDEX IF NOT EXISTS "SatisfactionAnswer_clinicId_doctorId_idx" ON "SatisfactionAnswer"("clinicId","doctorId");

CREATE TABLE IF NOT EXISTS "SatisfactionOptOut" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SatisfactionOptOut_clinicId_patientId_key" ON "SatisfactionOptOut"("clinicId","patientId");

ALTER TABLE "SatisfactionSurvey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SatisfactionAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SatisfactionOptOut" ENABLE ROW LEVEL SECURITY;
