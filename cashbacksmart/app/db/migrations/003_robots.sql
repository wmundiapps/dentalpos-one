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
