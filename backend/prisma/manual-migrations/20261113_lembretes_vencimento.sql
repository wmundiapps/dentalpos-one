-- Lembretes de vencimento (alvara, autoclave, impostos, recibos da Receita Saude...) e registro dos e-mails enviados.
-- Rodar no editor SQL do projeto DentalPos One (lfeqfzvmasqnnmqvkjyg). Confira o nome do projeto no canto da tela.
CREATE TABLE IF NOT EXISTS "DueReminder" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueDate" DATE NOT NULL,
  "recurrence" TEXT NOT NULL DEFAULT 'NONE',
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastDoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "DueReminder_clinicId_active_dueDate_idx" ON "DueReminder" ("clinicId", "active", "dueDate");

CREATE TABLE IF NOT EXISTS "DueReminderLog" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "DueReminderLog_clinicId_sentAt_idx" ON "DueReminderLog" ("clinicId", "sentAt");

ALTER TABLE "DueReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DueReminderLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "DueReminder", "DueReminderLog" FROM anon, authenticated;
