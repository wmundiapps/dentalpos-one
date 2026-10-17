-- Fotos de check-in/check-out e vitrine antes/depois. Guardadas no banco, já regravadas pelo servidor (sem GPS/EXIF).
CREATE TABLE photos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  order_id   UUID,
  phase      TEXT NOT NULL CHECK (phase IN ('checkin','checkout','vitrine')),
  angle      TEXT NOT NULL DEFAULT 'geral',
  mime       TEXT NOT NULL DEFAULT 'image/jpeg',
  bytes      INT NOT NULL,
  data       BYTEA NOT NULL,
  is_public  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX photos_order ON photos (tenant_id, order_id);
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
