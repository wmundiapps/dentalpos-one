-- Dentista parceiro pode atender em mais de uma cidade (além da cidade principal do cadastro)
alter table dentists add column if not exists extra_cities jsonb not null default '[]'::jsonb;
