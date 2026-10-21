# Checklist de segurança antes de ir ao ar
**Contas**
- [ ] 2FA em GoDaddy, Registro.br, Cloudflare, Vercel, Railway, GitHub, Stripe, Asaas, Meta Business, Google Ads.
- [ ] Senhas no gerenciador (1Password/Bitwarden). Nunca em chat/e-mail.
- [ ] Bloqueio de transferência de domínio ligado.

**Cloudflare**
- [ ] SSL Full (strict), HSTS, Always Use HTTPS, TLS mínimo 1.2.
- [ ] WAF gerenciado + Bot Fight Mode; regra de rate limit para `/api/auth/*` (10 req/min/IP) e `/api/public/*`.
- [ ] Turnstile no formulário (preencher `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET`; incluir `https://challenges.cloudflare.com` no CSP antes de usar).
- [ ] Restringir origem do Railway para IPs Cloudflare (opcional).

**Aplicação**
- [ ] `APP_SECRET` e `APP_ENC_KEY` únicos (>= 32 chars), guardados em cofre; trocar APP_ENC_KEY invalida credenciais salvas dos salões.
- [ ] `SIMULATE_MESSAGING=false` e `NODE_ENV=production`.
- [ ] Backup diário do Postgres + teste de restauração.
- [ ] Logs sem dados pessoais (já não registra corpo/consultas).
- [ ] ClamAV rodando (opcional) para uploads.
- [ ] Revisar `npm test` verde antes de cada deploy.

**Meta/WhatsApp**
- [ ] Verificação do negócio na Meta; app em modo Live; permissões `whatsapp_business_messaging`, `pages_messaging`, `instagram_manage_messages`.
- [ ] Para vender a muitos salões: tornar-se Tech Provider/Solution Partner (Embedded Signup).

**LGPD**
- [ ] Termos e Privacidade revisados por advogado; nomear encarregado (DPO).
- [ ] Contrato de operador com cada salão (a WMundi é operadora; o salão é controlador).

## Auditoria dos webhooks (21/10/2026)
| Rota | Validação antes de qualquer efeito | Observações |
|---|---|---|
| `POST /webhooks/meta` | HMAC SHA-256 do corpo bruto (`X-Hub-Signature-256`), comparação em tempo constante; 403 se inválido | `GET` de verificação com token próprio |
| `POST /webhooks/stripe` | Assinatura `Stripe-Signature` com tolerância de 5 min; 400 se inválida | Idempotência por id do evento |
| `POST /webhooks/asaas` (plataforma) | Token `asaas-access-token` (401 se ausente ou diferente); consulta o pagamento na API do Asaas em vez de confiar no corpo | Só ativa assinatura se o pagamento está quitado e cobre o valor do plano |
| `POST /webhooks/asaas/:salonId` | Token do próprio salão; consulta o pagamento na API do Asaas | Só confirma reserva ou venda se o status é quitado, o valor confere e o id do pagamento é o da reserva |
| `GET /api/cron/tick` | `Authorization: Bearer CRON_SECRET`, comparação em tempo constante | Sem o segredo configurado, sempre 401 |

Corrigido nesta auditoria:
- Se o processamento falhava depois de registrar o evento, o reenvio do provedor era tratado como duplicado e o pagamento ficava perdido. Agora o evento é liberado e a rota devolve erro para o provedor reenviar.
- Confirmação de reserva e de venda agora confere status, valor e referência do pagamento.
- Ativação de assinatura pelo Asaas confere status e valor.

Limite conhecido: o Asaas usa token fixo (não assina o corpo); por isso toda confirmação é reconsultada na API do Asaas.
