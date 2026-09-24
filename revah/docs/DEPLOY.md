# Colocar o REVAH no ar

Ordem recomendada. Cada item é feito uma vez.

## 1. Banco próprio (Supabase)
1. Supabase → organização "WMundi Technologies" → **New project** → nome `revah`, região `sa-east-1`.
2. Project Settings → Database → Connection string → **Session pooler** (porta 5432). Acrescente `?connection_limit=1`.
   Esse valor é o `DATABASE_URL` do REVAH (diferente do banco do DentalPos One).

## 2. API (Vercel, projeto `revah-api`)
1. Vercel → Add New → Project → repositório `wmundiapps/dentalpos-one` → **Root Directory: `revah/api`**.
2. Environment Variables: todas as de `revah/api/.env.example` (mínimo: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`,
   `CRON_SECRET`, `PUBLIC_API_URL`, `APP_URL`). Gere segredos no PowerShell:
   `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`
3. Deploy. O build roda `prisma migrate deploy` e cria as tabelas.
4. Domains → `api.revah.com.br`.
5. Teste: `https://api.revah.com.br/health` deve responder `"status":"ok"`.
6. Fila: o `vercel.json` já agenda `/cron/tick` a cada minuto (exige plano Pro na Vercel).
   No plano Hobby, use um agendador externo (ex.: cron-job.org) chamando a URL com o header `Authorization: Bearer CRON_SECRET`,
   ou rode `npm run start:worker` em um servidor Node.

## 3. Painel (Vercel, projeto `revah-web`)
1. Novo projeto, mesmo repositório, **Root Directory: `revah/web`**.
2. Variável `VITE_API_URL=https://api.revah.com.br`.
3. Domains → `app.revah.com.br`.

## 4. Stripe
1. Produtos: "REVAH START" (R$ 197/mês) e "REVAH PRO" (R$ 497/mês); opcional "REVAH Leads" (add-on mensal).
   Copie os `price_...` para `STRIPE_PRICE_START`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_LEADS`.
2. Settings → Payment methods: habilite cartão e boleto (e Pix, se disponível para assinaturas; então use `STRIPE_PAYMENT_METHODS=card,boleto,pix`).
3. Developers → Webhooks → endpoint `https://api.revah.com.br/webhooks/stripe` com os eventos:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
   Copie o `whsec_...` para `STRIPE_WEBHOOK_SECRET` e `sk_live_...` para `STRIPE_SECRET_KEY`.
4. Settings → Billing → Customer portal: ative troca de plano e cancelamento.

## 5. Site revah.com.br (Netlify)
1. Envie `revah/site/revah-site-connector.js` junto com os outros arquivos.
2. No `index.html`, antes do script do site:
   `<script src="/revah-site-connector.js" data-api="https://api.revah.com.br" data-app="https://app.revah.com.br"></script>`
3. Troque as chamadas antigas por: `RevahSite.register({...})`, `RevahSite.login(email, senha)`,
   `RevahSite.subscribe('START' | 'PRO')`, `RevahSite.trialStatus()`, `RevahSite.openApp()`.
   A chave `pk_live_SUA_CHAVE_AQUI` e os `price_..._ID_AQUI` do site deixam de ser necessários (o checkout é criado pela API).
4. Remova a contagem de teste grátis em `localStorage`: a API passa a ser a fonte da verdade.

## 6. Canais (por empresa, pela tela Canais)
- **WhatsApp oficial (Meta)**: no app da Meta, webhook `https://api.revah.com.br/webhooks/meta`, token = `META_VERIFY_TOKEN`,
  assinatura `messages`. Preencha `META_APP_SECRET`.
- **Instagram/Messenger**: mesmo webhook; assine `messages` e `leadgen` (Lead Ads).
- **Twilio SMS/Voz**: no número, "A message comes in" → URL mostrada na tela do canal SMS;
  "A call comes in" → URL do canal de voz; "Call status changes" → mesma URL + `/status`.
- **Telegram**: o webhook é registrado automaticamente ao conectar o bot.
- **Z-API / Zapiô**: cole a URL de webhook exibida no canal no painel do provedor.

## 7. IA
`ANTHROPIC_API_KEY` ativa o chatbot, o agente de voz e os resumos de ligação. Sem ela o REVAH funciona com respostas por regras e transferência para humano.

## 8. DentalPos One
Ver `docs/INTEGRACAO-DENTALPOS.md`.
