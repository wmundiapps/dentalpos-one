-- "Esqueci minha senha": link de uso único por e-mail (vale 1 hora).
ALTER TABLE users ADD COLUMN password_reset_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_sent_at TIMESTAMPTZ;
-- Sessões (tokens) emitidas antes da troca de senha deixam de valer
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX users_password_reset_idx ON users (password_reset_hash) WHERE password_reset_hash IS NOT NULL;
