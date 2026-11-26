-- Limite de tentativas (login, cadastro, senha, códigos): um registro por tentativa contada
CREATE TABLE rate_events (
  key         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_key_idx ON rate_events (key, created_at);

-- Verificação em duas etapas por código no e-mail (obrigatória para administradores)
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE login_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX login_challenges_user_idx ON login_challenges (user_id, created_at);

-- Registro de eventos de segurança (login bloqueado, conteúdo recusado, etc.)
CREATE TABLE security_events (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  user_id     TEXT,
  ip          TEXT,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_events_created_idx ON security_events (created_at);
