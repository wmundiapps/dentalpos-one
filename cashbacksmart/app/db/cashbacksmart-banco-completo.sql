-- Cashbacksmart: banco completo (8 migrações). Cole no SQL Editor do projeto Supabase CERTO e clique em Run.
-- Gerado por: npm run bundle-sql. Roda tudo numa transação: se algo falhar, nada fica pela metade.
begin;

create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());

-- ===== 001_init.sql =====
-- Cashbacksmart — esquema inicial
-- Valores monetários em centavos (bigint). Percentuais em pontos-base (500 = 5%).

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('consumer','business','admin')),
  name text not null,
  email text not null,
  phone text,
  cpf text,
  password_hash text not null,
  city text not null,
  state char(2) not null,
  member_code text not null unique,
  referral_code text not null unique,
  referred_by uuid references users(id),
  ads_accepted_at timestamptz not null,
  email_optin boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));
create unique index users_cpf_uq on users (cpf) where cpf is not null;
create index users_city_idx on users (state, lower(city)) where role = 'consumer';

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id),
  name text not null,
  cnpj text,
  category text not null,
  description text not null default '',
  address text not null default '',
  neighborhood text not null default '',
  city text not null,
  state char(2) not null,
  phone text,
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now()
);
create index businesses_city_idx on businesses (state, lower(city), category);
create index businesses_owner_idx on businesses (owner_id);
create unique index businesses_cnpj_uq on businesses (cnpj) where cnpj is not null;

create table cashback_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('fixed','percent')),
  value int not null check (value > 0),              -- centavos (fixed) ou pontos-base (percent)
  min_purchase_cents bigint not null default 0,
  max_cashback_cents bigint,                          -- teto por compra (null = sem teto)
  weekdays int[],                                     -- 0=domingo..6=sábado; null = todos os dias
  release_days int not null default 0,                -- carência até o saldo liberar
  expires_days int not null default 180,              -- validade do saldo
  active boolean not null default true,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now()
);
create index cashback_rules_business_idx on cashback_rules (business_id) where active;

-- Assinaturas: pessoa física e empresa
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  business_id uuid references businesses(id),
  plan text not null check (plan in ('consumer','business')),
  price_cents bigint not null,
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  status text not null check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (business_id is null))
);
create unique index subscriptions_user_uq on subscriptions (user_id) where user_id is not null;
create unique index subscriptions_business_uq on subscriptions (business_id) where business_id is not null;
create index subscriptions_due_idx on subscriptions (current_period_end) where status in ('trialing','active','past_due');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  business_id uuid references businesses(id),
  subscription_id uuid references subscriptions(id),
  amount_cents bigint not null,
  status text not null default 'pending' check (status in ('pending','paid','canceled')),
  due_date date not null,
  period_start date,
  period_end date,
  paid_at timestamptz,
  provider text not null default 'manual',
  provider_ref text,
  payment_url text,
  created_at timestamptz not null default now()
);
create index invoices_business_idx on invoices (business_id, created_at desc);
create index invoices_user_idx on invoices (user_id, created_at desc);
create index invoices_pending_idx on invoices (due_date) where status = 'pending';
create unique index invoices_provider_ref_uq on invoices (provider, provider_ref) where provider_ref is not null;

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  kind text not null check (kind in ('subscription','cashback_fee','campaign_package')),
  description text not null,
  amount_cents bigint not null,
  ref_id uuid
);
create index invoice_items_invoice_idx on invoice_items (invoice_id);

-- Compras registradas pelas empresas
create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  consumer_id uuid not null references users(id),
  rule_id uuid references cashback_rules(id),
  amount_cents bigint not null check (amount_cents > 0),
  redeemed_cents bigint not null default 0,
  cashback_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  fee_invoice_id uuid references invoices(id),
  status text not null default 'confirmed' check (status in ('confirmed','canceled')),
  receipt text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index purchases_business_idx on purchases (business_id, created_at desc);
create index purchases_consumer_idx on purchases (consumer_id, created_at desc);
create index purchases_fee_open_idx on purchases (business_id) where fee_invoice_id is null and status = 'confirmed' and fee_cents > 0;

-- Livro-razão da carteira (saldo por loja)
create table wallet_entries (
  id uuid primary key default gen_random_uuid(),
  consumer_id uuid not null references users(id),
  business_id uuid not null references businesses(id),
  purchase_id uuid references purchases(id),
  kind text not null check (kind in ('credit','debit','expire','reversal')),
  amount_cents bigint not null,          -- positivo em credit; negativo em debit/expire/reversal
  remaining_cents bigint not null default 0,  -- só em credit: quanto ainda não foi usado
  available_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index wallet_consumer_idx on wallet_entries (consumer_id, business_id);
create index wallet_open_credits_idx on wallet_entries (consumer_id, business_id, expires_at) where kind = 'credit' and remaining_cents > 0;

-- Código de resgate gerado pelo consumidor e informado no caixa
create table redemption_codes (
  code text primary key,
  consumer_id uuid not null references users(id),
  business_id uuid not null references businesses(id),
  max_cents bigint not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Campanhas de e-mail: locais (inclusas) e nacionais (pacotes pagos)
create table campaign_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emails int not null,
  price_cents bigint not null,
  active boolean not null default true
);

create table business_email_credits (
  business_id uuid primary key references businesses(id),
  national_emails int not null default 0
);

create table package_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  package_id uuid not null references campaign_packages(id),
  invoice_id uuid not null references invoices(id),
  credited_at timestamptz,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  scope text not null check (scope in ('local','national')),
  subject text not null,
  body text not null,
  target_state char(2),
  target_city text,
  status text not null default 'draft' check (status in ('draft','queued','sending','sent','failed')),
  recipients int not null default 0,
  sent_count int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index campaigns_business_idx on campaigns (business_id, created_at desc);
create index campaigns_feed_idx on campaigns (target_state, lower(target_city), created_at desc) where status in ('sending','sent');

create table email_outbox (
  id bigserial primary key,
  campaign_id uuid references campaigns(id),
  to_email text not null,
  user_id uuid references users(id),
  subject text not null,
  html text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_pending_idx on email_outbox (id) where status = 'pending';

create table audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

insert into campaign_packages (name, emails, price_cents) values
  ('Nacional 10 mil e-mails', 10000, 9900),
  ('Nacional 50 mil e-mails', 50000, 39900),
  ('Nacional 200 mil e-mails', 200000, 129000),
  ('Nacional 1 milhão de e-mails', 1000000, 490000);

insert into schema_migrations (name) values ('001_init.sql') on conflict do nothing;

-- ===== 002_members.sql =====
-- Vários usuários por empresa (dono e operadores de caixa)
create table business_members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on business_members (user_id);

insert into schema_migrations (name) values ('002_members.sql') on conflict do nothing;

-- ===== 003_robots.sql =====
-- Robôs: antifraude, atendimento automático e avisos automáticos

create table fraud_flags (
  id bigserial primary key,
  kind text not null,
  business_id uuid references businesses(id),
  consumer_id uuid references users(id),
  ref text not null,
  details jsonb not null default '{}',
  action text not null default 'flagged' check (action in ('flagged','blocked')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, ref)
);
create index fraud_flags_open_idx on fraud_flags (created_at desc) where resolved_at is null;

create table bot_messages (
  id bigserial primary key,
  user_id uuid references users(id),
  channel text not null default 'app' check (channel in ('app','whatsapp')),
  role text not null check (role in ('user','assistant')),
  content text not null,
  resolved boolean,
  created_at timestamptz not null default now()
);
create index bot_messages_user_idx on bot_messages (user_id, created_at desc);
create index bot_messages_unresolved_idx on bot_messages (created_at desc) where resolved = false;

create table notifications_sent (
  kind text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);

alter table email_outbox add column kind text not null default 'campaign';
alter table campaigns add column moderation jsonb;

insert into schema_migrations (name) values ('003_robots.sql') on conflict do nothing;

-- ===== 004_push.sql =====
-- Notificações push dos apps (Apple/Google via Firebase Cloud Messaging)
create table push_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens (user_id);

insert into schema_migrations (name) values ('004_push.sql') on conflict do nothing;

-- ===== 005_security.sql =====
-- Segurança: 2FA, recuperação de senha, bloqueio por tentativas, limites, avisos do sistema

alter table users add column totp_secret text;            -- criptografado (AES-256-GCM)
alter table users add column totp_enabled boolean not null default false;
alter table users add column recovery_codes text[];       -- hashes SHA-256
alter table users add column session_version int not null default 1;
alter table users add column failed_logins int not null default 0;
alter table users add column locked_until timestamptz;

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_resets_user_idx on password_resets (user_id, created_at desc);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table login_events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  email text,
  ip text,
  user_agent text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index login_events_user_idx on login_events (user_id, created_at desc);

create table system_notices (
  id bigserial primary key,
  kind text not null check (kind in ('info','maintenance','update','incident')),
  message text not null,
  audience text not null default 'all' check (audience in ('all','consumer','business')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into schema_migrations (name) values ('005_security.sql') on conflict do nothing;

-- ===== 006_modelo_c.sql =====
-- Modelo C: cliente grátis (Premium opcional), loja 6 meses grátis + R$ 49,90/mês + 20% do cashback usado.
-- Promoção de boas-vindas, nota fiscal enviada pelo cliente, verificação de celular.

-- Promoções para clientes novos
alter table cashback_rules add column audience text not null default 'all' check (audience in ('all','new_customer'));
alter table cashback_rules add column new_window_days int; -- null = só na primeira compra; N = primeiros N dias desde a primeira compra

-- Compras lançadas pelo cliente (nota fiscal) aguardando a loja
alter table purchases drop constraint purchases_status_check;
alter table purchases add constraint purchases_status_check check (status in ('confirmed','canceled','pending','rejected'));
alter table purchases add column source text not null default 'store' check (source in ('store','customer'));
alter table purchases add column nfce_key text;
alter table purchases add column decided_at timestamptz;
alter table purchases add column decided_by uuid references users(id);
alter table purchases add column reject_reason text;
create unique index purchases_nfce_uq on purchases (nfce_key) where nfce_key is not null and status <> 'rejected';
create index purchases_pending_idx on purchases (business_id, created_at) where status = 'pending';
create index purchases_claims_idx on purchases (consumer_id, created_at) where source = 'customer';

-- Celular verificado e Premium
alter table users add column phone_verified_at timestamptz;
alter table users add column premium_until timestamptz;
create unique index users_phone_verified_uq on users (phone) where phone_verified_at is not null and role = 'consumer';

create table phone_codes (
  user_id uuid primary key references users(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);

alter table invoice_items drop constraint invoice_items_kind_check;
alter table invoice_items add constraint invoice_items_kind_check check (kind in ('subscription','cashback_fee','campaign_package','premium'));

-- Clientes passam a ser grátis: a assinatura vira um registro sem cobrança
update subscriptions set price_cents = 0, status = 'active', current_period_end = '2999-12-31'
 where plan = 'consumer';

insert into schema_migrations (name) values ('006_modelo_c.sql') on conflict do nothing;

-- ===== 007_mes_leads_kit.sql =====
-- Cobrança no dia 1º do mês seguinte, cancelamento sem multa, avisos por WhatsApp/SMS,
-- captação de leads para lojistas e kit do caixa (QR da loja + nota por foto).

-- Cancelamento: a loja usa até o fim do mês e recebe uma última fatura
alter table subscriptions add column canceled_at timestamptz;
alter table subscriptions add column final_billed_at timestamptz;

-- Canal de aviso automático do cliente (além do e-mail): WhatsApp ou SMS
alter table users add column notify_channel text not null default 'whatsapp' check (notify_channel in ('whatsapp','sms','none'));

create table message_outbox (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','sms')),
  to_phone text not null,
  body text not null,
  kind text not null default 'notice',
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index message_outbox_pending_idx on message_outbox (id) where status = 'pending';

-- Kit do caixa: código curto e fixo de cada loja (vai no QR impresso)
alter table businesses add column kit_code text;
update businesses set kit_code = upper(substr(md5(id::text), 1, 8)) where kit_code is null;
alter table businesses alter column kit_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
alter table businesses alter column kit_code set not null;
create unique index businesses_kit_code_uq on businesses (kit_code);

-- Nota enviada por foto (sem QR): número da nota + foto guardada à parte
alter table purchases add column claim_method text check (claim_method in ('qr','photo'));
alter table purchases add column nf_number text;
create unique index purchases_nf_number_uq on purchases (business_id, nf_number) where nf_number is not null and status <> 'rejected';

create table claim_photos (
  purchase_id uuid primary key references purchases(id) on delete cascade,
  mime text not null,
  bytes bytea not null,
  sha256 text not null,
  created_at timestamptz not null default now()
);
create index claim_photos_sha_idx on claim_photos (sha256);

-- Captação de leads (páginas de oferta que coletam contatos e repassam aos lojistas)
create table lead_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  business_id uuid references businesses(id) on delete cascade,  -- null = página da plataforma (categoria/cidade)
  title text not null,
  offer text not null,
  category text,
  city text,
  state char(2),
  question text,                 -- pergunta opcional ("O que você procura?")
  active boolean not null default true,
  views int not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index lead_pages_business_idx on lead_pages (business_id);

create table leads (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references lead_pages(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  city text,
  state char(2),
  answer text,
  consent_at timestamptz not null,
  ip_hash text,
  user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index leads_page_phone_uq on leads (page_id, phone);
create index leads_created_idx on leads (created_at);

create table lead_deliveries (
  lead_id uuid not null references leads(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  status text not null default 'new' check (status in ('new','contacted','converted','lost')),
  delivered_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (lead_id, business_id)
);
create index lead_deliveries_business_idx on lead_deliveries (business_id, delivered_at desc);

insert into schema_migrations (name) values ('007_mes_leads_kit.sql') on conflict do nothing;

-- ===== 008_rls.sql =====
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

insert into schema_migrations (name) values ('008_rls.sql') on conflict do nothing;

commit;
