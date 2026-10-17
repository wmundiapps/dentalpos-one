# LavaPos

Gestão completa para lava-rápidos e estética automotiva: check-in/check-out com checklist e fotos, agenda inteligente, clube de assinatura, cashback, avisos (WhatsApp/SMS/e-mail), financeiro com Asaas e comissão de 10%, estoque, fornecedores, licenças/contratos e precificação com margem.

| Pasta | O que tem |
|---|---|
| `server/` | API (Express + Postgres), migrações, testes (`npm test`) |
| `web/` | Tela (React + Vite) e projetos dos aplicativos (`android/`, `ios/`) |
| `site/` | Landing page de vendas e modelos de e-mail |
| `brand/`, `store/` | Logomarca; ícones, gráficos e capturas das lojas |
| `marketing/` | Nomes, Google Ads, Meta Ads (cards PNG) |
| `docs/` | Segurança, lojas de aplicativos, plano de negócio, **contratos** (`docs/legal/`), demonstrativo |
| `tools/` | Geradores: capturas de tela, ícones, cards, e-mails |

## Rodar localmente
```bash
service postgresql start            # banco "lavapos" (usuário lavapos / senha lavapos)
cd lavapos/server && npm install && npm run migrate && npm run dev     # API em :4100
cd lavapos/web && npm install && npm run dev                          # tela em :5174
```
Variáveis de produção: `.env.example`. Implantação (Vercel): `vercel.json` (tela + API) e `site/` como projeto separado.

Status e pendências: `docs/STATUS.md`.
