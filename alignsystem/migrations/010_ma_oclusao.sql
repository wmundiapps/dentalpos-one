-- Classificação da má oclusão no parecer (uso clínico interno: equipe e dentista do caso).
alter table cases add column if not exists malocclusion jsonb;
