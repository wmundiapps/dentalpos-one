# DentalPos One — publicação em /dentalposone/

Frontend Vite configurado com base `/dentalposone/` e BrowserRouter com basename `/dentalposone`.

URL desejada: `https://www.wmundi.com/dentalposone/`

## Reverse proxy esperado

- `/dentalposone/` → arquivos estáticos do frontend.
- `/dentalposone/api/` → backend DentalPos One, ou definir `VITE_API_URL` com a URL pública da API antes do build.
- Webhooks públicos → host HTTPS da API em `/api/webhooks/asaas` e `/api/webhooks/stripe`.
- `/health` → liveness.
- `/ready` → readiness com PostgreSQL.

## Cabeçalhos/segurança do proxy

- TLS obrigatório e redirecionamento HTTP → HTTPS.
- HSTS somente depois de HTTPS estar validado.
- limite de upload coerente com `API_BODY_LIMIT`.
- encaminhar `X-Forwarded-For`/`X-Forwarded-Proto` e usar `TRUST_PROXY=true` somente atrás do proxy confiável.
- aplicar CSP do frontend inicialmente em modo de relatório e validar DentalPos Design/Three.js antes de bloquear recursos.

## Variáveis mínimas por ambiente

- `NODE_ENV`, `APP_ENV`, `RELEASE_CHANNEL`.
- `DATABASE_URL`.
- `JWT_SECRET` forte e exclusivo.
- `TENANT_SECRET_MASTER_KEY` forte e exclusiva.
- `CORS_ORIGIN=https://www.wmundi.com` (ou lista explícita separada por vírgula).
- `PUBLIC_APP_URL=https://www.wmundi.com/dentalposone`.
- `ALLOW_PUBLIC_REGISTRATION=false`.
- secrets de Asaas/Stripe/REVAH somente quando o provedor estiver sendo homologado.

## Promoção

Antes de produção, executar `npm run preflight:release` no backend e seguir `docs/HOMOLOGACAO-RUNBOOK.md`.

A publicação real depende do acesso ao servidor/DNS/proxy do wmundi.com e das credenciais do ambiente. Nenhuma integração deve ser declarada ativa apenas por existir código/adaptador.
