-- Assistente virtual (IA) para dúvidas: conversas registradas e enviadas à equipe por e-mail.
CREATE TABLE assistant_conversations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  ip           TEXT,
  page         TEXT,
  locale       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  emailed_at   TIMESTAMPTZ
);
CREATE INDEX assistant_conversations_updated_idx ON assistant_conversations (updated_at DESC);
CREATE INDEX assistant_conversations_pending_idx ON assistant_conversations (updated_at) WHERE emailed_at IS NULL;

CREATE TABLE assistant_messages (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assistant_messages_conv_idx ON assistant_messages (conversation_id, id);
