-- LavaPos: base multiempresa. Cada lava-rápido é um "tenant"; os dados de negócio ficam em `records` (jsonb por tipo).
-- RLS ligado e sem política para anon/authenticated: só o servidor (papel dono do banco) acessa.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  owner_name    TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  cnpj          TEXT,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  monthly_fee_cents INT NOT NULL DEFAULT 11900,
  billing_status TEXT NOT NULL DEFAULT 'trial' CHECK (billing_status IN ('trial','ativa','inadimplente','cancelada')),
  settings      JSONB NOT NULL DEFAULT '{}',
  secrets       TEXT,                       -- JSON cifrado (AES-GCM): chave do Asaas etc.
  order_seq     INT NOT NULL DEFAULT 0,
  terms_version TEXT,
  terms_accepted_at TIMESTAMPTZ,
  terms_accepted_ip TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','staff','platform')),
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE records (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  kind       TEXT NOT NULL,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX records_tenant_kind ON records (tenant_id, kind, created_at DESC);
CREATE INDEX records_plate ON records (tenant_id, (data->>'plate')) WHERE kind = 'vehicle';
CREATE INDEX records_customer ON records (tenant_id, kind, (data->>'customerId'));
CREATE INDEX records_start ON records (tenant_id, (data->>'start')) WHERE kind = 'appointment';

-- Fila de mensagens (WhatsApp, SMS, e-mail). Nada é apagado: o status registra o resultado.
CREATE TABLE outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  to_addr      TEXT NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  topic        TEXT NOT NULL,              -- pronto | agenda | lembrete | boas-vindas ...
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviada','falhou','manual','descartada')),
  error        TEXT,
  dedupe_key   TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outbox_dedupe ON outbox (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX outbox_pending ON outbox (status, scheduled_at);

-- Quem pediu para não receber mensagens (LGPD): bloqueio por hash do contato.
CREATE TABLE optouts (
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  contact_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_hash)
);

-- Trilha de auditoria de segurança (login, falhas, mudanças sensíveis, exportações).
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID,
  user_id    UUID,
  action     TEXT NOT NULL,
  detail     JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant ON audit_log (tenant_id, created_at DESC);

-- Limite de tentativas (anti-força-bruta/abuso) que vale entre instâncias serverless.
CREATE TABLE rate_hits (
  bucket   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits     INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_hits ENABLE ROW LEVEL SECURITY;
