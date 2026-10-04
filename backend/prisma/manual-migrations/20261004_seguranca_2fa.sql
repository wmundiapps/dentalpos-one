-- Segurança: verificação em 2 etapas (TOTP) e bloqueio por tentativas de login.
-- Idempotente. O app também cria esta tabela sozinho na primeira utilização (CREATE TABLE IF NOT EXISTS),
-- mas aplique este script no Supabase (SQL Editor) para manter o banco versionado.
CREATE TABLE IF NOT EXISTS "UserSecurity" (
  "userId"       TEXT PRIMARY KEY,
  "totpSecret"   TEXT,                       -- criptografado (AES-256-GCM)
  "totpEnabled"  BOOLEAN NOT NULL DEFAULT FALSE,
  "lastCounter"  BIGINT,                     -- impede reutilizar o mesmo código (replay)
  "backupCodes"  TEXT NOT NULL DEFAULT '[]', -- hashes SHA-256 dos códigos de recuperação
  "failedLogins" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"  TIMESTAMPTZ,
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- RLS: nenhuma política = acesso apenas pelo backend (service role / conexão direta).
ALTER TABLE "UserSecurity" ENABLE ROW LEVEL SECURITY;
