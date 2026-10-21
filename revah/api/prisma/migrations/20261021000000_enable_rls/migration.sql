-- Segurança (Supabase Security Advisor: "RLS Disabled in Public").
-- O REVAH acessa o banco só pela própria API (Prisma, usuário dono das tabelas, que não é afetado pelo RLS).
-- Ligar o RLS sem nenhuma política fecha as tabelas para a API pública do Supabase (chaves anon/authenticated):
-- ninguém consegue ler ou gravar por fora do REVAH, mesmo com a chave do projeto.
-- Tabelas novas: toda migração que criar tabela deve repetir este ALTER para ela.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
