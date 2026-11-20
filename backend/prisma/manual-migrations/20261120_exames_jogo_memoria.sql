-- DentalPos One — EduMaster: progresso do jogo da memória (ENADE · ENAMED · OAB)
-- Rodar no SQL Editor do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg) ANTES do deploy do backend. Só cria; idempotente; não altera tabelas existentes.
-- A tabela nasce com RLS ligado e sem acesso para anon/authenticated (o backend acessa pelo usuário do banco).

CREATE TABLE IF NOT EXISTS "ExaMemoriaSerie" (
  "id"         TEXT PRIMARY KEY,
  "tenantId"   TEXT NOT NULL,
  "studentId"  TEXT NOT NULL,
  "serieId"    TEXT NOT NULL,
  "prova"      TEXT NOT NULL,
  "curso"      TEXT NOT NULL,
  "disciplina" TEXT NOT NULL,
  "tema"       TEXT NOT NULL,
  "numero"     INTEGER NOT NULL,
  "melhorNota" DOUBLE PRECISION NOT NULL,
  "perfeita"   BOOLEAN NOT NULL DEFAULT false,
  "erros"      INTEGER NOT NULL DEFAULT 0,
  "ajudas"     INTEGER NOT NULL DEFAULT 0,
  "ultimaNota" DOUBLE PRECISION NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 1,
  "melhorEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExaMemoriaSerie_tenantId_studentId_serieId_key" ON "ExaMemoriaSerie"("tenantId", "studentId", "serieId");
CREATE INDEX IF NOT EXISTS "ExaMemoriaSerie_tenantId_studentId_idx" ON "ExaMemoriaSerie"("tenantId", "studentId");
CREATE INDEX IF NOT EXISTS "ExaMemoriaSerie_tenantId_curso_disciplina_idx" ON "ExaMemoriaSerie"("tenantId", "curso", "disciplina");

ALTER TABLE "ExaMemoriaSerie" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ExaMemoriaSerie" FROM anon, authenticated;
