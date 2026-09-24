# REVAH®

Plataforma de mensageria multicanal com CRM, campanhas, inbox unificado, chatbot com IA, agente de voz e captação de leads.
Produto independente da WMundi Technology & Co — domínio **revah.com.br**.

Esta pasta é autossuficiente: **não importa nada do DentalPos One** e usa **banco de dados próprio**.
Pode virar um repositório separado a qualquer momento (ver "Separar em repositório próprio").

## Estrutura

| Pasta | O que é | Deploy sugerido |
|---|---|---|
| `api/` | API Express + Prisma (Postgres próprio) | Vercel, projeto `revah-api` → `api.revah.com.br` |
| `web/` | Painel (React + Vite) | Vercel, projeto `revah-web` → `app.revah.com.br` |
| `site/revah-site-connector.js` | Liga o site estático atual (Netlify) à API real | Junto do `index.html` no Netlify |
| `packages/dentalpos-one-adapter/` | `@revah/dentalpos-one-adapter` — único ponto de contato com o DentalPos One | Consumido pelo backend do DentalPos |
| `docs/` | Deploy, integração DentalPos, decisões e API | — |

## O que está pronto

- **Contas e acesso**: cadastro (empresa + dono), login, recuperação de senha, equipe com papéis (OWNER/ADMIN/AGENT), chaves de API, auditoria.
- **Teste de 14 dias validado no servidor** (começa ao cadastrar a forma de pagamento; até 20 contatos por campanha), sem reuso por e-mail/telefone/documento.
- **Pagamentos**: Asaas no Brasil (Pix, boleto, cartão) e Stripe internacional; START R$ 247 e PRO R$ 597, cobrança mensal automática, cancelamento a qualquer momento, webhooks idempotentes, add-on de leads.
- **Templates**: biblioteca de modelos por segmento + modelos da empresa (limite por plano).
- **Canais**: WhatsApp (Meta Cloud API oficial, Z-API e Zapiô com aceite de risco obrigatório), SMS (Twilio), Telegram, e-mail (Resend, com descadastro em 1 clique), Instagram Direct e Messenger (Graph API) e voz (Twilio). Modo simulado para testes.
- **Consentimento**: suppression list por canal (palavras como SAIR/PARAR, pedido verbal ou tecla 9 na ligação, link de e-mail, manual, importação), histórico de consentimento e bloqueio de envio em todos os fluxos.
- **CRM**: contatos, etiquetas, notas, importação CSV, deduplicação, histórico unificado (todos os canais + ligações + notas).
- **Campanhas**: público por etiquetas/contatos/lista manual, prévia (válidos, inválidos, bloqueados), variáveis, modelos oficiais do WhatsApp, agendamento, fila com cadência, pausa/retomada/cancelamento, envio de teste.
- **Inbox unificado** com bot de IA (Claude): intenção, resposta com contexto do CRM, pedido de agendamento, transferência para humano.
- **REVAH Voice**: fila, horários permitidos por fuso (feriados nacionais), limite de simultâneas, agente de voz com contexto, fala e DTMF, opt-out verbal, transferência, gravação só após aviso e sem recusa, transcrição por turnos, resumo e classificação no CRM, retorno automático, número por empresa, ligações recebidas, campanhas de voz e automações.
- **Automações** por gatilho (incluindo eventos do DentalPos One) com atrasos e ações (mensagem, ligação, etiqueta, webhook) + modelos prontos para clínicas.
- **REVAH Leads** (add-on): termo de responsabilidade LGPD com registro de aceite, busca por CNPJ e negócios locais, Lead Ads da própria empresa; origem nunca exposta.
- **Integração DentalPos One**: provisionamento e licença assinados, SSO (aba Marketing embutida), eventos idempotentes, sincronização de pacientes e webhook de retorno.

## Rodar localmente

```powershell
cd revah/api
copy .env.example .env      # ajuste DATABASE_URL para um Postgres local
npm install
npx prisma migrate deploy
npm run dev                  # http://localhost:4000

cd ../web
npm install
npm run dev                  # http://localhost:5174
```

Testes da API (usam um banco de teste que é apagado a cada execução):

```powershell
$env:DATABASE_URL="postgresql://revah:revah@localhost:5432/revah_test"; npm test
```

## Separar em repositório próprio

```powershell
git subtree split --prefix=revah -b revah-standalone
git push https://github.com/wmundiapps/revah.git revah-standalone:main
```

No DentalPos One, troque a dependência `file:../revah/packages/dentalpos-one-adapter` pela versão publicada do pacote.

Mais detalhes: `docs/DEPLOY.md`, `docs/INTEGRACAO-DENTALPOS.md`, `docs/DECISOES.md`, `docs/API.md`.
