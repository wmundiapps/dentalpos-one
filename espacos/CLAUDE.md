# SpaceHour — regras para quem mexe neste código

SpaceHour (https://space-hour.com): aluguel de salas e consultórios por hora. Operado pelo Instituto Ravel
(CNPJ 03.162.275/0001-10). Dono: Robson (não técnico: textos curtos, um passo por vez, com link).

## Como rodar
- Testes do servidor: `service postgresql start` e depois `cd espacos/server && npm test` (Postgres local).
- Tipos: `npx tsc -p tsconfig.json --noEmit` em `server/` e em `web/`. Build da tela: `npm run build --workspace web`.
- Lockfiles ficam em `server/` e `web/` (não na raiz `espacos/`): depois de instalar pacote, apague `espacos/package-lock.json`
  e rode `npm install --package-lock-only --workspaces=false` dentro de `server/` ou `web/`.
- Migrações: `server/migrations/NNN_nome.sql`, aplicadas no deploy (`vercel-build`). Nunca edite uma migração já publicada.
- Traduções: os 11 idiomas em `web/src/i18n/locales/` têm o mesmo tipo; toda chave nova vai em todos
  (pt-BR em português; os demais podem ficar em inglês até a tradução).

## Regras que não mudam
- **Segredos:** nunca pedir senha, token, chave ou código de 2 etapas no chat. Variáveis na Vercel sem "Sensitive";
  `VITE_*` são públicas (vão para o navegador): nunca ponha segredo nelas. Guardar cópia da `DOCUMENT_ENCRYPTION_KEY`.
- **LGPD na captação:** copia-se código de outros sistemas (ClubeFaz, REVAH), nunca listas de contatos.
  Quem pede para sair é bloqueado por hash (CNPJ, telefone, e-mail) e tem telefone/e-mail apagados.
  Convite identifica o operador e a origem do dado; WhatsApp só 8h–21h, um por pessoa; e-mail só pela caixa de convites.
- **Segurança:** toda regra no servidor (a tela é pública, F12 mostra tudo). Fotos regravadas no servidor (sem GPS);
  PDF com conteúdo ativo recusado; documentos sensíveis cifrados e servidos com CSP sandbox.
- **Commits e PRs:** sem identificador de modelo de IA. Mensagens em português.
- **O que depende do Robson** (SQL no Supabase, chaves, contas de anúncio, texto jurídico): pedir um passo por vez, com link.
