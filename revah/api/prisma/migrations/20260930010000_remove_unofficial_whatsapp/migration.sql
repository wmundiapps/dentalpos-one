-- REVAH trabalha só com canais oficiais: WhatsApp pela API oficial da Meta, Telegram, SMS, voz e e-mail.
-- Contas antigas de provedores não oficiais (Z-API, Zapiô) ficam desativadas e deixam de ser padrão.
UPDATE "ChannelAccount" SET "isActive" = false, "isDefault" = false WHERE "provider" IN ('ZAPI', 'ZAPIO');
