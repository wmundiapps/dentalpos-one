-- DentalPos One — Financeiro: corrige vencimentos gravados à meia-noite UTC (apareciam um dia antes no Brasil).
-- OPCIONAL: a tela já exibe esses lançamentos corretamente. Este SQL só acerta o dado no banco para relatórios e exportações.
-- Idempotente: soma 15 horas (meio-dia em Brasília) apenas a datas que estão exatamente à meia-noite UTC.
UPDATE "FinancialEntry"
SET "dueDate" = "dueDate" + INTERVAL '15 hours'
WHERE "dueDate"::time = TIME '00:00:00';

UPDATE "FinancialEntry"
SET "competenceDate" = "competenceDate" + INTERVAL '15 hours'
WHERE "competenceDate" IS NOT NULL AND "competenceDate"::time = TIME '00:00:00';
