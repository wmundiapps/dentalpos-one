# Lançamento: o que está pronto e o que falta

## Já feito (automático)
- Site, demonstração e cards: https://studiobeautybarber.com (domínio já ligado na Vercel, falta o DNS).
- App (painel + API) na Vercel, projeto `studiobeautybarber-app`, endereço final https://app.studiobeautybarber.com (domínio já ligado, falta o DNS).
- Chaves de segurança do app (`APP_SECRET`, `APP_ENC_KEY`, `CRON_SECRET`) geradas e gravadas na Vercel. Ninguém precisa ver nem digitar.
- Código testado em SQLite e em PostgreSQL 16 (`npm run test:pg` com `TEST_DATABASE_URL`).

## Falta (você, pelo celular) — um passo de cada vez
1. **Banco no Supabase.** Criar um projeto NOVO chamado "Studio Beauty Barber" (não use o projeto do DentalPos One), região South America (São Paulo), com senha forte. Em Connect, copiar a "Transaction pooler connection string" (porta 6543).
2. **Vercel → studiobeautybarber-app → Settings → Environment Variables:** adicionar `DATABASE_URL` com esse texto (marcar Sensitive) e salvar. Depois me avisar "feito" que eu publico de novo e testo.
3. **DNS no GoDaddy** (não mexer em MX nem TXT, que são do e-mail):
```
Tipo A      @     216.150.1.1
Tipo CNAME  www   275bdd45227f37a9.vercel-dns-016.com
Tipo CNAME  app   cname.vercel-dns.com
```
4. **Agendador (lembretes e cobranças do clube):** criar uma tarefa gratuita no cron-job.org, a cada 5 minutos, `GET https://app.studiobeautybarber.com/api/cron/tick` com o cabeçalho `Authorization: Bearer <valor de CRON_SECRET>` (o valor está em Vercel → Environment Variables, do projeto do app).
5. **Primeira conta:** abrir https://app.studiobeautybarber.com e criar a conta do dono.
6. **Asaas da plataforma (cobrar os assinantes):** na Vercel adicionar `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `ASAAS_SANDBOX=true` para testar. No painel do Asaas, cadastrar o webhook `https://app.studiobeautybarber.com/webhooks/asaas` com o mesmo token. Cada salão liga o próprio Asaas em Integrações.

## E-mail
- A caixa `contato@studiobeautybarber.com` fica no e-mail profissional do GoDaddy; o MX já vem configurado lá.
- Para enviar e-mail em nome do domínio (campanhas, lembretes), cada salão usa a própria conta Resend. Registros SPF/DKIM/DMARC: `security/DNS_EMAIL.md`.

## Limites conhecidos
- O limite de tentativas por IP fica na memória de cada instância (no serverless é mais fraco); o bloqueio de login por tentativas é no banco e vale sempre. Migrar para Redis quando crescer.
- A cobrança da assinatura da plataforma (Stripe/Asaas) e o Asaas dos salões ainda não foram testados com contas reais.
- Textos legais (termos, privacidade, contratos, política de retenção) dependem de revisão da Dra. Roberta.
