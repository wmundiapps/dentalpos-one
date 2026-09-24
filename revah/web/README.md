# REVAH® — Painel web

Painel do REVAH (mensagens multicanal, CRM, chatbot com IA, campanhas, automações, REVAH Voice e REVAH Leads).
SPA em React + Vite + TypeScript. Consome a REVAH API (`revah/api`).

## Rodar localmente

```bash
cp .env.example .env        # ajuste VITE_API_URL se a API não estiver em http://localhost:4000
npm install
npm run dev                 # http://localhost:5174 (mesma porta do APP_URL padrão da API)
```

A API precisa estar rodando (`cd ../api && npx tsx src/server.ts`). Para testar sem provedores reais, conecte canais em **modo simulado**.

## Build

```bash
npm run build               # tsc (checagem de tipos) + vite build → dist/
npm run preview             # serve o build localmente
```

## Deploy na Vercel

- Projeto: `revah-web`, com *Root Directory* = `revah/web`.
- Framework: Vite · Build: `npm run build` · Output: `dist`.
- Variável de ambiente: `VITE_API_URL` = URL pública da API (ex.: `https://api.revah.com.br`).
- Domínio: `app.revah.com.br`.
- O `vercel.json` já redireciona todas as rotas para `index.html` (SPA).

Na API, confira `APP_URL=https://app.revah.com.br` (links de e-mail e retorno do checkout) e o CORS.

## Modo embutido (DentalPos One)

- O DentalPos One abre `https://app.revah.com.br/sso?token=<token>` na aba Marketing (iframe).
- Sessões vindas do SSO têm `embedded: true`: o painel aparece como **Marketing**, sem a marca REVAH, sem Assinatura e sem ofertas de plano.
- `?embed=1` em qualquer URL força o modo compacto nesta aba; `?embed=0` desliga.
- Opcional: `&next=/inbox` no link de SSO abre direto uma página.

## Estrutura

```
src/
  lib/          api.ts (fetch + token + erros), session.tsx, types.ts, format.ts, csv.ts
  components/   ui.tsx (Button, Modal, Drawer, Badge, Field, EmptyState…), feedback.tsx (toast + aviso de upgrade), Layout.tsx
  pages/        Auth, Dashboard, Contacts (+ ContactDrawer), Inbox, Campaigns, Automations,
                Channels, Voice, Leads, Billing, Settings, Admin
```

A sessão fica em `localStorage` (`revah.session`). Respostas 401 encerram a sessão; 402 abrem o aviso de upgrade.
