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
