-- Captação (prospecção de anfitriões): base de empresas da Receita Federal, busca no
-- Google Maps, lista de contatos, sequência de e-mails, cliques e descadastro (LGPD).

-- Base da Receita: mesmas tabelas/colunas do importador do REVAH (revah/tools/receita-import),
-- para a carga rodar no PC apontando DATABASE_URL para este banco.
CREATE TABLE IF NOT EXISTS "CompanyRecord" (
  "cnpj"          TEXT PRIMARY KEY,
  "basico"        TEXT NOT NULL,
  "tradeName"     TEXT,
  "legalName"     TEXT,
  "cnae"          TEXT NOT NULL,
  "cnaeSecondary" TEXT,
  "uf"            TEXT NOT NULL,
  "cityCode"      TEXT NOT NULL,
  "city"          TEXT,
  "cityNorm"      TEXT,
  "district"      TEXT,
  "zip"           TEXT,
  "address"       TEXT,
  "phone"         TEXT,
  "phone2"        TEXT,
  "email"         TEXT,
  "openedAt"      TEXT,
  "size"          TEXT,
  "refMonth"      TEXT NOT NULL,
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CompanyRecord_uf_city_cnae_idx" ON "CompanyRecord" ("uf", "cityNorm", "cnae");
CREATE INDEX IF NOT EXISTS "CompanyRecord_basico_idx" ON "CompanyRecord" ("basico");
CREATE TABLE IF NOT EXISTS "CnaeCode" (
  "code"        TEXT PRIMARY KEY,
  "description" TEXT NOT NULL,
  "searchNorm"  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "CompanyImport" (
  "id"         TEXT PRIMARY KEY,
  "refMonth"   TEXT NOT NULL,
  "filters"    JSONB NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'RUNNING',
  "rows"       INTEGER NOT NULL DEFAULT 0,
  "error"      TEXT,
  "startedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finishedAt" TIMESTAMPTZ
);

-- Lista de captação
CREATE TABLE prospects (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL CHECK (source IN ('receita','maps','csv','manual')),
  source_ref    TEXT,                       -- CNPJ, id do Google Maps ou linha do arquivo
  name          TEXT NOT NULL,
  segment       TEXT,
  email         TEXT,
  phone         TEXT,
  website       TEXT,
  address       TEXT,
  city          TEXT,
  uf            TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_sequence','done','hot','replied','converted','unsubscribed','bounced','excluded')),
  token         TEXT NOT NULL UNIQUE,
  last_step     INTEGER NOT NULL DEFAULT 0,
  first_sent_at TIMESTAMPTZ,
  last_sent_at  TIMESTAMPTZ,
  hot_at        TIMESTAMPTZ,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX prospects_source_ref_idx ON prospects (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX prospects_email_idx ON prospects (lower(email));
CREATE INDEX prospects_status_idx ON prospects (status, created_at);

CREATE TABLE prospect_events (
  id           TEXT PRIMARY KEY,
  prospect_id  TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,              -- sent | click | unsubscribe | bounce | status | error
  step         INTEGER,
  detail       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX prospect_events_type_idx ON prospect_events (type, created_at);

-- Quem pediu para não receber mais (vale para qualquer lista futura)
CREATE TABLE prospect_suppression (
  email       TEXT PRIMARY KEY,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prospect_config (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sending_enabled  BOOLEAN NOT NULL DEFAULT false,
  daily_limit      INTEGER NOT NULL DEFAULT 20,
  step2_after_days INTEGER NOT NULL DEFAULT 3,
  step3_after_days INTEGER NOT NULL DEFAULT 7,
  send_to_webmail  BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO prospect_config (id) VALUES (1) ON CONFLICT DO NOTHING;
