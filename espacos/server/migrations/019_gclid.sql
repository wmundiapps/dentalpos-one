-- Clique do Google Ads (gclid) que trouxe o cadastro: só gravado com consentimento de cookies.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_gclid TEXT;
