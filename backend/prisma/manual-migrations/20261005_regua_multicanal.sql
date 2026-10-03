-- DentalPos One — Régua de cobrança em vários canais ao mesmo tempo
-- Cria o índice único novo (lançamento + etapa + canal) e só depois remove o antigo. Idempotente; não apaga nenhum dado.

CREATE UNIQUE INDEX IF NOT EXISTS "DunningNotice_financialEntryId_stage_channel_key" ON "DunningNotice"("financialEntryId", "stage", "channel");
DROP INDEX IF EXISTS "DunningNotice_financialEntryId_stage_key";
