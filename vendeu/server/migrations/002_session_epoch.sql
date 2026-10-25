-- Sessões emitidas antes da última troca de senha deixam de valer.
ALTER TABLE users ADD COLUMN pw_changed_at timestamptz;
