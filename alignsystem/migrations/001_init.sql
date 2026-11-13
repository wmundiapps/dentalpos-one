-- AlignSystem — esquema inicial
-- Tudo fica no schema definido em DATABASE_SCHEMA (padrão: alignsystem).

create table if not exists dentists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cro text not null,
  cro_uf text,
  email text,
  phone text not null,
  city text not null,
  state text,
  experience text,
  cpf_cnpj text,
  birth_date date,
  company_type text,
  income_value numeric(12,2),
  address text,
  address_number text,
  province text,
  postal_code text,
  status text not null default 'lead'
    check (status in ('lead','em_analise','aprovado','ativo','inativo','recusado')),
  asaas_account_id text,
  asaas_wallet_id text,
  notes text,
  consent_at timestamptz,
  consent_ip text,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dentists_status_idx on dentists (status, created_at desc);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin','dentist')),
  password_hash text,
  dentist_id uuid references dentists(id) on delete set null,
  active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists password_tokens (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  code serial unique,
  token text not null unique,
  name text not null,
  age int,
  whatsapp text not null,
  email text,
  city text not null,
  reason text,
  referred_by text,
  status text not null default 'novo' check (status in (
    'novo','fotos_enviadas','parecer_enviado','documentacao_agendada','documentacao_realizada',
    'plano_apresentado','contrato_enviado','contrato_assinado','em_tratamento','finalizado','perdido')),
  assessment text check (assessment in ('indicado','avaliacao_presencial','nao_indicado')),
  assessment_notes text,
  assessment_published_at timestamptz,
  dentist_id uuid references dentists(id) on delete set null,
  plan jsonb not null default '{}'::jsonb,
  cpf text,
  birth_date date,
  address text,
  postal_code text,
  asaas_customer_id text,
  internal_notes text,
  photos_submitted_at timestamptz,
  consent_at timestamptz,
  consent_ip text,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cases_status_idx on cases (status, created_at desc);
create index if not exists cases_dentist_idx on cases (dentist_id);

create table if not exists evidences (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete set null,
  milestone text not null check (milestone in
    ('documentacao','instalacao','inicio_alinhadores','acompanhamento','finalizacao','consulta_avulsa')),
  notes text,
  performed_at date not null default current_date,
  validated_at timestamptz,
  validated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists evidences_case_idx on evidences (case_id);

-- Fotos ficam no próprio banco (bytea), comprimidas no navegador antes do envio.
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  evidence_id uuid references evidences(id) on delete cascade,
  slot int,
  kind text not null check (kind in ('avaliacao','extra','evidencia','documento')),
  mime text not null,
  size int not null,
  data bytea not null,
  uploaded_by text not null check (uploaded_by in ('paciente','dentista','admin')),
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists photos_case_idx on photos (case_id, kind, slot);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete set null,
  kind text not null check (kind in ('teleorientacao','documentacao','consulta')),
  starts_at timestamptz not null,
  duration_min int not null default 30,
  room_url text,
  location text,
  status text not null default 'agendado' check (status in ('agendado','realizado','cancelado','faltou')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists appointments_case_idx on appointments (case_id, starts_at);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('paciente','parceiro')),
  case_id uuid references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete cascade,
  token text not null unique,
  title text not null,
  body text not null,
  body_hash text not null,
  status text not null default 'enviado' check (status in ('enviado','aceito','cancelado')),
  accepted_at timestamptz,
  accepted_name text,
  accepted_doc text,
  accepted_ip text,
  accepted_ua text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cobrança criada pela AlignSystem (avulsa, parcelada ou assinatura mensal)
create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete set null,
  kind text not null check (kind in ('avulsa','parcelada','assinatura')),
  description text not null,
  billing_type text not null,
  value numeric(12,2) not null,
  installment_count int,
  due_date date not null,
  split jsonb,
  asaas_payment_id text,
  asaas_installment_id text,
  asaas_subscription_id text,
  invoice_url text,
  status text not null default 'pendente',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists charges_case_idx on charges (case_id);

-- Cada pagamento individual no Asaas (parcelas e mensalidades), atualizado por webhook
create table if not exists payments (
  asaas_payment_id text primary key,
  charge_id uuid references charges(id) on delete cascade,
  case_id uuid references cases(id) on delete cascade,
  value numeric(12,2),
  net_value numeric(12,2),
  due_date date,
  status text,
  billing_type text,
  invoice_url text,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id bigserial primary key,
  case_id uuid references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete cascade,
  actor text not null,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_case_idx on events (case_id, created_at desc);
create index if not exists events_dentist_idx on events (dentist_id, created_at desc);

create table if not exists webhook_events (
  id bigserial primary key,
  provider text not null,
  event text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- Limite simples de envios públicos por IP
create table if not exists rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_idx on rate_hits (key, at);
