-- Escaneamento pago antes do tratamento: preços configuráveis no painel e pedido com aceite do termo.
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id) on delete set null
);
alter table charges drop constraint if exists charges_kind_check;
alter table charges add constraint charges_kind_check check (kind in ('integral','avulsa','parcelada','assinatura','escaneamento'));
create table if not exists scan_orders (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  charge_id      uuid references charges(id) on delete set null,
  price          numeric(12,2) not null,
  billing_type   text not null,
  status         text not null default 'aguardando_pagamento'
                 check (status in ('aguardando_pagamento','pago','agendado','realizado','cancelado')),
  terms_version  text not null,
  terms_hash     text not null,
  accepted_name  text not null,
  accepted_cpf   text not null,
  accepted_ip    text,
  accepted_ua    text,
  accepted_at    timestamptz not null default now(),
  paid_at        timestamptz,
  preference     text,
  preference_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists scan_orders_case_idx on scan_orders (case_id, created_at desc);
