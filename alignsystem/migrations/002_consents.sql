-- Termo de Consentimento Livre e Esclarecido (TCLE) para atendimento a distância
-- (Resolução CFO nº 278/2025). Cada versão do texto fica guardada; cada aceite aponta
-- para a versão exata aceita, com hash, data/hora, IP e navegador. Registros não são apagados
-- junto com o caso, para servirem de prova.

create table if not exists consent_texts (
  version text primary key,
  kind text not null,
  title text not null,
  body text not null,
  body_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete set null,
  case_code int,
  kind text not null,
  version text not null references consent_texts(version),
  body_hash text not null,
  patient_name text not null,
  accepted_name text not null,
  accepted_by_guardian boolean not null default false,
  guardian_name text,
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);
create index if not exists consents_case_idx on consents (case_id, kind, accepted_at desc);
