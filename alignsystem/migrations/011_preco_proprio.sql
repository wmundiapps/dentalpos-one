-- Modelo "preço próprio": o dentista define a tabela de tratamento; 80% para ele e 20% para a AlignSystem (split).
alter table dentists add column if not exists prices jsonb;
