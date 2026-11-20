-- Plano SpaceHour (20/11/2026): o locatário paga 6 ou 12 meses adiantados com 10% de desconto e recebe crédito
-- para pagar a locação (nunca as taxas de corretor e zelador). O SpaceHour paga o anfitrião por Pix.

CREATE TABLE IF NOT EXISTS plans (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  months         INTEGER NOT NULL CHECK (months IN (6, 12)),
  monthly_amount NUMERIC(16,4) NOT NULL,
  credit_total   NUMERIC(16,4) NOT NULL,                  -- crédito em reais (valor cheio)
  price_paid     NUMERIC(16,4) NOT NULL,                  -- com 10% de desconto
  method         TEXT NOT NULL CHECK (method IN ('pix','card')),
  status         TEXT NOT NULL CHECK (status IN ('pending_payment','active','refunded','cancelled','expired')),
  provider       TEXT,
  provider_ref   TEXT,
  checkout_url   TEXT,
  paid_at        TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  valid_until    TIMESTAMPTZ,                             -- fim + 90 dias
  refund_amount  NUMERIC(16,4),
  refund_rule    TEXT,
  refunded_at    TIMESTAMPTZ,
  terms_version  TEXT NOT NULL,
  terms_ip       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plans_user_idx ON plans (user_id, status);

-- Extrato do crédito (positivo entra, negativo sai), em reais de crédito
CREATE TABLE IF NOT EXISTS plan_entries (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES plans(id),
  booking_id  TEXT REFERENCES bookings(id),
  kind        TEXT NOT NULL CHECK (kind IN ('purchase','booking','booking_refund','plan_refund','expiry')),
  amount      NUMERIC(16,4) NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_entries_plan_idx ON plan_entries (plan_id, created_at);

-- Chave Pix para receber (anfitrião das reservas do plano; parceiros usam a de partners)
CREATE TABLE IF NOT EXISTS pix_accounts (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pix_key      TEXT NOT NULL,
  holder_name  TEXT NOT NULL,
  holder_tax_id TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repasses por Pix feitos pelo SpaceHour (anfitrião nas reservas do plano)
CREATE TABLE IF NOT EXISTS host_payouts (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  amount      NUMERIC(16,4) NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('scheduled','due','paid','void','failed')),
  due_at      TIMESTAMPTZ NOT NULL,
  paid_at     TIMESTAMPTZ,
  paid_ref    TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_payouts_status_idx ON host_payouts (status, due_at);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS accepts_plan BOOLEAN NOT NULL DEFAULT true;
