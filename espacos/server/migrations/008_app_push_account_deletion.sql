-- Aplicativo (Android/iOS): tokens de notificação push e fila de envio.
CREATE TABLE push_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

ALTER TABLE notifications ADD COLUMN push_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (push_status IN ('pending', 'sent', 'skipped'));
UPDATE notifications SET push_status = 'skipped';
CREATE INDEX notifications_push_queue_idx ON notifications (created_at) WHERE push_status = 'pending';

-- Exclusão de conta pelo próprio usuário (exigência das lojas; LGPD art. 18)
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
