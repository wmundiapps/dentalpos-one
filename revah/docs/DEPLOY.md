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
6. Fila: o `vercel.json` agenda `/cron/tick` a cada minuto (a conta da Vercel é Pro).
   Em conta Hobby, troque para `0 3 * * *` e use um agendador externo chamando `/cron/tick` com `Authorization: Bearer CRON_SECRET`.

## 3. Painel (Vercel, projeto `revah-web`)
1. Novo projeto, mesmo repositório, **Root Directory: `revah/web`**.
2. Variável `VITE_API_URL=https://api.revah.com.br`.
3. Domains → `app.revah.com.br`.

## 4. Pagamentos (14 dias grátis + mensalidade automática)
Regra: o cliente escolhe START (R$ 247) ou PRO (R$ 597), cadastra a forma de pagamento e ganha 14 dias.
Se cancelar no teste, não paga. Depois, cobrança mensal automática; cancelando, o ciclo pago segue até o fim.

**Asaas (Brasil — Pix, boleto, cartão)**
1. Asaas → Integrações → Chave de API → copie para `ASAAS_API_KEY` (sandbox: `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`).
2. Integrações → Webhooks → novo webhook: URL `https://api.revah.com.br/webhooks/asaas`, token de autenticação = `ASAAS_WEBHOOK_TOKEN`,
   eventos de cobrança (PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE) e de assinatura (SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED).

**Stripe (internacional — cartão)**
1. Produtos "REVAH START" e "REVAH PRO" com preço mensal; copie os `price_...` para `STRIPE_PRICE_START` e `STRIPE_PRICE_PRO`.
2. Webhook `https://api.revah.com.br/webhooks/stripe` com: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`.
3. `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`. Portal do cliente ativado (troca de plano e cancelamento no fim do período).

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

## 7. IA
`ANTHROPIC_API_KEY` ativa o chatbot, o agente de voz e os resumos de ligação. Sem ela o REVAH funciona com respostas por regras e transferência para humano.

## 8. DentalPos One
Ver `docs/INTEGRACAO-DENTALPOS.md`.

## REVAH Leads — fontes de dados

### Base de empresas (dados abertos de CNPJ da Receita Federal)

Os arquivos ficam no compartilhamento público da Receita (`RECEITA_CNPJ_URL`, padrão
`https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9`), em pastas `AAAA-MM`.
Se a Receita mudar o endereço de novo, basta trocar essa variável.

A carga roda fora da Vercel (arquivos de vários GB) e **precisa de um computador no Brasil**: o site da
Receita derruba conexões de fora do país (por isso não roda no GitHub Actions). Pacote pronto em
`revah/tools/receita-import` (gerado por `npm run receita:bundle` em `revah/api`). No PowerShell, nessa pasta:

```powershell
npm install
$env:DATABASE_URL = "<URL do banco do REVAH — Session pooler do Supabase>"
node importar.cjs --ufs=PR
```

- `--ufs=PR,SP` estados; `--cnaes=8630,4781` prefixos de CNAE; `--all` Brasil inteiro (dezenas de GB no banco — exige plano maior no Supabase).
- `--dir=C:\receita` usa zips já baixados manualmente; `--month=AAAA-MM` escolhe o mês; `--dry-run` só conta.
- Só empresas **ativas** com telefone ou e-mail. Rode de novo todo mês para atualizar (inativas são removidas).

### Google Maps (negócios locais)

`GOOGLE_PLACES_API_KEY` — chave do Google Cloud com a **Places API (New)** ativada.

### Meta Lead Ads

Chega pela conexão da página em **Canais** (Messenger), com `pageAccessToken` e o campo `leadgen` assinado no webhook do app Meta.

### LinkedIn Lead Sync

App no LinkedIn Developers com o produto **Lead Sync API** aprovado.
`LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` e, no app, a URL de redirecionamento
`https://api.revah.com.br/integrations/linkedin/callback`. Os leads são lidos a cada 15 minutos pelo cron.
