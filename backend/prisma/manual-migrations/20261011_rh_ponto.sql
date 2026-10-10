-- RH: ponto eletrônico (batidas com IP e localização) e justificativas de falta/atestado.
CREATE TABLE IF NOT EXISTS "HRTimePunch" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL REFERENCES "HREmployee"("id") ON DELETE CASCADE,
  "userId" TEXT,
  "kind" TEXT NOT NULL,
  "punchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "insideWorkplace" BOOLEAN,
  "workplaceNote" TEXT,
  "method" TEXT NOT NULL DEFAULT 'PASSWORD',
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HRTimePunch_clinicId_punchedAt_idx" ON "HRTimePunch"("clinicId","punchedAt");
CREATE INDEX IF NOT EXISTS "HRTimePunch_employeeId_punchedAt_idx" ON "HRTimePunch"("employeeId","punchedAt");

CREATE TABLE IF NOT EXISTS "HRAbsenceRequest" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL REFERENCES "HREmployee"("id") ON DELETE CASCADE,
  "userId" TEXT,
  "absenceDate" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "attachments" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "decisionNote" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HRAbsenceRequest_clinicId_status_idx" ON "HRAbsenceRequest"("clinicId","status");
CREATE INDEX IF NOT EXISTS "HRAbsenceRequest_employeeId_absenceDate_idx" ON "HRAbsenceRequest"("employeeId","absenceDate");

-- Mesma proteção das demais tabelas: só o servidor acessa.
ALTER TABLE "HRTimePunch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HRAbsenceRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "HRTimePunch" FROM anon, authenticated;
REVOKE ALL ON "HRAbsenceRequest" FROM anon, authenticated;

-- Dados de RH completos só para RH, administração e gestor.
INSERT INTO "AccessProfilePermission" ("profileId","permissionId","createdAt")
SELECT p."id", perm."id", now()
FROM "AccessProfile" p
JOIN "Permission" perm ON perm."code" IN ('hr.view','hr.create','hr.edit','hr.sensitive')
WHERE p."code" IN ('RH','ADMINISTRACAO','GESTOR')
ON CONFLICT DO NOTHING;

DELETE FROM "AccessProfilePermission"
WHERE "profileId" IN (SELECT "id" FROM "AccessProfile" WHERE "code" = 'JURIDICO')
  AND "permissionId" IN (SELECT "id" FROM "Permission" WHERE "code" LIKE 'hr.%');
