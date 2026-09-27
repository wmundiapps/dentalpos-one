-- Confirmação de e-mail: o link anterior continua valendo depois de um reenvio
-- (a pessoa costuma clicar no primeiro e-mail que recebeu).
ALTER TABLE users ADD COLUMN email_verify_prev_hash TEXT;
