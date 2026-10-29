# HANDOFF — EduMaster Pro (WMundi Technologies)

Resumo completo para continuar em outro chat. Atualizado em 29/10/2026.
Cole este arquivo inteiro no novo chat e diga: "Continue a partir do HANDOFF-EDUMASTER.md".

## 0. Quem é o usuário e como trabalhar com ele
- Robson, dono da WMundi Technologies (desenvolvedora de apps Apple e Android, sites, sistemas). Fala português do Brasil.
- Está no celular. Não tem PowerShell. Quer links em texto simples.
- Pede: faça tudo, não pare para perguntar, sem "textões". Já disse: "Para de me dar notícias. Me mande quando estiver concluído." Então: trabalhe em silêncio e avise só no fim (respostas curtas).
- Autorizou uso de GitHub, Vercel, Railway, Supabase etc. sem pedir a cada passo.
- Objetivo: demo polida do EduMaster Pro para enviar a universidades que estão trocando de sistema no fim do ano letivo. Tempo curtíssimo.
- Marca: o sistema aparece como **EduMaster Pro**, a instituição como **SUA INSTITUIÇÃO**, e a única empresa citada é a **WMundi** (desenvolvedora). Nenhuma referência a DentalPos, REVAH, Instituto Ravel ou outras marcas dele. Também nunca copiar marca, textos, imagens ou código do Jacad (ver seção 9).

## 1. Repositório e GitHub
- Repo: wmundiapps/dentalpos-one. Branch de trabalho: `claude/educational-management-system-dbzqco`. PR #53 (aberto; NÃO fazer merge antes de testar o login no ambiente isolado).
- Último commit conhecido no remoto: `26c500c` (módulo Campos de prática). Antes dele: `2cdcd98` (deploy final do dia), `2c3ff57` (integração dos seeds da segunda onda).
- Stack: Express + TypeScript + Prisma 5.22 + PostgreSQL; React 19 + MUI + Vite 8; multi-tenant por `tenantId`; JWT.
- Estrutura EduMaster: módulos em `backend/src/modules/*`; fragmentos Prisma em `backend/prisma/edu/*.prisma` mesclados por `node scripts/merge-edu-schema.js` (NÃO editar `schema.prisma` à mão); `scripts/edu-check.sh <modulo>`; migração SQL manual `backend/prisma/manual-migrations/20261004_edumaster_pro.sql` (blocos `<SIGLA>:BEGIN/END`); frontend em `frontend/src/edu/*`, `frontend/src/pages/edu/*`, menu em `frontend/src/config/navigation.tsx`, rotas em `frontend/src/routes/AppRoutes.tsx`.
- Modo só-EduMaster do frontend: variável `VITE_APP_MODE=edu`.
- Git neste sandbox: a cópia local `/home/user/dentalpos-one` ficou divergente do remoto (vários agentes empurraram por worktrees). Não faça `git reset --hard` ali (o sistema bloqueou). Trabalhe em worktree novo a partir de `origin/claude/educational-management-system-dbzqco` e envie com `git push origin HEAD:claude/educational-management-system-dbzqco` (ou commit com índice temporário). Hook "uncommitted changes" na cópia compartilhada é ruído; o que importa está no GitHub.
- `pkill -f` mata o próprio shell neste sandbox; use `fuser -k <porta>/tcp`.

## 2. O que está construído (tudo no GitHub)
Módulos EduMaster (todos com testes e2e em Postgres real, 0 falhas nos relatórios dos agentes):
- Reitoria (painel executivo, agenda, Diário Oficial DOU, painéis, convênios, pessoas e avaliações, graduação e pós, comparativo com outras IES), Governança e PDI/CPA, Regulatório MEC (processos, checklists, recredenciamento), Jornadas e fluxogramas.
- Acadêmico: admissões/vestibular, secretaria e certificados, calendário, notas e diário, modalidades EAD e pós, desempenho (ENADE/OAB), provas com IA, conteúdo, biblioteca, pesquisa e revista (periódico estilo OJS), acadêmico avançado (alunos com filtros e xlsx, matrizes e fluxograma, salas e horários, desenvolvimento do aluno, pesquisa/extensão/ligas).
- Portais: ambientes de ensino (7 ambientes), portal do aluno (14–16 abas), portal do professor (10 abas), sala virtual EAD.
- Presença e acesso: reconhecimento facial no dispositivo, QR, acesso a espaços, empréstimos.
- Atendimento ao aluno: caixa omnichannel, protocolos com jornada e rastreio público, documentos, IA com LGPD, emissão em PDF com QR, autoatendimento. Comunicação omnichannel e robôs.
- Operação: infraestrutura (agenda, solicitações e OS com fotos, frota, segurança patrimonial, indicadores), suprimentos (compras, estoque, patrimônio), apoio/NAE/ouvidoria/egressos.
- Financeiro e Tesouraria, Cobrança (régua, acordos), RH (ponto, folha, férias, avaliações), Jurídico, Marketing e captação (campanhas, leads, funil, IA, site e landing, eventos, LGPD).
- Botão global de sugestões/bugs (Alt+Shift+F) com triagem na Central de feedback.
- NOVO (commit 26c500c): **Campos de prática** (`/edu/campos-pratica`): estágios, clínicas-escola com agendas por curso (Psicologia, Biomedicina, Fonoaudiologia, Medicina Veterinária, Odontologia, Medicina), núcleo de agronomia e controle de culturas, núcleo animal (pequenos e grandes animais). 472 verificações e2e no relatório do agente. Ainda NÃO foi publicado na demo online (ver seção 4).
- Segurança e LGPD: 2FA TOTP, AES-256-GCM, bloqueio por tentativas, CSP, scanner de uploads, trilha de auditoria, log de acesso a dado sensível, Central LGPD (consentimentos, direitos do titular, ROPA, retenção, incidentes, DPO), páginas públicas /privacidade /termos /portal-titular.
- Limites honestos que NÃO podem ser prometidos como prontos: boleto/Pix, negativação/protesto, canais WhatsApp/SMS/e-mail/voz/redes, assinatura ICP-Brasil e IA real são SIMULADOS sem credenciais; precisão do reconhecimento facial exige piloto; textos jurídicos, cálculos trabalhistas e prazos de LGPD são modelos a validar por advogado/contador; sem OCR/leitura automática de documentos; videoaulas e PDFs entram só por link (não há armazenamento/upload próprio); não há eSocial nem NFS-e; sem integração com catraca.

## 3. Demonstração online (Railway, projeto de teste)
- Site: https://web-production-5398c.up.railway.app
- Login da apresentação: `apresentacao@uninga.br` / senha `Uninga@2026` (o e-mail foi corrigido de "uminga" para "uninga" a pedido do usuário; e-mail não aceita acento. Se ele disser que o e-mail correto é outro, mudar a variável `DEMO_USER_EMAIL` no serviço api).
- Administrador completo: `admin@suainstituicao.edu.br` / `Demo@2026`. Aluno: `aluno@suainstituicao.edu.br` / `Aluno@2026`. Logins dos portais (senha `Demo@2026`): aluno.presencial@, aluno.ead@, aluno.pos@, professor@, professora.ead@, coordenador@ (todos `@suainstituicao.edu.br`).
- API: https://api-production-03a0.up.railway.app/api
- Railway: projeto `edumaster-teste` id `c8f3af32-2268-440b-be78-7a8627b910c0`, ambiente `a0d12570-8fe3-41ed-9066-9639ca9bce48`. Serviços: `api` `276f5967-f4f4-4a34-9077-d640fa826e59` (Dockerfile `deploy/railway/api.Dockerfile`, start `sh scripts/edu-railway-start.sh`), `web` `e7c32c10-18b8-4900-8cd8-9ce8be11fd4d` (build `npm install && npm run build`, `npx --yes serve -s dist -l $PORT`), `Postgres` `82d7668e-37ac-4bef-8dff-a8ce1cd1237b`.
- Ambos api e web estão FIXADOS (pinned) no commit `2cdcd98`. Para publicar versão nova: `connect-service-source` com `repo=wmundiapps/dentalpos-one`, `branch=claude/educational-management-system-dbzqco` e `commitSha=<novo commit>` nos DOIS serviços.
- Variáveis importantes do api: `NODE_ENV=staging` (produção exige backup configurado e não vou fingir), `EDU_RESET` (0 normalmente; 1 apaga e recria o banco na próxima subida; voltar a 0 depois), `API_RATE_LIMIT_MAX=100000` (necessário para o seed não tomar 429), `TENANT_SECRET_MASTER_KEY` (definida), `DEMO_USER_EMAIL/PASSWORD/NAME/ROLE`, `DEMO_TENANT=sua-instituicao`, `SECURITY_TOTP_ISSUER="EduMaster Pro"`.
- Como atualizar a demo com dados novos: setar `EDU_RESET=1` (e atualizar o commit), esperar ~5 min (reset por tabela via `scripts/edu-reset-db.ts`, `db push`, seed completo ~4 min, criação do usuário de apresentação), conferir nos logs `[demo-user] criado` e a linha "N chamadas falharam" (esperado ~5), depois setar `EDU_RESET=0`.
- O sandbox bloqueia os domínios da Railway; verifique pelos logs/MCP, não por curl.

## 4. O que ainda NÃO está na demo online
- Módulo Campos de prática (26c500c) e a integração do seu seed. A integração (`seedCamposPratica` em `backend/scripts/edu-demo-seed.ts`, lista ONDA2) está feita no worktree `/home/user/wt-pdf` mas NÃO foi commitada. Fazer: commit, `connect-service-source` nos dois serviços, `EDU_RESET=1`, conferir logs, `EDU_RESET=0`.

## 5. Apresentação / PDF — situação
### PDF atual (4 páginas, A4, já enviado ao usuário, considerado FRACO por ele)
- Gerado por `node docs/apresentacao/gerar.mjs` (Chromium headless) a partir de `frontend/src/edu/apresentacao/conteudo.json`; copia o PDF para `frontend/public/apresentacao-edumaster.pdf`. Há também `docs/apresentacao/email-instituicoes.md` (e-mail curto para as instituições) e a página pública `/apresentacao` do site.
- Proposta comercial no PDF (página 4): 90 dias de implementação; 3 meses de teste gratuito; depois **R$ 42.000,00 por mês + R$ 1,90 por aluno por mês**; tokens de IA, Meta (WhatsApp) e SMS pagos direto às empresas contratadas. Aplicativos Apple e Android (opcional): R$ 50.000,00 em 10x de R$ 5.000,00; hospedagem, banco de dados e servidores R$ 1.690,00/mês + R$ 1,02 por aplicativo baixado, por mês; atualizações a combinar conforme telas e funcionalidades, a pedido da instituição e com orçamento prévio aprovado pelas partes.
- Contato WMundi (já no PDF/rodapé): www.wmundi.com · info@wmundi.com · WhatsApp (44) 99946-6451 · Av. XV de Novembro, 255 · Maringá – PR. Logo oficial recebida ("W MUNDI Marketing Digital") em `frontend/public/wmundi-logo.png`.
- Pendente do usuário: breve currículo e nome de contato (campos `curriculo` e `contato.nome` vazios em `conteudo.json`).
- Texto de segurança pedido pelo usuário: "tudo criptografado; a tecnologia anti-código também é anti-ataques".

### NOVO PDF — o que o usuário exigiu (refazer do zero, "sem remontar nada, em ordem")
Críticas dele: "Ninguém compra isso. Está fraco. Não fala do ambiente do aluno. Nada de 2 assuntos coluna a coluna. Não dá para ler no celular."
Requisitos:
1. **Uma coluna só**, um assunto embaixo do outro; **letras grandes** (lido no celular). Formato sugerido: página estreita tipo 110×195 mm, corpo ~12 pt.
2. **Ordem por grandes núcleos**: PDI → Infraestrutura → Pedagógico → Docente → Discente (depois, administrativo/financeiro, relacionamento e captação, segurança e LGPD, proposta). Dentro de cada núcleo, subitens em **ordem alfabética**, um assunto por tópico, sem misturar departamentos.
3. Cada subitem: título, descrição EMPOLGANTE embaixo, e **foto da tela real** do sistema.
4. Tom motivador, que faça continuar lendo; enaltecer cada função; dizer que é **intuitivo, de fácil aprendizado, com muitas funções automatizadas, sem depender de memória nem de comandos humanos**.
5. **Falar muito de IA**, com referências do setor (universidades do Brasil e do mundo) e enfatizar que tudo é baseado em literatura/normas e com auxílio de INTELIGÊNCIA ARTIFICIAL.
6. Itens pedidos explicitamente: ambiente do aluno; provas; certificados; conteúdo; biblioteca; local de videoaulas; locais para PDFs; avaliação de histórico escolar e equivalência; avisos de provas; robôs (atendimento, responder redes sociais, leitura e arquivo de documentos); área para revista científica; áreas de estágio; núcleos de agronomia/controle de culturas; áreas de pequenos animais; áreas de grandes animais; agendas para psicologia, biomedicina, fonoaudiologia, medicina veterinária, odontologia, medicina; acompanhamento de comissões de avaliação do MEC; CPA; calendários com checklist de implantação, avaliação e reconhecimento de cursos; checklist para recredenciamento.
7. Ser HONESTO: só afirmar o que existe. Cobertura verificada (ver `docs/apresentacao/fonte/cobertura-1.json` e `cobertura-2.json`): existe — certificados, avisos de provas (7 e 1 dia antes), revista científica, CPA, checklist de recredenciamento, biblioteca, ambiente do aluno; parcial — provas, conteúdo, equivalência/histórico, comissões MEC, checklists de implantação/reconhecimento, robôs de redes sociais, estágios (agora cobertos pelo módulo novo Campos de prática); NÃO existe — armazenamento próprio de videoaulas e PDFs (só links), OCR/leitura automática de documentos. Agronomia, animais e agendas clínicas passaram a existir com Campos de prática (26c500c).

### Material já pronto para o novo PDF (em `docs/apresentacao/fonte/`)
- `inventario-1.json` (60 itens: PDI e pedagógico), `inventario-2.json` (62: docente, discente, infraestrutura, atendimento, comunicação, admissões), `inventario-3.json` (56: administrativo/financeiro, marketing, segurança/LGPD) — cada item: nucleo, modulo, rota, titulo_chamada, descricao, funcionalidades, automacoes, ia, base_normativa_literatura, limites, telas_para_print. Ainda falta o inventário de **Campos de prática** (ver README do módulo).
- `seguranca-lgpd.json` (51 controles de segurança/privacidade).
- `referencias-ia.json` / `.md`: 36 referências de IA no ensino superior (Brasil e mundo). Confiança alta: Georgia State/Pounce (AERA Open), Harvard tutor de IA em física (Scientific Reports), Georgia Tech/Jill Watson, Arizona State + OpenAI, Open University/OU Analyse, VLibras/UFPB, Clarivate Primo Research Assistant, diretrizes da Andifes. Governança (UNESCO 2021 e 2023, AI Act, PL 2338/2023, Parecer CNE/CP 15/2026) só verificada por resumos: conferir os links antes de citar. Lacunas: não há caso com número sólido de cobrança por IA nem de queda de evasão por IA no Brasil — não usar números disso.
- `rotas.json` (92 rotas do menu) e `shoot.cjs` (script Playwright que tira prints 430×932 @2x de cada rota).
- `REGRAS-AGENTES.md` (regras usadas com os agentes).

### Prints das telas: precisam ser refeitos
- Os 92 prints feitos saíram com "Ambiente indisponível" (o frontend apontava para `localhost:3000/api` e a API estava na 3055) e com o aviso de cookies. Receita correta:
  1. `pg_ctlcluster 16 main start`; criar banco: `su postgres -c "psql -c \"create role shotu login superuser password 'shotu'\" -c \"create database shot owner shotu\""`.
  2. No worktree: `cd backend && DATABASE_URL=postgresql://shotu:shotu@localhost:5432/shot npx prisma db push --skip-generate --accept-data-loss`.
  3. Subir a API na **porta 3000**: `DATABASE_URL=... NODE_ENV=development PORT=3000 PRISMA_QUIET=1 API_RATE_LIMIT_MAX=100000 JWT_SECRET=<32+ caracteres> TENANT_SECRET_MASTER_KEY=<32+ caracteres> npx tsx src/server.ts` (em background com setsid/nohup).
  4. Seed: `API_URL=http://localhost:3000/api DATABASE_URL=... npx tsx scripts/edu-demo-seed.ts` (~3–4 min; tem que incluir a etapa `campos-pratica`). O login precisa do `clinicId` (impresso no fim do seed).
  5. Frontend: `cd frontend && VITE_APP_MODE=edu npx vite build && npx vite preview --port 4173 --host 127.0.0.1` (a API padrão do front é http://localhost:3000/api).
  6. Prints: `CLINIC=<clinicId> node shoot.cjs <pasta> [email] [senha] [json-de-rotas] [prefixo]`. Antes de navegar, gravar no localStorage `dentalpos.cookies.v1` = `{"versao":"1.0-modelo","decididoEm":"2026-10-29T00:00:00Z","necessarios":true,"opcionais":{"COOKIES_PREFERENCIAS":false,"COOKIES_ANALITICOS":false,"COOKIES_MARKETING":false}}` para sumir o banner. Limite de login: 5 tentativas erradas bloqueiam por minutos (reiniciar a API limpa).
  7. Para o portal do aluno e do professor, entrar com `aluno.presencial@suainstituicao.edu.br` e `professor@suainstituicao.edu.br` (senha `Demo@2026`) e clicar nas abas.
- Montar o PDF: HTML → Chromium headless (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox --no-pdf-header-footer --print-to-pdf`), `@page` de página estreita, imagens JPEG comprimidas (~60–80 KB cada), `break-inside: avoid`. Criar também a versão do texto no site se fizer sentido.
- Depois de gerar: conferir visualmente páginas (pdftoppm), enviar ao usuário com `SendUserFile`, atualizar `frontend/public/apresentacao-edumaster.pdf` e o e-mail.

## 6. Pendências do usuário (não dependem de mim)
- Breve currículo e nome de contato para capa/PDF.
- Confirmar se o e-mail correto do login é `apresentacao@uninga.br` (ele escreveu "Uningá").
- Prints (ou usuário de teste só do ambiente do aluno) do Jacad. Sem senha no chat.
- Revisão jurídica e das normas MEC/INEP; chaves reais de IA/WhatsApp/e-mail/SMS/voz; decidir migration em produção com backup; ativar 2FA obrigatório (`REQUIRE_2FA_ROLES`) e variáveis de segurança; corrigir projeto Vercel `alignsystem`.
- Os avisos da Vercel sobre o projeto antigo `revah-web` (falha/bloqueio) NÃO afetam a demo na Railway.

## 7. Jacad
- Objetivo: espelhar a FUNCIONALIDADE do Jacad com identidade e personalização próprias do EduMaster (o usuário confirmou que podemos espelhar com nossa personalização para não cair em plágio). Nunca copiar marca, texto, imagem, layout proprietário nem código.
- Acesso: testei em 29/10 e este ambiente NÃO consegue abrir jacad.com.br (conexão bloqueada pela rede do sandbox). Mesmo com login e senha eu não conseguiria entrar. Alternativas: o usuário manda 10–15 prints/vídeo curto do ambiente do aluno (e do administrador), ou um administrador libera o domínio na política de rede do ambiente. Conferir os termos de uso do Jacad. Preferir usuário de teste e trocar a senha depois.

## 8. Lista de arquivos e comandos úteis
- Gerar o PDF antigo: `node docs/apresentacao/gerar.mjs`.
- Validar: backend `cd backend && npx tsc --noEmit -p .`; frontend `cd frontend && npx tsc -b`; build `VITE_APP_MODE=edu npm run build` (inclui varredura de segredos no bundle).
- Seeds: `backend/scripts/seeds/*.ts` (rh, tesouraria, juridico, compras-patrimonio, reitoria, cobranca, infra2 + feedback, academico2, portal, atendimento, marketing, presenca, campos-pratica) todos chamados por `backend/scripts/edu-demo-seed.ts` na lista `ONDA2`.
- Kit local de um comando: `deploy/edumaster-local/` (Windows/PowerShell, não serve para o celular do usuário).

## 9. Próximos passos sugeridos (nesta ordem)
1. Commitar e empurrar a integração do seed de Campos de prática (no worktree `/home/user/wt-pdf` ou refazendo a partir do remoto) e este HANDOFF + `docs/apresentacao/fonte/`.
2. Subir o stack local (receita da seção 5), tirar os prints corretos, incluindo as telas de Campos de prática e as abas do portal do aluno e do professor.
3. Escrever o inventário de Campos de prática (README em `backend/src/modules/campos-pratica/`).
4. Gerar o novo PDF (uma coluna, grande, ilustrado, núcleos na ordem pedida, IA e referências, proposta comercial no final, contato e logo da WMundi em todas as páginas) e mandar ao usuário.
5. Publicar na Railway o commit novo (seção 3) com reseed, depois `EDU_RESET=0`.
6. Atualizar o e-mail e a página `/apresentacao` do site para refletir o novo material.
7. Só então avisar o usuário, de forma curta.
