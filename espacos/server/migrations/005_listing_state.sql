-- Estado (UF) do espaço: País → Estado → Município (lista oficial do IBGE no Brasil)
ALTER TABLE listings ADD COLUMN state TEXT;
UPDATE listings SET state = CASE city
  WHEN 'São Paulo' THEN 'SP' WHEN 'Rio de Janeiro' THEN 'RJ' WHEN 'Belo Horizonte' THEN 'MG' WHEN 'Brasília' THEN 'DF'
  WHEN 'Curitiba' THEN 'PR' WHEN 'Porto Alegre' THEN 'RS' WHEN 'Salvador' THEN 'BA' WHEN 'Recife' THEN 'PE'
  WHEN 'Fortaleza' THEN 'CE' WHEN 'Goiânia' THEN 'GO' WHEN 'Florianópolis' THEN 'SC' WHEN 'Manaus' THEN 'AM' END
WHERE country_code = 'BR';
CREATE INDEX listings_state_idx ON listings (country_code, state, city) WHERE active;
