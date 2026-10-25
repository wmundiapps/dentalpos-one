-- Compra pela plataforma: o pagamento fica retido (Mercado Pago) até o comprador receber; o contato só é liberado
-- depois do recebimento; 7 dias de devolução; depois o valor é repassado ao vendedor menos a comissão.

-- Anúncio em negociação fica "reservado" (some da vitrine).
ALTER TABLE listings DROP CONSTRAINT listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK (status IN ('draft','pending_review','active','reserved','paused','pending_checkout','sold','removed','rejected'));

-- Conta Mercado Pago do vendedor (recebimento). Obrigatória para publicar. Tokens cifrados.
CREATE TABLE payment_methods (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL DEFAULT 'mercadopago' CHECK (kind IN ('mercadopago')),
  provider text NOT NULL,
  mp_user_id text,
  access_token_enc bytea,
  refresh_token_enc bytea,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  auth_text_hash text NOT NULL,   -- autorização expressa (texto exato que a pessoa viu)
  ip text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX payment_methods_active_uq ON payment_methods (user_id) WHERE status = 'active';

-- Taxa de retirada de anúncio sem venda continua em "sales" (kind = removal).
ALTER TABLE sales ADD COLUMN kind text NOT NULL DEFAULT 'removal' CHECK (kind IN ('removal'));

CREATE TABLE orders (
  id text PRIMARY KEY,
  listing_id text NOT NULL REFERENCES listings(id),
  seller_id text NOT NULL REFERENCES users(id),
  buyer_id text NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  listed_price_cents bigint NOT NULL,
  price_cents bigint NOT NULL,                 -- valor combinado (o comprador paga só isto)
  commission_cents bigint NOT NULL DEFAULT 0,  -- tabela de comissão; descontada do vendedor na liberação
  status text NOT NULL CHECK (status IN ('offered','awaiting_payment','paid','shipped','received','return_requested','disputed','released','refunded','declined','expired','cancelled')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('envio','retirada')),
  ship_to_enc bytea,                           -- endereço de entrega (cifrado); some para o vendedor depois do recebimento
  tracking_code text,
  handover_code_hash text,                     -- retirada em mãos: código que o comprador passa ao vendedor
  handover_attempts int NOT NULL DEFAULT 0,
  provider text, provider_ref text,
  pix_copy_paste text, pix_qr_base64 text, checkout_url text,
  payout_ref text, refund_ref text,
  offer_expires_at timestamptz, pay_expires_at timestamptz,
  paid_at timestamptz, shipped_at timestamptz, received_at timestamptz, auto_received boolean NOT NULL DEFAULT false,
  return_deadline timestamptz, return_requested_at timestamptz, return_reason text, return_expires_at timestamptz,
  disputed_at timestamptz, dispute_reason text, dispute_by text, resolved_by text, resolution_note text,
  released_at timestamptz, refunded_at timestamptz,
  receipt_number int NOT NULL DEFAULT nextval('receipt_seq'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- uma negociação ativa por anúncio
CREATE UNIQUE INDEX orders_listing_active_uq ON orders (listing_id) WHERE status IN ('offered','awaiting_payment','paid','shipped','received','return_requested','disputed');
CREATE INDEX orders_buyer_idx ON orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders (seller_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status);

CREATE TABLE order_events (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id),
  actor_id text,
  event text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_idx ON order_events (order_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','orders','order_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
