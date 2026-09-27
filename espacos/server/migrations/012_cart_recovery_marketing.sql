-- Recuperação de reserva abandonada: quem abriu a tela de reserva (ou não pagou
-- no checkout) e não concluiu recebe até 2 lembretes por e-mail.
CREATE TABLE checkout_intents (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id        TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  query             TEXT NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at      TIMESTAMPTZ,
  reminders_sent    INTEGER NOT NULL DEFAULT 0,
  last_reminded_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX checkout_intents_due_idx ON checkout_intents (updated_at) WHERE converted_at IS NULL AND reminders_sent < 2;

-- Base de contatos para marketing (LGPD: consentimento separado dos termos)
ALTER TABLE users ADD COLUMN marketing_opt_in_at TIMESTAMPTZ;
-- Descadastro pelo link dos e-mails de lembrete/marketing
ALTER TABLE users ADD COLUMN email_unsubscribed_at TIMESTAMPTZ;
-- Lembrete automático para quem não confirmou o e-mail
ALTER TABLE users ADD COLUMN verify_reminder_sent_at TIMESTAMPTZ;
