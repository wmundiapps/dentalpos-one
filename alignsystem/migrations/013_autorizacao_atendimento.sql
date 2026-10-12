-- Autorização prévia de atendimento: o dentista pede, a AlignSystem autoriza; só então o atendimento
-- pode ser registrado, com o que foi feito e as assinaturas do paciente e do dentista.
create table if not exists authorizations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  dentist_id uuid references dentists(id) on delete set null,
  milestone text not null,
  urgency text not null check (urgency in ('rotina', 'urgencia')),
  justification text not null,
  planned_for date,
  status text not null default 'solicitada' check (status in ('solicitada', 'autorizada', 'negada', 'realizada', 'cancelada')),
  over_limit boolean not null default false,
  requested_by uuid references users(id) on delete set null,
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists authorizations_case_idx on authorizations (case_id, created_at desc);
create index if not exists authorizations_status_idx on authorizations (status, created_at desc);

alter table evidences add column if not exists authorization_id uuid references authorizations(id) on delete set null;
alter table evidences add column if not exists patient_signature bytea;
alter table evidences add column if not exists dentist_signature bytea;
alter table evidences add column if not exists patient_signer text;
alter table evidences add column if not exists signed_at timestamptz;
alter table evidences add column if not exists signed_ip text;
alter table evidences add column if not exists signatures_hash text;
create unique index if not exists evidences_authorization_uidx on evidences (authorization_id) where authorization_id is not null;
