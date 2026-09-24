-- Proteção dos documentos de registro profissional: retenção mínima e trilha de acesso.

-- Quando o arquivo foi apagado (o resultado da verificação continua registrado)
ALTER TABLE license_verifications ADD COLUMN document_deleted_at TIMESTAMPTZ;
CREATE INDEX license_verifications_retention_idx ON license_verifications (decided_at)
  WHERE document IS NOT NULL AND status IN ('approved','rejected');

-- Quem abriu cada documento, quando e de onde
CREATE TABLE document_access_log (
  id               TEXT PRIMARY KEY,
  verification_id  TEXT NOT NULL REFERENCES license_verifications(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL CHECK (action IN ('view','ai_analysis','deleted')),
  ip               TEXT,
  user_agent       TEXT,
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_access_log_verification_idx ON document_access_log (verification_id, at DESC);
