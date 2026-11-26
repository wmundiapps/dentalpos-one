-- Copia automatica de documentos fiscais ao contador e ao administrativo.
ALTER TABLE "FiscalRule" ADD COLUMN IF NOT EXISTS "accountantEmail" TEXT;
ALTER TABLE "FiscalRule" ADD COLUMN IF NOT EXISTS "adminEmail" TEXT;
