# DNS e e-mail (anti-phishing do próprio domínio)
Registros sugeridos para `studiobeautybarber.com` (ajuste conforme o provedor de e-mail escolhido):

| Tipo | Nome | Valor |
|---|---|---|
| A/CNAME | `@` e `www` | (Vercel indica) |
| CNAME | `app` | (Railway indica) |
| TXT | `@` | `v=spf1 include:<provedor-de-email> ~all` (um único SPF!) |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@studiobeautybarber.com; adkim=s; aspf=s` |
| CNAME/TXT | `selector._domainkey` | (DKIM fornecido pelo provedor: GoDaddy E-mail e/ou Resend) |
| CAA | `@` | `0 issue "letsencrypt.org"` e `0 issue "pki.goog"` |

Depois de 2 semanas sem falhas no relatório DMARC, mude para `p=reject`.
Ative DNSSEC no Cloudflare e trave a transferência do domínio no GoDaddy/Registro.br.
