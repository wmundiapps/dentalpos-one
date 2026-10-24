-- E-mails podem levar uma versão em HTML (por exemplo, o convite do Cashbacksmart no rodapé da confirmação).
ALTER TABLE outbox ADD COLUMN html TEXT;
