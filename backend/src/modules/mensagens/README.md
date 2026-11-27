# Mensageiro interno entre departamentos (`/api/edu/mensagens`)

Chat interno integrado ao EduMaster para secretaria, financeiro, jurídico, coordenação, reitoria, admissões etc. Tela: `/edu/mensagens` (menu **EduMaster · Atendimento > Mensageiro interno**). Modelos Prisma com prefixo **Msg** em `backend/prisma/edu/mensagens.prisma` (migration em `manual-migrations/20261004_edumaster_pro.sql`, bloco `MSG:BEGIN/END`). **Reaproveita** `AtdSetor` (departamentos), `AtdSetorMembro` (integrantes), a transferência de atendimentos da Central, `AtdConhecimento`/`ComFaq` (FAQ), `core/notify` (notificação), `core/reminders` (lembrete), `audit()` e o `uploadGuard` global (anexos).

## O que existe
| Área | Rotas (resumo) |
|---|---|
| Conversas | `GET/POST /canais` (`escopo=meus|diretorio|todos`, filtros `tipo`, `q`, `contextoTipo/contextoId`), `GET/PATCH /canais/:id`, `POST /canais/:id/entrar|sair|lido`, `PATCH /canais/:id/preferencias` (fixar/silenciar), `POST/DELETE /canais/:id/membros`, `PUT /canais/:id/contexto` |
| Mensagens | `GET/POST /canais/:id/mensagens` (paginação por `antes`, só fixadas com `fixadas=1`), `PATCH/DELETE /mensagens/:id`, `POST/DELETE /mensagens/:id/fixar`, `GET /anexos/:id/download`, `GET /busca?q=` |
| Apoio | `GET /meta`, `GET /resumo` (contador + pedidos), `GET /usuarios` (diretório sem e-mail), `GET /setores`, `GET /contexto/buscar?tipo=&q=`, `POST /bootstrap` |
| Resposta automática | `GET/PUT /canais/:id/auto`, `POST /canais/:id/auto/testar` (simula sem enviar), `GET/POST/DELETE /canais/:id/faq` |
| Pedidos de "falar com uma pessoa" | `GET /pedidos?status=`, `POST /pedidos/:id/assumir|resolver`, `POST /pedidos/lembretes/executar` |
| Atendimentos | `POST /canais/:id/encaminhar-atendimento` (chama `transferirAtendimento`, a mesma regra de `/atendimento/atendimentos/:id/transferir`) |
| LGPD | `GET/PUT /config`, `POST /retencao/executar`, `GET /exportar`, `GET /meus-dados/exportar`, `GET /auditoria` |

## Conversas e acesso
- **Departamento**: um canal por `AtdSetor` (criado sozinho, também para setores novos). Integrantes = `AtdSetorMembro` (acompanham o setor). Padrão **aberto**: qualquer pessoa da equipe vê, escreve (e passa a participar) e pode pedir ajuda ao departamento. `restrito=true` limita a participantes.
- **Grupo**: privado por padrão (só a gestão cria grupo aberto à equipe). **Direta**: uma por par de pessoas; nem a gestão superior lê conversa direta de terceiros (404).
- Perfis: usa a equipe interna (`ADMIN, OWNER, RECTOR, BOARD, COORDINATOR, TEACHER, FINANCE, SECRETARY, LIBRARIAN, FACILITIES, SUPPLIES, MARKETING, ADMISSIONS, SUPPORT, STAFF, LEGAL`); **aluno não acessa**. Gestão = `SUPPORT, SECRETARY` + super (cria canal de departamento, ajusta resposta automática, vê todos os pedidos). Configuração geral, retenção, exportação e auditoria: só `ADMIN, OWNER, RECTOR, BOARD`. Tudo filtrado por `tenantId`; canal de outro tenant ou privado responde 404.
- Menções: `@pessoa` (ids em `mencoesUsuarios`) e `@departamento` (`mencoesSetores` ou `@codigo` no texto). Em canal/grupo aberto a pessoa/departamento mencionado entra e é notificado; em conversa privada a menção é ignorada e a API informa (`mencoesIgnoradas`). Departamento não pode ser mencionado em conversa direta.
- Leitura: `MsgMembro.ultimaLeituraEm` por pessoa (não lidas e menções por conversa; "lida por N de M" nas próprias mensagens). Busca por texto nas conversas que a pessoa enxerga. Fixar mensagem (todos) e fixar conversa (só para quem fixou).
- **Anexos** (até 5, padrão 2 MB cada, configurável): passam pelo `uploadGuard` global (tipo real, malware, URL segura); a listagem nunca devolve o conteúdo; o download é autenticado, auditado e entregue com `attachment` e `nosniff`.

## Vínculo com o sistema
Uma conversa (ou uma mensagem) pode apontar para `PROTOCOLO`, `ATENDIMENTO`, `ALUNO`, `DOCUMENTO` ou `TITULO`. O registro é validado no tenant e só o **rótulo** e o **link interno** são guardados (nenhum CPF/contato/valor). Só perfis que já lidam com esses dados vinculam (`SUPPORT, SECRETARY, ADMISSIONS, FINANCE, COORDINATOR, STAFF, LEGAL` + super). Links: `/edu/atendimento?secao=protocolos|central|emissao&id=…` (as telas abrem o registro), `/edu/academico/alunos?id=…`, `/edu/financeiro?secao=receber&titulo=…` (nessas duas a tela ainda não abre o registro sozinha). Deep links do próprio Mensageiro: `/edu/mensagens?c=<conversa>`, `?u=<usuário>` (conversa direta), `?ctx=PROTOCOLO:<id>` (abre ou cria a conversa sobre o registro), `?aba=pedidos`.
**Encaminhar atendimento ao departamento**: `POST /canais/:id/encaminhar-atendimento` chama `transferirAtendimento` (extraída de `atendimento/atendimentos.ts`): muda setor, recalcula SLA, grava `AtdTransferencia` e auditoria da Central; depois posta a mensagem de encaminhamento (com link) no canal do departamento e notifica os integrantes. Nenhuma regra foi duplicada.

## Resposta automática por departamento (`MsgAuto`)
Só reage a quem **não é do departamento** (quem é do setor conversa normalmente). Por canal: liga/desliga, horário de atendimento (Brasília, dias da semana), mensagem de ausência, FAQ com **confiança mínima configurável** (30% a 98%), uso da base do departamento (`AtdConhecimento.setorId`) e/ou da FAQ geral (`ComFaq`), mensagem quando não souber. Fluxo: fora do horário → ausência (uma vez a cada 30 min por pessoa) + aviso e lembrete para a abertura; texto sensível (saúde, menores, biometria…) → **nunca analisado**, vai a uma pessoa; pediu uma pessoa ("quero falar com um atendente", "chama alguém"…) ou FAQ abaixo da confiança → abre `MsgPedidoHumano`, avisa o departamento (notificação + `scheduleReminder` + reaviso a cada `lembretePedidoMin`, até 5) e a tela dispara o **alerta**. O motor é local e determinístico (`melhorResposta` da Central); sem provedor de IA externo e sem credencial. O pedido sai de pendente quando alguém do departamento responde à mensagem (ou menciona o solicitante) ou clica em Assumir/Resolver; enquanto uma pessoa atende (1 h), a automação não interfere.
**Alerta sonoro/visual**: `frontend/src/edu/mensagens/resumo.ts` (mesma técnica de `AlertaHumano.tsx`): três toques por Web Audio, liga/desliga em `localStorage` (`edu.msg.alertaSonoro`), só toca depois do primeiro clique na página (regra dos navegadores) e só para pedidos **novos** (não toca ao abrir a tela). Faixa de aviso na tela e ícone do cabeçalho em vermelho.

## Tempo quase real e contador
Sem infraestrutura nova: **polling curto**. `GET /resumo` a cada 12 s (45 s com a aba oculta) alimenta o contador do cabeçalho (ícone de conversas, em todas as telas EduMaster da equipe) e o alerta; a conversa aberta consulta a cada 4 s; a lista, a cada 8 s. Quem não tem acesso (403) para de consultar. Alternativa documentada: SSE (`GET /stream` com `text/event-stream` emitindo `resumo`/`mensagem`) exige token fora da URL (cookie) e afinidade de instância atrás de proxy; não foi implementado para não depender de infra.

## LGPD e segurança
- **Notificações sem conteúdo**: só "você foi mencionado no canal X"/"nova conversa direta"; nome de conversa direta e texto nunca saem (`textoNotificacao`). Testado.
- **Retenção** configurável (`retencaoDias`, padrão 730; vazio = não apagar). `POST /retencao/executar` simula por padrão; apagar exige `confirmar:true`, mantém mensagens fixadas e remove anexos junto. Só gestão superior; auditado.
- **Exportação restrita**: só gestão superior, com justificativa (≥ 10 caracteres), apenas canais de departamento e grupos (conversa direta nunca), sem binários de anexo, auditada; desligável (`exportacaoAtiva`). O titular exporta as **próprias** mensagens em `/meus-dados/exportar` (art. 18).
- **Auditoria** (`EduAuditEvent`, módulo `mensagens`, sem texto de mensagem): criação/alteração de canal, membros, anexo enviado/baixado, fixar/desafixar, moderação/remoção, configuração da resposta automática, pedidos (abertos/assumidos/resolvidos), encaminhamento, exportação, retenção. Limite de 90 mensagens por minuto por pessoa.

## Como ver na demo
Seed: `import { seedMensagens } from './seeds/mensagens'` (ou `npx tsx scripts/seeds/mensagens.ts` com a API no ar, depois do seed da Central). Login `admin@suainstituicao.edu.br / Demo@2026` → **Mensageiro interno** (há um pedido de "falar com uma pessoa" pendente no Financeiro: faixa amarela + ícone vermelho no cabeçalho). Equipe (senha `Demo@2026`): `msg.secretaria@`, `msg.financeiro@`, `msg.juridico@`, `msg.reitoria@`, `msg.admissoes@`, `msg.coordenacao@` `suainstituicao.edu.br`. Para disparar o alerta ao vivo, entre como `msg.coordenacao@` em outra janela e escreva "quero falar com uma pessoa" no canal Financeiro (ou, como admin, escreva qualquer pergunta fora da FAQ).

## Limites honestos
Sem aplicativo nativo nem push do sistema operacional (o som e o contador exigem a aba aberta); sem criptografia ponta a ponta (os dados ficam no banco da instituição, protegidos por perfil e tenant); anexos em base64 no banco (até 2 MB; para volume alto use armazenamento de objetos); sem indicador de "digitando" nem presença online; edição só do próprio texto em 24 h; mensagens removidas deixam o registro "removida" (sem conteúdo); a resposta automática é por regras e FAQ (não conversa livre); links para Aluno e Título financeiro levam à tela, mas a tela de destino ainda não abre o registro sozinha.

## Testes
`DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/BANCO_LOCAL npx tsx scripts/e2e/mensagens.ts` (250+ verificações; usa só banco local).
