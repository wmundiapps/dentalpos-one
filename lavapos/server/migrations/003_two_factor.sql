-- Verificação em 2 etapas (TOTP, aplicativo autenticador). O segredo fica cifrado (AES-GCM) e o último código usado é guardado para não valer duas vezes.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT;
