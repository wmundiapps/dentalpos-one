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
