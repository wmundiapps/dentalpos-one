-- Verificação em 2 etapas (aplicativo autenticador). Tabela própria: não mexe na tabela de usuários.
CREATE TABLE IF NOT EXISTS public."UserTwoFactor" (
  "userId" TEXT PRIMARY KEY REFERENCES public."User"("id") ON DELETE CASCADE,
  "secret" TEXT,
  "pending" TEXT,
  "enabledAt" TIMESTAMP(3),
  "lastStep" INTEGER,
  "backupHashes" TEXT[] NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."UserTwoFactor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."UserTwoFactor" FROM anon, authenticated;
