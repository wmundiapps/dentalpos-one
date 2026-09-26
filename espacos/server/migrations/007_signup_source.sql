-- Origem do cadastro (UTM da campanha que trouxe a pessoa), para medir anúncios.
ALTER TABLE users ADD COLUMN signup_source TEXT;
CREATE INDEX users_created_at_idx ON users (created_at);
