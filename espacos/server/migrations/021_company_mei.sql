-- O importador da Receita (revah/tools/receita-import) também marca MEI (natureza jurídica 2135).
ALTER TABLE "CompanyRecord" ADD COLUMN IF NOT EXISTS "isMei" BOOLEAN NOT NULL DEFAULT false;
