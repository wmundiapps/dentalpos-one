-- Código de recebimento da ordem de serviço do laboratório (confirmado pelo laboratório) e permissão própria.
ALTER TABLE "LabServiceOrder" ADD COLUMN IF NOT EXISTS "receiptCode" TEXT;
INSERT INTO "Permission"(id,code,module,action) SELECT gen_random_uuid()::text,'laboratory.receive','laboratory','receive' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE code='laboratory.receive');
INSERT INTO "AccessProfilePermission"("profileId","permissionId")
SELECT p.id,(SELECT id FROM "Permission" WHERE code='laboratory.receive') FROM "AccessProfile" p WHERE p.code IN ('LABORATORIO','GESTOR') ON CONFLICT DO NOTHING;
