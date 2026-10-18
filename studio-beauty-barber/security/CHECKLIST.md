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
