-- Split de pagamento (Mercado Pago marketplace): cada anfitrião conecta a
-- própria conta; o pagamento é criado em nome dele e a plataforma recebe só
-- a comissão (marketplace_fee).
CREATE TABLE mp_accounts (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mp_user_id         TEXT NOT NULL UNIQUE,
  access_token_enc   BYTEA NOT NULL,   -- cifrado (secure.ts)
  refresh_token_enc  BYTEA NOT NULL,
  public_key         TEXT,
  live_mode          BOOLEAN NOT NULL DEFAULT true,
  expires_at         TIMESTAMPTZ NOT NULL,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conta do anfitrião (vendedor) que recebeu o pagamento
ALTER TABLE payments ADD COLUMN seller_ref TEXT;
