-- Valores combinados no credenciamento (consulta avulsa, modelo rede...), guardados no parceiro
alter table dentists add column if not exists terms jsonb;
-- Consulta por quebra/perda de alinhador: novo tipo de atendimento
alter table evidences drop constraint if exists evidences_milestone_check;
alter table evidences add constraint evidences_milestone_check check (milestone in
  ('documentacao','instalacao','inicio_alinhadores','acompanhamento','finalizacao','consulta_avulsa','quebra'));
-- Cobrança do tratamento: quanto do escaneamento já pago foi descontado
alter table charges add column if not exists scan_deducted numeric(12,2);
