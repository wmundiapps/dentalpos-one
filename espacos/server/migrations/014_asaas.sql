-- Asaas (segunda opção de pagamento no Brasil): a cobrança é emitida na conta
-- da plataforma e a parte do anfitrião vai por split para a carteira (walletId) dele.
CREATE TABLE asaas_accounts (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wallet_id    TEXT NOT NULL UNIQUE,
  account_id   TEXT,                 -- subconta criada pela plataforma
  api_key_enc  BYTEA,                -- chave da subconta (cifrada; o Asaas só mostra uma vez)
  origin       TEXT NOT NULL CHECK (origin IN ('subaccount','wallet')),
  tax_id       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
