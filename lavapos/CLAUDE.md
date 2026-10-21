# LavaPos — regras para quem mexe neste código

Sistema de gestão para lava-rápidos e estética automotiva (WMundi). Dono: Robson (não técnico: textos curtos, um passo por vez, com link).
Mesmas regras do repositório (ver `../CLAUDE.md`). Nome do produto na tela: **LavaPos**. "Cobrar" = só cobrança de atraso; criar Pix/boleto/cartão = **"Gerar financeiro"**.

## Como rodar
- Banco local: `service postgresql start`; banco `lavapos` (usuário `lavapos`). Testes: `cd lavapos/server && npm test` (12 testes; limpam o banco).
- Tipos: `npx tsc --noEmit` em `server/`; `npx tsc -p tsconfig.json` em `web/`. Build da tela: `cd web && npm run build`.
- Demonstração: `RATE_LIMIT_OFF=1 DEMO_PASSWORD=... npm run seed-demo --workspace server` (banco separado!) e depois `node tools/screenshots.mjs <pasta>`.
- Lockfiles ficam em `server/` e `web/` (não na raiz): depois de instalar pacote, `npm install --package-lock-only --workspaces=false` dentro da pasta.
- Migrações: `server/migrations/NNN_nome.sql`, aplicadas no deploy (`vercel-build`). Nunca edite migração já publicada. Tabela nova nasce com RLS ligado e sem acesso para `anon`/`authenticated`.

## Arquitetura
- `server/`: Express 5 + Postgres (`pg`). Dados de negócio em `records` (jsonb por `kind`, sempre com `tenant_id`); regras em `routes/*.ts`; cadastros simples em `kinds.ts` (CRUD genérico, "excluir" = arquivar).
- `web/`: React + Vite, CSS próprio, mobile primeiro; vira app Apple/Google com Capacitor (`web/android`, `web/ios`).
- Dinheiro sempre em **centavos inteiros**. Horários do lava-rápido são "de parede" (texto `YYYY-MM-DDTHH:MM`, fuso America/Sao_Paulo).
- Comissão da plataforma: `PLATFORM_FEE_PCT` (padrão 10) — split Asaas ou "a repassar" (`feeMode`).

## Regras que não mudam
- **Segurança** (ver `docs/SEGURANCA.md`): toda regra no servidor; toda consulta com `tenant_id`; CPF e chaves cifrados; só imagens são aceitas como arquivo (regravadas com sharp); nunca pôr segredo em `VITE_*`; nunca pedir senha/chave/token no chat.
- **LGPD:** marketing só com consentimento; link de saída assinado; WhatsApp/SMS de marketing só 8h–21h; links digitados à mão são removidos das mensagens.
- **Texto legal** (`docs/legal/`) só muda com aprovação do Robson e revisão da Dra. Roberta; começa das Cláusulas-padrão WMundi (`../docs/legal/CLAUSULAS-PADRAO-WMUNDI.md`).
- **Avaliação no Google:** pedir a todos os clientes; nunca filtrar só os satisfeitos nem dar recompensa.
- **Não inventar:** sem depoimentos, números de clientes ou selos falsos em página/anúncio.
- O que mexe em banco, cobrança, segredo ou acesso vira PR para o Robson decidir.
