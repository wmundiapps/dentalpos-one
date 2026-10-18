# Publicar o Studio Beauty Barber

Arquitetura (mais rápida para o usuário final e com suporte para operações grandes):
- **Landing** (`landing/`) → Vercel (CDN global) em `studiobeautybarber.com` / `www`.
- **App + API** (`server/` + `web/`) → Railway (Node 22, região São Paulo) em `app.studiobeautybarber.com`.
- **Banco** → Postgres gerenciado (Supabase ou Railway Postgres) via `DATABASE_URL`.
- **DNS/WAF** → Cloudflare na frente de tudo (SSL "Full (strict)", WAF, rate limiting, Bot Fight).
- Domínio `.com.br` redireciona para `.com`.

## Ordem (um passo de cada vez)
1. Criar repositório privado no GitHub com esta pasta.
2. Railway: New Project → Deploy from GitHub → variáveis do `.env.example` → Start command `npm start` → Domínio `app.studiobeautybarber.com`.
3. Rodar o seed do piloto UMA vez (Railway shell): `SIMULATE_MESSAGING=true node server/seed.js` e anotar a senha exibida. (Em produção real, crie sua conta HQ pelo cadastro e não rode o piloto.)
4. Vercel: Import → pasta raiz `landing` → editar `landing/config.js` (`api` e `appUrl` = `https://app.studiobeautybarber.com`) → domínio `studiobeautybarber.com`.
5. Cloudflare: apontar DNS (ver `security/DNS_EMAIL.md`) e ativar o checklist de `security/CHECKLIST.md`.
6. Webhooks:
   - Meta: `https://app.studiobeautybarber.com/webhooks/meta` + token `META_VERIFY_TOKEN` (campos: messages).
   - Stripe: `https://app.studiobeautybarber.com/webhooks/stripe` (checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted).
   - Asaas (plataforma): `https://app.studiobeautybarber.com/webhooks/asaas` com `ASAAS_WEBHOOK_TOKEN`.
7. `SIMULATE_MESSAGING=false` e testar um fluxo real com seu próprio número.

## Escala
- Rate limit em memória → trocar por Redis ao rodar mais de 1 instância.
- Uploads em disco → mover para S3/R2 ao escalar.
- Postgres: o caminho `pg` foi escrito mas ainda NÃO foi testado contra um Postgres real; rode `npm test` apontando `DATABASE_URL` para um banco vazio antes de ir ao ar.
