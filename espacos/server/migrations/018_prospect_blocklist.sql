-- Captação, parte 2 (playbook ClubeFaz itens 1 e 2):
-- "não quero receber" vira bloqueio permanente por hash (CNPJ, telefone e e-mail), sem guardar o dado;
-- convite de WhatsApp por link controlado (um por pessoa) e auditoria de exportação.
CREATE TABLE IF NOT EXISTS prospect_blocklist (
  hash        TEXT PRIMARY KEY,               -- sha256('tipo:valor normalizado')
  kind        TEXT NOT NULL CHECK (kind IN ('cnpj','phone','email')),
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A lista antiga guardava o e-mail em texto: passa para hash e o texto é apagado
INSERT INTO prospect_blocklist (hash, kind, reason)
  SELECT encode(sha256(convert_to('email:' || lower(trim(email)), 'UTF8')), 'hex'), 'email', reason FROM prospect_suppression
  ON CONFLICT DO NOTHING;
DELETE FROM prospect_suppression;

-- Quem já saiu: telefone e e-mail apagados do registro (o hash continua bloqueando)
INSERT INTO prospect_blocklist (hash, kind, reason)
  SELECT encode(sha256(convert_to('phone:' || regexp_replace(phone, '\D', '', 'g'), 'UTF8')), 'hex'), 'phone', status
    FROM prospects WHERE status IN ('unsubscribed') AND phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> ''
  ON CONFLICT DO NOTHING;
UPDATE prospects SET email = NULL, phone = NULL WHERE status = 'unsubscribed';

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS wa_invited_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS wa_invited_by TEXT;

CREATE TABLE IF NOT EXISTS prospect_exports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  format      TEXT NOT NULL,
  filters     JSONB NOT NULL,
  rows        INTEGER NOT NULL,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
