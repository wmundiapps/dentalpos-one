-- Parecer jurídico (2026-10): "Avalista" passa a ser Fiador (fiança convencional) e, se o fiador for casado
-- fora do regime de separação convencional de bens, a fiança só vale com a autorização do cônjuge (CC art. 1.647, III).
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS marital_status TEXT
  CHECK (marital_status IN ('single','married','stable_union','divorced','widowed'));
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS property_regime TEXT
  CHECK (property_regime IN ('partial','universal','final_participation','separation_conventional','separation_mandatory'));
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_name TEXT;
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_document TEXT;
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_email TEXT;
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_token TEXT UNIQUE;
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_status TEXT CHECK (spouse_status IN ('invited','accepted','declined'));
ALTER TABLE guarantors ADD COLUMN IF NOT EXISTS spouse_responded_at TIMESTAMPTZ;

-- Anfitrião informa a que título ocupa o imóvel; quem não é proprietário declara ter autorização prévia e
-- escrita do proprietário/locador para ceder o uso (Lei 8.245/91, art. 13).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS occupancy TEXT CHECK (occupancy IN ('owner','tenant','other'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS occupancy_consent_at TIMESTAMPTZ;
