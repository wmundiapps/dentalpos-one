# Cashbacksmart

Para continuar o projeto em outra conversa, comece por `HANDOFF.md` (tudo o que foi decidido e construído).

Cashback multiempresa para o comércio local. Domínio: cashbacksmart.com.br.

- Cliente: grátis. Premium opcional de R$ 4/mês (R$ 48/ano) para o saldo nunca vencer.
- Loja: promoção de inauguração com 6 meses de mensalidade grátis; depois R$ 49,90/mês + 20% do cashback usado pelos clientes. Fatura automática no dia 1º do mês seguinte (Asaas ou Stripe). Cancelamento sem multa: paga só até o mês em uso.
- Lançamento do cashback pela loja (QR/CPF do cliente) ou pelo cliente: QR da NFC-e, ou foto da nota + valor + número no QR do kit do caixa. A mesma nota nunca entra duas vezes.
- Avisos automáticos ao cliente: e-mail + WhatsApp ou SMS (o cliente escolhe).
- Captação de leads: páginas de oferta da loja (/l/...) e da plataforma por categoria/cidade, com rodízio entre até 3 lojas.
- Kit do caixa para imprimir (cartaz A4, display de balcão e adesivos) em Painel > Empresa > Kit do caixa. Exemplo: `preview/kit-do-caixa-exemplo.pdf`.

| Pasta | O que tem |
| --- | --- |
| `app/` | Aplicativo web (Next.js + Postgres): cliente, loja, admin, robôs, landing page |
| `mobile/` | Apps Apple e Google Play (Capacitor), com ícones, splash, câmera e push |
| `brand/` | Logomarca em SVG e PNG |
| `preview/` | Landing page estática, demonstração, simulador e exemplo do kit do caixa |
| `ads/` | Cards de anúncio (Meta, TikTok, Google) e textos |
| `.github/` | Testes automáticos, análise de segurança, agendador dos robôs, geração dos apps |

## Colocar no ar

1. Crie um banco Postgres (Supabase) e copie a connection string.
2. Importe o repositório na Vercel com a pasta raiz `app` e preencha as variáveis de `app/.env.example`.
3. Rode as migrações uma vez: `npm run migrate` (com `DATABASE_URL` do banco de produção).
4. Crie o administrador: `ADMIN_EMAIL=voce@... ADMIN_PASSWORD=... npm run seed`. No primeiro acesso ele ativa a verificação em duas etapas.
5. No GitHub, em Settings > Secrets, cadastre `APP_URL`, `CRON_SECRET`, `RESEND_API_KEY` e `ALERT_EMAIL`. Os robôs passam a rodar sozinhos (cobrança, antifraude, avisos, e-mails, monitoramento).
6. Cobrança: no Asaas, aponte o webhook para `APP_URL/api/webhooks/asaas` com o token de `ASAAS_WEBHOOK_TOKEN`. Para usar Stripe, defina `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY` e aponte o webhook (evento `invoice.paid`) para `APP_URL/api/webhooks/stripe` com `STRIPE_WEBHOOK_SECRET`.
7. WhatsApp (Meta Cloud API): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` e um modelo de mensagem aprovado em `WHATSAPP_TEMPLATE_NOTICE`. SMS (Twilio): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.

## Apps nas lojas

- Android: rode o workflow "Android" no GitHub (gera o AAB para a Google Play).
- iOS: rode o workflow "iOS" (precisa da conta Apple Developer e dos certificados nos segredos).
- Antes, troque `APP_URL` em `mobile/capacitor.config.ts` se o endereço final for outro.

## Testes

`cd app && npm test` (64 testes de regras, cobrança, notas, leads, avisos, robôs e segurança) e `npm run e2e` (23 testes de ponta a ponta no navegador).
