# Integração DentalPos One ↔ REVAH

Os dois sistemas **não compartilham código nem banco**. O DentalPos usa apenas o pacote
`@revah/dentalpos-one-adapter` (`revah/packages/dentalpos-one-adapter`).

## Variáveis

| Onde | Variável | Valor |
|---|---|---|
| REVAH API | `DENTALPOS_SHARED_SECRET` | segredo longo (openssl rand -hex 32) |
| DentalPos backend | `REVAH_SHARED_SECRET` | **o mesmo** segredo |
| DentalPos backend | `REVAH_API_URL` | https://api.revah.com.br |
| DentalPos backend | `REVAH_APP_URL` | https://app.revah.com.br |
| DentalPos backend | `PUBLIC_API_URL` | URL pública da API do DentalPos (ex.: https://dentalpos-one-w2pa-one.vercel.app/api) |

## Fluxo
1. **Licença (feature flag)**: equipe WMundi chama `POST /revah-bridge/license { clinicId, active: true, plan: "PRO" }` no DentalPos.
   Isso provisiona a clínica no REVAH (empresa + dono + chave de API) e guarda a chave criptografada na flag `REVAH` da clínica.
   `active: false` suspende o Marketing nos dois lados.
2. **SSO**: menu Marketing → "Central de Marketing" (`/marketing/central`). O DentalPos gera um token de 2 minutos, uso único,
   e abre o painel do REVAH embutido (sem a marca REVAH, aparece como "Marketing").
3. **Eventos**: `GET/POST /cron/revah-sync` (Bearer `CRON_SECRET`) varre cada clínica ativa e envia, com ids estáveis
   (sem duplicar): agendamento criado, lembrete de véspera, falta, cancelamento, orçamento pendente (2+ dias),
   cobrança (2 dias antes e 3 dias depois do vencimento), recall (~6 meses sem retorno) e pós-operatório.
   Botão "Sincronizar agenda e financeiro agora" faz o mesmo sob demanda.
4. **Automações**: no REVAH, Automações → "Instalar modelos DentalPos One" cria as 7 automações prontas (editáveis).
5. **Retorno**: o REVAH chama `POST /revah-bridge/webhook/:clinicId` (assinado) com `revah.opt_out`,
   `revah.appointment_requested` (pedido de agendamento pelo chatbot) e `revah.call_completed`; o DentalPos registra na auditoria.

## Agendar a sincronização
No projeto `dentalpos-one-w2pa` da Vercel, adicione um cron para `/api/cron/revah-sync` (a cada 15 min, ou diário no plano Hobby)
ou use um agendador externo com o header `Authorization: Bearer CRON_SECRET`.
