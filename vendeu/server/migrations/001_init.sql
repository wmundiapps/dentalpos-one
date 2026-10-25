-- Vendeu — esquema inicial. Toda tabela nasce com RLS ligado e SEM política: anon/authenticated não leem nada
-- (o acesso é só pelo servidor, que usa a conexão direta do banco).

CREATE TABLE users (
  id text PRIMARY KEY,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  account_type text NOT NULL DEFAULT 'comprador' CHECK (account_type IN ('comprador','anunciante')),
  email text NOT NULL,
  email_verified_at timestamptz,
  phone text,
  phone_verified_at timestamptz,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  doc_type text CHECK (doc_type IN ('cpf','cnpj')),
  doc_hash text,                -- HMAC do CPF/CNPJ: impede duplicidade sem guardar o número aberto
  doc_enc bytea,                -- CPF/CNPJ cifrado (AES-256-GCM)
  doc_masked text,
  birth_date date,
  company_name text,
  cep text, street text, street_number text, complement text, district text, city text, state text,
  kyc_status text NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','pending','verified','rejected')),
  kyc_submitted_at timestamptz,
  kyc_reviewed_at timestamptz,
  kyc_reviewed_by text,
  kyc_reject_reason text,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  blocked_at timestamptz,
  block_reason text,
  fee_blocked_at timestamptz,   -- travado para novos anúncios por taxa vencida
  marketing_opt_in boolean NOT NULL DEFAULT false,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE anonymized_at IS NULL;
CREATE UNIQUE INDEX users_doc_uq ON users (doc_hash) WHERE doc_hash IS NOT NULL AND anonymized_at IS NULL;
CREATE INDEX users_kyc_idx ON users (kyc_status);

CREATE TABLE uploads (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL DEFAULT 'photo',
  mime text NOT NULL,
  size int NOT NULL,
  data bytea,
  url text NOT NULL,
  content_hash text,            -- SHA-256 do arquivo: detecta foto copiada de outro anunciante
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_hash_idx ON uploads (content_hash);

CREATE TABLE kyc_documents (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('doc_front','doc_back','selfie','address_proof','cnpj_card')),
  mime text NOT NULL,
  size int NOT NULL,
  data bytea NOT NULL,          -- sempre cifrado
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kyc_documents_user_idx ON kyc_documents (user_id, kind, created_at DESC);

CREATE TABLE term_acceptances (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  doc_key text NOT NULL,
  version text NOT NULL,
  text_hash text NOT NULL,
  ip text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX term_acceptances_user_idx ON term_acceptances (user_id, doc_key);

CREATE TABLE verification_codes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  channel text NOT NULL CHECK (channel IN ('email','phone','reset')),
  target text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_codes_idx ON verification_codes (user_id, channel, created_at DESC);

CREATE TABLE listings (
  id text PRIMARY KEY,
  seller_id text NOT NULL REFERENCES users(id),
  operation text NOT NULL CHECK (operation IN ('venda','locacao')),
  category text NOT NULL CHECK (category IN ('moveis','imoveis','brinquedos','automoveis','utilidades-lar','outros')),
  condition text NOT NULL CHECK (condition IN ('novo','usado')),
  title text NOT NULL,
  description text NOT NULL,
  price_cents bigint NOT NULL CHECK (price_cents > 0),
  rent_period text CHECK (rent_period IN ('dia','semana','mes')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','active','paused','pending_checkout','sold','removed','rejected')),
  city text NOT NULL, state text NOT NULL, district text,
  address_private text,         -- endereço exato: só aparece para o admin, nunca na vitrine
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_text text NOT NULL DEFAULT '',
  group_token text,
  views int NOT NULL DEFAULT 0,
  risk_score int NOT NULL DEFAULT 0,
  risk_flags text[] NOT NULL DEFAULT '{}',
  review_note text,
  removed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  closed_at timestamptz
);
CREATE INDEX listings_browse_idx ON listings (operation, condition, category, status, published_at DESC);
CREATE INDEX listings_seller_idx ON listings (seller_id, status);
CREATE INDEX listings_group_idx ON listings (group_token) WHERE group_token IS NOT NULL;

CREATE TABLE listing_photos (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  upload_id text NOT NULL REFERENCES uploads(id),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_photos_idx ON listing_photos (listing_id, position);

CREATE TABLE listing_price_history (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Declaração de origem lícita assinada por anúncio (termo de responsabilidade)
CREATE TABLE listing_declarations (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id),
  user_id text NOT NULL REFERENCES users(id),
  origin_kind text NOT NULL,
  asset_ref text,               -- placa / matrícula
  signer_name text NOT NULL,
  text_version text NOT NULL,
  text_hash text NOT NULL,
  ip text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_declarations_listing_idx ON listing_declarations (listing_id, created_at DESC);

-- Registro de origem: IP, e-mail, telefone, dispositivo. Imutável (trigger abaixo).
CREATE TABLE origin_records (
  id text PRIMARY KEY,
  event text NOT NULL,          -- signup | login | listing_create | listing_publish | message | sale_close | kyc_submit
  user_id text,
  listing_id text,
  email text, phone text,
  ip text, ip_chain text, user_agent text, accept_language text,
  device_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX origin_records_user_idx ON origin_records (user_id, created_at DESC);
CREATE INDEX origin_records_listing_idx ON origin_records (listing_id);
CREATE INDEX origin_records_ip_idx ON origin_records (ip);

CREATE FUNCTION origin_records_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('vendeu.allow_purge', true) = 'on' AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'origin_records é imutável';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER origin_records_no_change BEFORE UPDATE OR DELETE ON origin_records
  FOR EACH ROW EXECUTE FUNCTION origin_records_immutable();

CREATE TABLE conversations (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id),
  buyer_id text NOT NULL REFERENCES users(id),
  seller_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE TABLE messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES users(id),
  body text NOT NULL,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at);

CREATE TABLE reports (
  id text PRIMARY KEY,
  listing_id text REFERENCES listings(id),
  reported_user_id text REFERENCES users(id),
  reporter_id text REFERENCES users(id),
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','dismissed')),
  handled_by text, handled_at timestamptz, handler_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at);

-- Fechamento da venda = checkout da taxa
CREATE SEQUENCE receipt_seq START 1000;
CREATE TABLE sales (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id),
  seller_id text NOT NULL REFERENCES users(id),
  buyer_id text REFERENCES users(id),
  operation text NOT NULL,
  listed_price_cents bigint NOT NULL,
  max_listed_price_cents bigint NOT NULL,
  declared_price_cents bigint NOT NULL,
  fee_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','waived','cancelled')),
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  buyer_confirmation text NOT NULL DEFAULT 'none' CHECK (buyer_confirmation IN ('none','pending','confirmed','disputed')),
  provider text, provider_ref text,
  pix_copy_paste text, pix_qr_base64 text, checkout_url text,
  receipt_number int NOT NULL DEFAULT nextval('receipt_seq'),
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_listing_active_uq ON sales (listing_id) WHERE status IN ('awaiting_payment','paid');
CREATE INDEX sales_seller_idx ON sales (seller_id, status);
CREATE INDEX sales_provider_idx ON sales (provider, provider_ref);

CREATE TABLE payments (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES sales(id),
  provider text NOT NULL,
  provider_ref text,
  status text NOT NULL,
  amount_cents bigint NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grupos automáticos da categoria "Outros" (produtos recorrentes)
CREATE TABLE category_groups (
  token text PRIMARY KEY,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'auto' CHECK (status IN ('auto','approved','hidden')),
  total_count int NOT NULL DEFAULT 0,
  active_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_requests (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('export','delete','correct','info','revoke')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE audit_log (
  id text PRIMARY KEY,
  actor_id text,
  action text NOT NULL,
  entity text, entity_id text,
  meta jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  hits int NOT NULL,
  window_start timestamptz NOT NULL
);

-- RLS ligado em tudo, sem política: só o servidor acessa.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
