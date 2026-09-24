-- SpaceHour — esquema inicial (PostgreSQL 14+)
-- Valores monetários em NUMERIC(16,4) na moeda do espaço (sem conversão).

CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  name               TEXT NOT NULL,
  phone              TEXT,
  country_code       CHAR(2) NOT NULL,
  locale             TEXT NOT NULL,
  roles              TEXT[] NOT NULL DEFAULT '{guest}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  identity_verified  BOOLEAN NOT NULL DEFAULT false,
  document_type      TEXT,
  document_number    TEXT,
  license_body       TEXT,
  license_number     TEXT,
  license_region     TEXT,
  license_verified   BOOLEAN NOT NULL DEFAULT false,
  company_tax_id     TEXT,
  bio                TEXT,
  suspended_until    TIMESTAMPTZ,
  banned             BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at  TIMESTAMPTZ,
  terms_version      TEXT
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE user_strikes (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT NOT NULL,
  incident_id  TEXT
);
CREATE INDEX user_strikes_user_idx ON user_strikes (user_id, at);

CREATE TABLE listings (
  id                   TEXT PRIMARY KEY,
  host_id              TEXT NOT NULL REFERENCES users(id),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('dental','medical','psychology','physio','aesthetics','nutrition','veterinary','law','classroom','auditorium','meeting','coworking','studio','lab','kitchen','other')),
  country_code         CHAR(2) NOT NULL,
  city                 TEXT NOT NULL,
  timezone             TEXT NOT NULL,
  neighborhood         TEXT,
  address              TEXT NOT NULL,
  capacity             INTEGER NOT NULL CHECK (capacity > 0),
  area_m2              NUMERIC(10,2),
  amenities            TEXT[] NOT NULL DEFAULT '{}',
  equipment            TEXT NOT NULL DEFAULT '',
  photos               TEXT[] NOT NULL DEFAULT '{}',
  currency             CHAR(3) NOT NULL,
  price_per_hour       NUMERIC(16,4) NOT NULL CHECK (price_per_hour > 0),
  price_per_day        NUMERIC(16,4),
  min_hours            INTEGER NOT NULL CHECK (min_hours BETWEEN 1 AND 12),
  cleaning_fee         NUMERIC(16,4) NOT NULL DEFAULT 0,
  security_deposit     NUMERIC(16,4) NOT NULL DEFAULT 0,
  instant_book         BOOLEAN NOT NULL,
  cancellation_policy  TEXT NOT NULL CHECK (cancellation_policy IN ('flexible','moderate','strict')),
  guarantor_policy     TEXT NOT NULL CHECK (guarantor_policy IN ('none','optional','required','required_over_amount')),
  guarantor_threshold  NUMERIC(16,4),
  requires_license     BOOLEAN NOT NULL DEFAULT false,
  house_rules          TEXT NOT NULL,
  building_rules       TEXT,
  allowed_activities   TEXT,
  forbidden_activities TEXT,
  buffer_minutes       INTEGER NOT NULL DEFAULT 30,
  weekly_availability  JSONB NOT NULL DEFAULT '{}',
  blocked_dates        DATE[] NOT NULL DEFAULT '{}',
  active               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listings_place_idx ON listings (country_code, city) WHERE active;
CREATE INDEX listings_host_idx ON listings (host_id);

CREATE TABLE bookings (
  id                      TEXT PRIMARY KEY,
  listing_id              TEXT NOT NULL REFERENCES listings(id),
  guest_id                TEXT NOT NULL REFERENCES users(id),
  host_id                 TEXT NOT NULL REFERENCES users(id),
  guests                  INTEGER NOT NULL CHECK (guests > 0),
  purpose                 TEXT NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('pending_guarantor','pending_host','confirmed','checked_in','completed','cancelled_guest','cancelled_host','declined','expired','no_show')),
  currency                CHAR(3) NOT NULL,
  total                   NUMERIC(16,4) NOT NULL,
  price                   JSONB NOT NULL,          -- composição do preço no momento da reserva
  payment_method          TEXT NOT NULL,
  cancellation_policy     TEXT NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancellation_reason     TEXT,
  refund_amount           NUMERIC(16,4),
  completed_at            TIMESTAMPTZ,
  host_penalty            JSONB,
  is_consumer             BOOLEAN NOT NULL DEFAULT true,
  client_reviews_enabled  BOOLEAN NOT NULL DEFAULT false,
  rules_accepted_at       TIMESTAMPTZ NOT NULL,
  rules_version           TEXT NOT NULL,
  host_decision_deadline  TIMESTAMPTZ
);
CREATE INDEX bookings_listing_status_idx ON bookings (listing_id, status);
CREATE INDEX bookings_guest_idx ON bookings (guest_id);
CREATE INDEX bookings_host_idx ON bookings (host_id);
CREATE INDEX bookings_open_idx ON bookings (status) WHERE status IN ('pending_guarantor','pending_host','confirmed','checked_in');

-- Cada data/horário reservado (um dia, dias seguidos ou recorrência semanal)
CREATE TABLE booking_occurrences (
  booking_id        TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  listing_id        TEXT NOT NULL REFERENCES listings(id),
  date              DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL CHECK (end_time > start_time),
  check_in_at       TIMESTAMPTZ,
  check_out_at      TIMESTAMPTZ,
  overstay_minutes  INTEGER,
  PRIMARY KEY (booking_id, date)
);
CREATE INDEX booking_occurrences_listing_date_idx ON booking_occurrences (listing_id, date);

CREATE TABLE guarantors (
  booking_id       TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  document_number  TEXT NOT NULL,
  relationship     TEXT,
  token            TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('invited','accepted','declined')),
  liability_cap    NUMERIC(16,4) NOT NULL,
  responded_at     TIMESTAMPTZ
);

CREATE TABLE payments (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  method          TEXT NOT NULL,
  currency        CHAR(3) NOT NULL,
  amount          NUMERIC(16,4) NOT NULL,
  refunded        NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (refunded <= amount),
  deposit_hold    NUMERIC(16,4) NOT NULL DEFAULT 0,
  deposit_status  TEXT NOT NULL CHECK (deposit_status IN ('none','held','released','captured')),
  status          TEXT NOT NULL CHECK (status IN ('authorized','captured','partially_refunded','refunded','voided','failed')),
  payout_status   TEXT NOT NULL CHECK (payout_status IN ('scheduled','paid','held','cancelled')),
  payout_amount   NUMERIC(16,4) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trilha de auditoria de cada movimento financeiro
CREATE TABLE payment_events (
  id          BIGSERIAL PRIMARY KEY,
  payment_id  TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  event       TEXT NOT NULL,
  amount      NUMERIC(16,4)
);
CREATE INDEX payment_events_payment_idx ON payment_events (payment_id, id);

CREATE TABLE payment_charges (
  id          BIGSERIAL PRIMARY KEY,
  payment_id  TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  amount      NUMERIC(16,4) NOT NULL,
  reason      TEXT NOT NULL
);
CREATE INDEX payment_charges_payment_idx ON payment_charges (payment_id, id);

CREATE TABLE reviews (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('guest_to_listing','host_to_guest','client_to_listing')),
  booking_id       TEXT NOT NULL REFERENCES bookings(id),
  listing_id       TEXT NOT NULL REFERENCES listings(id),
  author_id        TEXT REFERENCES users(id),
  author_name      TEXT NOT NULL,
  target_user_id   TEXT REFERENCES users(id),
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  categories       JSONB NOT NULL DEFAULT '{}',
  comment          TEXT NOT NULL,
  private_note     TEXT,
  would_recommend  BOOLEAN,
  response_text    TEXT,
  response_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  visible          BOOLEAN NOT NULL DEFAULT false
);
-- anfitrião e locatário avaliam uma única vez por reserva
CREATE UNIQUE INDEX reviews_one_per_side_idx ON reviews (booking_id, kind) WHERE kind <> 'client_to_listing';
CREATE INDEX reviews_listing_idx ON reviews (listing_id, visible);
CREATE INDEX reviews_target_idx ON reviews (target_user_id, visible);

CREATE TABLE client_invites (
  token       TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES listings(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  label       TEXT
);
CREATE INDEX client_invites_booking_idx ON client_invites (booking_id);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  flagged     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX messages_booking_idx ON messages (booking_id, created_at);

CREATE TABLE incidents (
  id                 TEXT PRIMARY KEY,
  booking_id         TEXT NOT NULL REFERENCES bookings(id),
  reporter_id        TEXT NOT NULL REFERENCES users(id),
  against_user_id    TEXT NOT NULL REFERENCES users(id),
  type               TEXT NOT NULL,
  description        TEXT NOT NULL,
  evidence           TEXT[] NOT NULL DEFAULT '{}',
  requested_amount   NUMERIC(16,4) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL CHECK (status IN ('open','accepted','contested','resolved','rejected')),
  resolution         JSONB,
  response_deadline  TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  guest_response     TEXT
);
CREATE INDEX incidents_booking_idx ON incidents (booking_id);
CREATE INDEX incidents_open_idx ON incidents (status) WHERE status IN ('open','contested');

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  kind        TEXT NOT NULL,
  text        TEXT NOT NULL,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE favorites (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
