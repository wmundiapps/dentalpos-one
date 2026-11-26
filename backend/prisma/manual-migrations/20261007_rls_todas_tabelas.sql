-- DentalPos One - fecha o acesso direto ao banco pela API pública do Supabase (PostgREST).
-- O backend usa o usuário "postgres" (BYPASSRLS), então NADA muda para o sistema.
-- Rodar no SQL Editor do Supabase (projeto lfeqfzvmasqnnmqvkjyg). Seguro e reversível.

-- 1) Liga RLS em TODAS as tabelas do schema public que ainda não têm (sem políticas = anon/authenticated não leem nem gravam).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2) Tira qualquer permissão direta dos papéis públicos (anon = chave pública; authenticated = usuários do Supabase Auth, que não usamos).
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3) Tabelas criadas no futuro já nascem sem acesso para esses papéis.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Conferência (deve mostrar sem_rls = 0):
SELECT count(*) FILTER (WHERE rowsecurity) AS com_rls, count(*) FILTER (WHERE NOT rowsecurity) AS sem_rls FROM pg_tables WHERE schemaname = 'public';
