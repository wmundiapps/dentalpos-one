-- Verificação em 2 etapas por aplicativo autenticador (TOTP, RFC 6238): segredo cifrado, anti-reuso
-- de código e 8 códigos reserva (só o hash). O código por e-mail continua valendo para quem não ativar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret BYTEA;          -- cifrado (secure.ts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret BYTEA;  -- durante a configuração
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;      -- último código aceito (não vale de novo)

CREATE TABLE IF NOT EXISTS totp_backup_codes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS totp_backup_codes_user_idx ON totp_backup_codes (user_id);

ALTER TABLE login_challenges ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'email';

-- Recuperação de último caso (perdeu o celular e os códigos reserva), rodar no Supabase:
--   UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE lower(email) = lower('pessoa@exemplo.com');
--   DELETE FROM totp_backup_codes WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower('pessoa@exemplo.com'));
