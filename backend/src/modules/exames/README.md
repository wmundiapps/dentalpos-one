# Módulo Exames — ENADE · ENAMED · OAB (preparatório com apoio de IA)

Montado em `/api/edu/exames`. Telas em `frontend/src/edu/exames` (rota `/edu/exames`, menu "ENADE · ENAMED · OAB", atalho de destaque na tela inicial do EduMaster e aba no Portal do Aluno).

## O que é e como se encaixa no que já existia

O módulo **desempenho** (`/api/edu/desempenho`) já cobre cadastro de exames/eixos, edições, inscrições (obrigados ao ENADE), banco de questões, simulados de turma com janela fixa, atividades e trilhas personalizadas. O módulo **exames** **não duplica** nada disso: reutiliza `DesExame`, `DesEixo`, `DesQuestao`, `DesEdicao` e `DesInscricao` e acrescenta:

| Necessidade | Onde está |
| --- | --- |
| Matriz de referência / descritores por exame, eixo e curso | `ExaDescritor` (`/descritores`) |
| Perfil de prova (temas recorrentes por ano, estilo, nível) e recorrência consolidada | `ExaPerfil` (`/perfis`, `/recorrencia`) |
| Classificação da questão por tema/descritor, explicação de cada alternativa, origem (manual/IA) e revisão docente | `ExaQuestaoMeta` (sidecar de `DesQuestao`) |
| Gerador de questões originais inspiradas no padrão (IA, com modo simulado sem chave) | `POST /gerar` |
| Sugestões de temas (recorrência × lacuna do aluno) | `GET /sugestoes` |
| Simulados prontos/personalizados, **com repetição**, tempo e correção automática | `ExaSimulado` / `ExaSessao` (`/simulados`, `/sessoes`, `/treino`) |
| Gabarito e respostas comentadas por alternativa; relatório por eixo/tema/descritor; evolução | `GET /sessoes/:id/resultado`, `GET /meu-desempenho` |
| Trilhas por curso/área e por fase (OAB 1ª fase por disciplina, 2ª fase por área) | `ExaTrilha` (`/trilhas`, `/trilhas/gerar`) |
| Flashcards com repetição espaçada (SM-2) gerados dos erros/temas fracos | `ExaFlashcard` (`/flashcards`) |
| Ranking opcional por turma/curso (consentimento do aluno) | `ExaPreferencia`, `GET /ranking` |
| Painel do coordenador: prontidão, alunos em risco, obrigados, calendário, lembretes | `/coordenacao/*` |
| Gancho para a reitoria/regulatório | indicador `prontidao_exames` (`reitoria/indicators.ts`) e `prontidaoEnade()` |

Os simulados formais de turma (com janela de abertura/fechamento) continuam em **Desempenho → Simulados**; o aluno pode treinar quantas vezes quiser aqui.

## Honestidade sobre as questões (leia antes de divulgar)

- **Todas as questões do seed são autorais**, redigidas para a demonstração. Nenhuma é cópia ou paráfrase de prova real.
- Os **perfis de prova do seed são ILUSTRATIVOS**: sínteses autorais de matrizes/editais públicos, **não estatísticas oficiais**. A instituição deve cadastrar o levantamento real (a UI exige informar a fonte do perfil).
- O gerador usa o perfil apenas como orientação de tema, estilo e nível e **instrui a IA a não reproduzir provas reais**. A IA pode errar: por isso as questões geradas entram como **rascunho** e a **revisão docente é obrigatória por padrão** (configurável em `ExaConfig.revisaoDocenteObrigatoria`; desligada, a questão fica visível ao aluno marcada como "não revisada").
- Sem chave de IA (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`) o gerador entra em **modo simulado**: cria variações (alternativas reembaralhadas) de questões autorais do mesmo eixo e avisa isso na resposta. Trilhas e roteiros de estudo também têm fallback sem IA.
- Recorrência histórica **não é previsão**; a IA **não garante o conteúdo da prova real**. Esse aviso aparece na visão geral, nas listas e nos resultados.
- O índice de prontidão e as projeções de conceito/aprovação são **estimativas internas** (o conceito ENADE oficial depende da distribuição nacional).

## Permissões (por perfil)

ADMIN/OWNER/RECTOR/BOARD passam sempre. `COORDINATOR` = gestão (configura, aprova, envia lembretes). `TEACHER` = docente (cria/revisa questões, gera, monta simulados, vê painéis; **não revisa a própria questão**). `STUDENT` = só enxerga e altera o **próprio** desempenho, cartões, trilhas e preferências. Demais perfis de apoio (secretaria, equipe) só leem a visão geral/simulados; financeiro não acessa. Todas as consultas filtram por `tenantId`; sessões, cartões e exportações são sempre do aluno logado.

## LGPD

- Finalidade: preparação pedagógica; base legal: execução do contrato educacional / interesse legítimo (descrito em `GET /meus-dados`).
- Minimização: guardam-se respostas, notas e preferências; sem dados sensíveis. Gabarito nunca é enviado durante a prova.
- Docentes/coordenação consultando um aluno individual geram **log de auditoria** (`VER_DESEMPENHO_ALUNO`, `VER_RESULTADO_ALUNO`, `LISTAR_ALUNOS_PREPARACAO`).
- **Ranking é opcional e desligado por padrão**; o aluno precisa consentir (`PUT /preferencias`) e só vê colegas que também consentiram, com nome abreviado, sem RA.
- O aluno pode exportar (`GET /meus-dados`) e apagar (`DELETE /meus-dados`) seus dados de preparação.

## Endpoints principais

- Visão/config: `GET /visao`, `POST /bootstrap` (G), `GET|PUT /config` (G)
- Matriz e padrões: `GET|POST|PATCH|DELETE /descritores`, `GET /descritores/:id/estudo[?ia=1]`, `GET|POST|PATCH|DELETE /perfis`, `GET /recorrencia?exameId=`, `GET /sugestoes?exameId=`
- Banco (D): `GET|POST|PATCH /questoes`, `POST /questoes/:id/revisao` (APROVADA/REJEITADA), `POST /questoes/:id/arquivar` (G), `POST /gerar`, `GET /discursivas`, `GET /questoes/:id/espelho`
- Simulados: `POST /simulados` (D; manual ou `auto`), `GET /simulados`, `GET /simulados/:id` (D), `POST /simulados/:id/publicar|arquivar`; aluno: `POST /simulados/:id/iniciar`, `PUT /sessoes/:id/respostas`, `POST /sessoes/:id/enviar`, `GET /sessoes/:id`, `GET /sessoes/:id/resultado`, `GET /minhas-sessoes`, `POST /treino` (sugerido | tema | erradas)
- Desempenho: `GET /meu-desempenho`, `GET /alunos/:studentId/desempenho` (D), `GET /ranking`, `GET|PUT /preferencias`
- Trilhas: `GET /trilhas`, `GET /trilhas/:id`, `POST /trilhas` (D), `POST /trilhas/gerar` (D), `PATCH /trilhas/:id`, `POST|DELETE /trilhas/:id/etapas/:ordem/concluir`
- Flashcards: `GET /flashcards`, `GET /flashcards/hoje`, `POST /flashcards`, `POST /flashcards/gerar`, `GET|POST /flashcards/modelos`, `POST /flashcards/adotar`, `POST /flashcards/:id/revisar`, `DELETE /flashcards/:id`
- Coordenação: `GET /coordenacao/painel?programId=&exameId=`, `GET /coordenacao/alunos`, `GET /coordenacao/obrigados?edicaoId=`, `POST /coordenacao/lembretes` (G), `GET /coordenacao/cursos` (G)
- LGPD: `GET|DELETE /meus-dados`

## Dados, seed e testes

- Schema: `backend/prisma/edu/exames.prisma` (prefixo `Exa`); SQL manual no bloco `EXAMES:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql`.
- Seed: `backend/scripts/seeds/exames.ts` (`seedExames(api, ctx)`), dados em `exames-banco.ts`: 66 questões objetivas + 2 discursivas (ENADE formação geral, Direito, Odontologia, Enfermagem, Administração, Pedagogia, ENAMED e OAB), todas comentadas por alternativa; 47 descritores; 7 perfis ilustrativos; 8 simulados; 9 trilhas; 26 cartões-modelo; sessões de demonstração (requer `ctx.tenantId`). Idempotente. Cursos da demonstração são localizados pelo nome (Direito, Odontologia, Enfermagem, Administração, Pedagogia, Medicina).
- E2E: `DATABASE_URL=<postgres local> npx tsx scripts/e2e/exames.ts` (246 verificações).
- Checagem de tipos: `bash scripts/edu-check.sh exames`.

## Limites conhecidos

- Correção automática só de questões objetivas; discursivas (OAB 2ª fase) têm espelho para **autocorreção** do aluno, sem nota automática.
- Cadastro de questões em lote (importação) deve usar o módulo desempenho e depois classificar aqui.
- Lembretes são notificações no app (provedor simulado para e-mail/WhatsApp, via módulo de comunicação).
