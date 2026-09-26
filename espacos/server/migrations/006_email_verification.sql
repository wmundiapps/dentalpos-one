-- Confirmação de e-mail no cadastro. Contas já existentes ficam como confirmadas.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN email_verify_token_hash TEXT;
ALTER TABLE users ADD COLUMN email_verify_sent_at TIMESTAMPTZ;
UPDATE users SET email_verified_at = created_at;
CREATE UNIQUE INDEX users_email_verify_token_idx ON users (email_verify_token_hash) WHERE email_verify_token_hash IS NOT NULL;
