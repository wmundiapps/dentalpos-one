-- Confirmação de e-mail por código de 6 dígitos (além do link)
ALTER TABLE users ADD COLUMN email_verify_code_hash TEXT;
ALTER TABLE users ADD COLUMN email_verify_code_attempts INTEGER NOT NULL DEFAULT 0;

-- Registro de segurança do cadastro e da confirmação
ALTER TABLE users ADD COLUMN signup_ip TEXT;
ALTER TABLE users ADD COLUMN signup_user_agent TEXT;
ALTER TABLE users ADD COLUMN email_verified_ip TEXT;
ALTER TABLE users ADD COLUMN email_verified_user_agent TEXT;

-- Anúncio salvo antes de confirmar o e-mail: entra no ar na confirmação
ALTER TABLE listings ADD COLUMN pending_email BOOLEAN NOT NULL DEFAULT false;

-- Verificação de identidade: CPF/CNPJ + foto do documento + selfie (arquivos cifrados)
CREATE TABLE identity_verifications (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_id              TEXT NOT NULL,             -- CPF ou CNPJ, só dígitos
  tax_id_kind         TEXT NOT NULL CHECK (tax_id_kind IN ('cpf','cnpj','other')),
  document            BYTEA,                     -- foto do documento (cifrada)
  document_type       TEXT,
  selfie              BYTEA,                     -- selfie (cifrada)
  selfie_type         TEXT,
  status              TEXT NOT NULL CHECK (status IN ('pending','approved','needs_review','rejected')),
  checks              JSONB,                     -- resultado das checagens automáticas
  reviewed_by         TEXT REFERENCES users(id),
  review_note         TEXT,
  ip                  TEXT,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ,
  files_deleted_at    TIMESTAMPTZ
);
CREATE INDEX identity_verifications_user_idx ON identity_verifications (user_id, created_at DESC);
CREATE INDEX identity_verifications_open_idx ON identity_verifications (created_at) WHERE status IN ('pending','needs_review');

-- Quem abriu a foto do documento/selfie (equipe ou IA)
CREATE TABLE identity_access_log (
  id               TEXT PRIMARY KEY,
  verification_id  TEXT NOT NULL REFERENCES identity_verifications(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL CHECK (action IN ('view','ai_analysis','deleted')),
  ip               TEXT,
  user_agent       TEXT,
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX identity_access_log_verification_idx ON identity_access_log (verification_id, at DESC);
