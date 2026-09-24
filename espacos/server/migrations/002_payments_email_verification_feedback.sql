-- Pagamentos reais (Stripe / Mercado Pago), fila de e-mails, verificação de
-- registro profissional por IA, fotos enviadas e avaliação do app.

-- Reserva aguardando o pagamento no checkout do provedor (segura o horário por pouco tempo)
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'pending_payment','pending_guarantor','pending_host','confirmed','checked_in','completed',
  'cancelled_guest','cancelled_host','declined','expired','no_show'));
ALTER TABLE bookings ADD COLUMN payment_deadline TIMESTAMPTZ;
-- Confirmação do anfitrião de que conferiu o registro profissional do locatário
ALTER TABLE bookings ADD COLUMN host_license_check_at TIMESTAMPTZ;

ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'pending','authorized','captured','partially_refunded','refunded','voided','failed'));
ALTER TABLE payments ADD COLUMN provider_ref TEXT;          -- PaymentIntent (Stripe) / payment id (Mercado Pago)
ALTER TABLE payments ADD COLUMN checkout_ref TEXT;          -- Checkout Session / preferência
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
ALTER TABLE payments ADD COLUMN customer_ref TEXT;          -- cliente Stripe (cobranças posteriores)
ALTER TABLE payments ADD COLUMN payment_method_ref TEXT;    -- meio salvo para cobranças off-session
ALTER TABLE payments ADD COLUMN deposit_ref TEXT;           -- pré-autorização da caução (Stripe)
CREATE UNIQUE INDEX payments_checkout_ref_key ON payments (provider, checkout_ref) WHERE checkout_ref IS NOT NULL;

-- Eventos de webhook já processados (idempotência)
CREATE TABLE webhook_events (
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- Anúncio: o anfitrião assume a conferência do registro profissional
ALTER TABLE listings ADD COLUMN host_license_responsibility BOOLEAN NOT NULL DEFAULT false;

-- Fila de e-mails (enviada fora da transação que gerou a notificação)
ALTER TABLE notifications ADD COLUMN email_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (email_status IN ('pending','sent','failed','skipped'));
ALTER TABLE notifications ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN email_error TEXT;
ALTER TABLE notifications ADD COLUMN email_sent_at TIMESTAMPTZ;
UPDATE notifications SET email_status = 'skipped';
CREATE INDEX notifications_email_queue_idx ON notifications (created_at) WHERE email_status = 'pending';

-- Verificação de registro profissional
CREATE TABLE license_verifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  country_code    CHAR(2) NOT NULL,
  category        TEXT,
  body            TEXT NOT NULL,
  number          TEXT NOT NULL,
  region          TEXT,
  document        BYTEA,            -- foto/PDF do documento (privado, nunca servido publicamente)
  document_type   TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','needs_review')),
  ai_result       JSONB,
  reviewed_by     TEXT REFERENCES users(id),
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ
);
CREATE INDEX license_verifications_user_idx ON license_verifications (user_id, created_at DESC);
CREATE INDEX license_verifications_queue_idx ON license_verifications (status) WHERE status IN ('pending','needs_review');
ALTER TABLE users ADD COLUMN license_status TEXT NOT NULL DEFAULT 'none'
  CHECK (license_status IN ('none','pending','approved','rejected','needs_review'));
UPDATE users SET license_status = CASE WHEN license_verified THEN 'approved' WHEN license_body IS NOT NULL THEN 'needs_review' ELSE 'none' END;

-- Arquivos enviados (fotos dos espaços) quando o armazenamento é o próprio banco
CREATE TABLE uploads (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BYTEA,
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Avaliação do app, sugestões e relatos de erro
CREATE TABLE app_feedback (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  kind        TEXT NOT NULL CHECK (kind IN ('rating','suggestion','bug','other')),
  message     TEXT NOT NULL DEFAULT '',
  page        TEXT,
  locale      TEXT,
  user_agent  TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','planned','done','wont_fix')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX app_feedback_created_idx ON app_feedback (created_at DESC);
