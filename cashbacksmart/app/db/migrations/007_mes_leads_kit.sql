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
