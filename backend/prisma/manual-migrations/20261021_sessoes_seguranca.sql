-- Sessões ativas e alerta de uso estranho: cada login vira uma sessão que pode ser vista e encerrada.
-- Rodar no SQL Editor do Supabase (projeto CompletoDonto, ref lfeqfzvmasqnnmqvkjyg). Seguro e reversível (DROP TABLE "UserSession").
CREATE TABLE IF NOT EXISTS "UserSession" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "city" TEXT,
  "region" TEXT,
  "country" TEXT,
  "lastIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "anomalyAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT
);
CREATE INDEX IF NOT EXISTS "UserSession_user_idx" ON "UserSession"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "UserSession_clinic_idx" ON "UserSession"("clinicId","lastSeenAt");
ALTER TABLE "UserSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "UserSession" FROM anon, authenticated;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'UserSession';
