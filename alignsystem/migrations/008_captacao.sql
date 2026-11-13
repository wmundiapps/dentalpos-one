-- Captação de dentistas (playbook do ClubeFaz, item 1): lista de contatos e lista permanente de "não quero receber".
create table if not exists prospects (
  id              uuid primary key default gen_random_uuid(),
  cnpj            text unique check (cnpj ~ '^[0-9]{14}$'),
  name            text not null,
  category        text not null,
  cnae            text,
  priority        boolean not null default false,       -- nome sugere ortodontia/alinhadores: entra primeiro na fila
  uf              char(2) not null,
  city            text not null,
  phone           text,                                 -- só dígitos, com DDD
  mobile          boolean not null default false,       -- celular (aceita WhatsApp)
  email           text,
  status          text not null default 'novo' check (status in ('novo', 'convidado', 'cadastrado', 'saiu')),
  invite_token    text not null unique default replace(gen_random_uuid()::text, '-', ''),
  invited_at      timestamptz,
  invited_by      uuid references users(id) on delete set null,
  invite_channel  text check (invite_channel in ('whatsapp', 'email')),
  visited_at      timestamptz,
  converted_at    timestamptz,
  converted_dentist uuid references dentists(id) on delete set null,
  opted_out_at    timestamptz,
  origin          text not null,                        -- de onde veio o contato (base legal e transparência)
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists prospects_filter_idx on prospects (status, uf, category);
create index if not exists prospects_city_idx on prospects (uf, lower(city));

-- Quem pediu para sair: só o hash (sha256) do CNPJ, telefone ou e-mail. Bloqueia reimportação para sempre.
create table if not exists prospect_blocklist (
  hash        text primary key,
  kind        text not null check (kind in ('cnpj', 'phone', 'email')),
  created_at  timestamptz not null default now()
);
