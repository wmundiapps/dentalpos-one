# Regras comuns dos agentes (EduMaster Pro) — leia antes de começar

Repo /home/user/dentalpos-one, branch claude/educational-management-system-dbzqco. Contexto: demo para universidades avaliarem troca de gerenciador acadêmico; prazo curtíssimo; qualidade e funcionamento ponta a ponta importam mais que volume de telas.

## Onde olhar
- backend/src/modules/edu.routes.ts (registro de rotas), módulos CRUD de exemplo (apoio/ouvidoria.ts, secretaria/), backend/src/modules/lgpd/README.md e seguranca/README.md (auth, tenantId, audit(), máscara de CPF, log de acesso a dado sensível, 2FA, upload guard).
- Fragmentos Prisma em backend/prisma/edu/*.prisma mesclados por scripts/merge-edu-schema.js; checagem scripts/edu-check.sh. Migration SQL manual: backend/prisma/manual-migrations/20261004_edumaster_pro.sql — acrescente blocos com marcadores `<SIGLA>:BEGIN` / `<SIGLA>:END` (só CREATE/ADD COLUMN IF NOT EXISTS), gerados com `prisma migrate diff` como fez o módulo LGPD (git log --stat -- backend/prisma/manual-migrations).
- Frontend EduMaster: frontend/src/edu/* (shell, páginas por módulo), frontend/src/pages/edu/*, menu em frontend/src/config/navigation.tsx, rotas em frontend/src/routes/AppRoutes.tsx. Já existem: Portal do Aluno (frontend/src/pages/edu/EduPortalAluno.tsx + edu/portal), secretaria (protocolos, certificados, diplomas, verificação pública), biblioteca, apoio, pesquisa, comunicação, governança, reitoria, infraestrutura, suprimentos, jurídico/rh/cobrança/tesouraria (em construção por outros agentes).
- NÃO copie marca, logotipo, textos nem layout proprietário do Jacad ou de qualquer concorrente; implemente a FUNCIONALIDADE com identidade própria do EduMaster.

## Qualidade
- Telas responsivas (usadas em celular), estados de carregando/erro/vazio, acessibilidade básica, textos em português do Brasil.
- Multi-tenant (tenantId) e permissões por perfil em todas as rotas; isolamento testado.
- LGPD/segurança: dados sensíveis (saúde, biometria, menores) com base legal, consentimento, minimização e log de acesso; nada de segredo em logs ou no bundle do frontend.
- Integrações externas (WhatsApp, SMS, voz, e-mail, redes sociais, IA, bancos) via interface de provedor com implementação SIMULADA quando não há credencial — nunca invente credenciais. IA: use o cliente existente backend/src/services-ai/client.ts (simulado sem chave).
- Seed de demonstração em backend/scripts/seeds/<modulo>.ts (função exportada seedX(api, ctx), no estilo de backend/scripts/edu-demo-seed.ts; NÃO edite edu-demo-seed.ts — a integração é feita depois). Dados fictícios realistas em português.
- README curto do módulo e e2e em backend/scripts/e2e/<modulo>.ts (≥100 verificações) contra Postgres LOCAL PRÓPRIO da sessão (crie um banco só seu; `pg_ctlcluster 16 main start` se parado; usuário/senha de teste do cluster; NUNCA use banco remoto, Supabase, Railway ou o banco edutest).
- Antes de cada push: tsc limpo (backend e frontend), `scripts/edu-check.sh <modulo>`, build do frontend e e2e do módulo verdes; não quebre e2e existentes.

## Trabalho em paralelo (há ~12 agentes no mesmo repositório)
- Edite arquivos compartilhados (edu.routes.ts, navigation.tsx, AppRoutes.tsx, migration) com mudanças mínimas e localizadas.
- `git add` SOMENTE dos seus caminhos; `git pull --rebase origin claude/educational-management-system-dbzqco` antes de cada push (sem force); se o pull recusar por mudanças locais de outros agentes, use `git pull --rebase --autostash origin claude/educational-management-system-dbzqco`. Resolva conflitos preservando o trabalho dos outros.
- Não pergunte nada ao usuário. Commits pequenos em português (feat(x)/test(x)/docs(x)) terminando com:
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0194vfLJB1i627NfGUH6cXa3
- Push: git push -u origin claude/educational-management-system-dbzqco. Relatório final curto: o que foi feito, testes, como ver na demo (login/tela), limites honestos.
