# REVAH API — referência rápida

Autenticação do painel: `Authorization: Bearer <token>` (de `/auth/login`, `/auth/register` ou SSO).
Integrações: `X-Api-Key: rvh_...` (chaves em Configurações → API).
Erros: `{ error, code, details }`. `402` = precisa de upgrade/ação (`TRIAL_EXHAUSTED`, `TRIAL_RECIPIENT_LIMIT`,
`MONTHLY_LIMIT`, `PLAN_FEATURE`, `PAYMENT_PAST_DUE`, `LEADS_ADDON_REQUIRED`, `LEADS_TERMS_REQUIRED`).

| Área | Rotas |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/change-password` · `POST /auth/sso/dentalpos` |
| Planos/assinatura | `GET /plans` · `POST /payments/create-subscription` (site) · `POST /billing/checkout` · `POST /billing/portal` · `GET /billing/status` · `POST /billing/leads-addon` · `GET /trial/status` · `POST /sales/enterprise` |
| CRM | `GET/POST /contacts` · `GET/PATCH/DELETE /contacts/:id` · `GET /contacts/:id/timeline` · `POST /contacts/:id/notes` · `POST /contacts/:id/consent` · `POST /contacts/import` · `POST /contacts/bulk-tag` · `GET/POST/DELETE /tags` · `GET/POST /suppressions` |
| Canais | `GET /channels/providers` · `GET/POST /channels` · `PATCH/DELETE /channels/:id` · `POST /channels/:id/test` |
| Campanhas | `GET/POST /campaigns` · `GET/PATCH/DELETE /campaigns/:id` · `POST /campaigns/preview-audience` · `POST /campaigns/:id/launch|pause|resume|cancel|test` |
| Inbox | `GET/POST /conversations` · `GET /conversations/:id` · `POST /conversations/:id/messages|status|assign` |
| Automações | `GET /automations/triggers` · `GET/POST /automations` · `PATCH/DELETE /automations/:id` · `POST /automations/templates/dentalpos` · `POST /automations/test-event` |
| Voz | `GET/PUT /voice/settings` · `GET/POST /voice/calls` · `GET /voice/calls/:id` · `POST /voice/calls/:id/cancel` |
| Leads | `GET /leads/access` · `POST /leads/terms/accept` · `POST /leads/search` · `GET /leads` · `POST /leads/import|discard` |
| Configurações | `GET /dashboard` · `GET/PATCH /settings/company` · `GET/PUT /settings/bot` · `GET/POST/PATCH /users` · `GET/POST/DELETE /settings/api-keys` · `GET/PUT /settings/integration` · `GET /audit` |
| Backoffice WMundi | `GET /admin/tenants` · `PATCH /admin/tenants/:id` · `GET /admin/sales-inquiries` · `GET /admin/billing-events` |
| API pública | `POST /v1/contacts` · `POST /v1/messages` · `GET /v1/messages/:id` · `POST /v1/events` |
| DentalPos One | `POST /integrations/dentalpos/provision|license` (assinadas) · `POST /integrations/dentalpos/events` · `POST /integrations/dentalpos/patients/sync` · `GET /integrations/dentalpos/status` |
| Webhooks | `/webhooks/stripe` · `/webhooks/meta` · `/webhooks/telegram/:id` · `/webhooks/zapi/:id/:segredo` · `/webhooks/zapio/:id/:segredo` · `/webhooks/email/:id/:segredo` · `/webhooks/twilio/sms/:id` · `/webhooks/twilio/voice/...` |
| Sistema | `GET /health` · `/cron/tick` · `GET|POST /public/unsubscribe/:token` |

Variáveis de mensagem: `{{nome}}`, `{{primeiro_nome}}`, `{{empresa}}`, campos personalizados do contato e, em eventos do DentalPos,
`{{data}}`, `{{hora}}`, `{{profissional}}`, `{{procedimento}}`, `{{valor}}`, `{{vencimento}}`, `{{link_pagamento}}`.
