-- Kit da clínica: WhatsApp, site, responsável técnico, cargos da equipe e textos de documentos (atestado, receituário, contrato, manual de biossegurança, ITs, POPs).
-- Rodar no SQL Editor do Supabase (projeto DentalPos One, ref lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP TABLE "ClinicBrandKit").
CREATE TABLE IF NOT EXISTS "ClinicBrandKit" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL UNIQUE REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "tenantId" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "ClinicBrandKit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ClinicBrandKit" FROM anon, authenticated;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ClinicBrandKit';
