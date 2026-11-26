-- Parceiros (20/11/2026): Corretor Parceiro (capta o espaço e recebe a chancela do anúncio) e
-- Zelador Parceiro (entrega o acesso, faz a vistoria de entrada e saída e atende durante a reserva).
-- Cada um recebe uma taxa por reserva, paga pelo locatário "por fora" da locação; o SpaceHour recebe
-- junto com a comissão e repassa até o dia 10 do mês seguinte ao check-out.

CREATE TABLE IF NOT EXISTS partners (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  roles              TEXT[] NOT NULL,                      -- broker | caretaker
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  tax_id             TEXT NOT NULL,                        -- CNPJ (só dígitos): parceria sempre PJ–PJ
  phone              TEXT NOT NULL,                        -- celular com WhatsApp (só dígitos, sem 55)
  creci              TEXT,                                 -- obrigatório para corretor (Lei 6.530/78)
  creci_uf           CHAR(2),
  pix_key            TEXT NOT NULL,                        -- chave Pix no nome do próprio parceiro
  cities             TEXT NOT NULL,                        -- cidades em que atende
  about              TEXT,
  ref_code           TEXT NOT NULL UNIQUE,                 -- link de indicação: /parceiros?ref=CODE
  telegram_chat_id   TEXT,
  telegram_link_token TEXT UNIQUE,
  terms_version      TEXT NOT NULL,
  terms_accepted_at  TIMESTAMPTZ NOT NULL,
  terms_ip           TEXT,
  decided_by         TEXT,
  decided_at         TIMESTAMPTZ,
  decision_note      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculo parceiro ↔ anúncio. Sempre com o consentimento das duas partes (anfitrião e parceiro).
CREATE TABLE IF NOT EXISTS listing_partners (
  id             TEXT PRIMARY KEY,
  listing_id     TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('broker','caretaker')),
  status         TEXT NOT NULL CHECK (status IN ('pending_host','pending_partner','active','ended','declined')),
  caretaker_fee  NUMERIC(16,4),
  can_edit       BOOLEAN NOT NULL DEFAULT false,           -- anfitrião autoriza o parceiro a editar o anúncio
  origin         TEXT NOT NULL CHECK (origin IN ('host_invite','partner_request','referral')),
  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at    TIMESTAMPTZ,
  end_requested_at TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,                               -- fim do aviso prévio de 30 dias
  ended_at       TIMESTAMPTZ,
  end_reason     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS listing_partners_one_open ON listing_partners (listing_id, role)
  WHERE status IN ('pending_host','pending_partner','active');
CREATE INDEX IF NOT EXISTS listing_partners_user_idx ON listing_partners (user_id, status);

-- Parceiros ativos copiados no anúncio (o preço é calculado sem consulta extra)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS broker_id TEXT REFERENCES users(id);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS caretaker_id TEXT REFERENCES users(id);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS caretaker_fee NUMERIC(16,4);

-- Indicação: anfitrião que se cadastrou pelo link do corretor
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_partner TEXT REFERENCES users(id);

-- Valores a repassar a cada parceiro por reserva
CREATE TABLE IF NOT EXISTS partner_earnings (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('broker','caretaker')),
  gross       NUMERIC(16,4) NOT NULL,                       -- taxa cobrada do locatário
  amount      NUMERIC(16,4) NOT NULL,                       -- a repassar (menos o que foi devolvido ao locatário)
  currency    CHAR(3) NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('held','due','paid','void','blocked')),
  due_month   TEXT,                                         -- AAAA-MM do check-out; paga até o dia 10 do mês seguinte
  paid_at     TIMESTAMPTZ,
  paid_ref    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, role)
);
CREATE INDEX IF NOT EXISTS partner_earnings_user_idx ON partner_earnings (user_id, status);

-- Vistoria de entrada e saída e registro de manutenção, com fotos
CREATE TABLE IF NOT EXISTS inspections (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT REFERENCES bookings(id),
  listing_id  TEXT NOT NULL REFERENCES listings(id),
  kind        TEXT NOT NULL CHECK (kind IN ('check_in','check_out','maintenance')),
  author_id   TEXT NOT NULL REFERENCES users(id),
  checklist   JSONB NOT NULL DEFAULT '{}',
  notes       TEXT,
  photos      TEXT[] NOT NULL DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspections_booking_idx ON inspections (booking_id);
CREATE INDEX IF NOT EXISTS inspections_listing_idx ON inspections (listing_id, created_at DESC);

-- Avisos instantâneos (Telegram e WhatsApp) em fila: gravados na transação e enviados pela rotina
CREATE TABLE IF NOT EXISTS instant_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','skipped','failed')),
  channels    TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS instant_messages_pending_idx ON instant_messages (created_at) WHERE status = 'pending';
