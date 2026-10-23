-- Segurança no Supabase: todas as tabelas com RLS ligado e sem nenhum acesso para anon/authenticated.
-- O app conecta direto no Postgres (dono das tabelas), então não é afetado. Isso fecha a API pública (PostgREST) do Supabase.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t.tablename);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t.tablename);
    end if;
  end loop;
end $$;

-- Tabelas criadas no futuro também nascem sem acesso para anon/authenticated
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
  end if;
end $$;
