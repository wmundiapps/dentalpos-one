-- Questionário de atendimento presencial (raio de 300 km / deslocamento) e cobertura da rede para o marketing.
alter table cases add column if not exists uf text;
alter table cases add column if not exists coverage_km int;
alter table cases add column if not exists attendance jsonb;
