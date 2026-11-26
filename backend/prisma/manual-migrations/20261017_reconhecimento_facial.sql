-- Reconhecimento facial na recepção: guarda só o "código do rosto" (128 números), nunca a foto.
-- Cada paciente só entra com consentimento registrado (LGPD art. 11) e pode ser removido a qualquer momento.
-- Rodar no SQL Editor do Supabase (projeto DentalPos One, lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP TABLE "PatientFace").
CREATE TABLE IF NOT EXISTS "PatientFace" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "samples" JSONB NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "consentById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatientFace_clinicId_patientId_key" ON "PatientFace"("clinicId","patientId");
ALTER TABLE "PatientFace" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PatientFace" FROM anon, authenticated;

-- Conferência (deve mostrar 1 linha: PatientFace | true):
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PatientFace';
