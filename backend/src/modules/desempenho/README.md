# Módulo desempenho (prefixo Des) — ENADE, OAB, ENAMED/Residência

Montado em `/api/edu/desempenho`. Papéis: G = ADMIN/OWNER/RECTOR/BOARD (sempre) + COORDINATOR; D = G + TEACHER; A = STUDENT.

## Modelos (Prisma `prisma/edu/desempenho.prisma`)
DesExame, DesEixo, DesEdicao, DesInscricao, DesMetaCurso, DesQuestao, DesSimulado, DesSimuladoQuestao, DesSimuladoAlvo,
DesTentativa, DesResposta, DesKit, DesAtribuicao, DesEntrega, DesTrilha, DesTrilhaItem.

## Endpoints
- Exames: `POST /bootstrap` (G) · CRUD `/exames`, `/eixos`, `/edicoes`, `/metas` (leitura D, escrita G) · `GET /exames/:id/matriz`
- Inscrições: `GET /edicoes/:id/inscricoes|pendencias|resumo` (D) · `POST /edicoes/:id/gerar-inscritos|inscricoes|inscricoes/lote|notificar-pendentes` (G) · `PATCH /inscricoes/:id` (G)
- Questões (D): `GET /questoes`, `/questoes/:id`, `/questoes/qualidade` · `POST /questoes`, `/questoes/gerar-ia`, `/questoes/:id/revisar` · `PATCH /questoes/:id` · G: `POST /questoes/importar|:id/publicar|:id/arquivar|recalcular-estatisticas`, `DELETE /questoes/:id`
- Simulados (D): `POST /simulados/montar`, `GET /simulados`, `/simulados/:id`, `/simulados/:id/resultados`, `PATCH /simulados/:id`, `POST|DELETE /simulados/:id/questoes`, `PUT /simulados/:id/alvos`, `POST /simulados/:id/publicar|encerrar` · aluno (A): `GET /simulados/meus`, `POST /simulados/:id/iniciar`, `PUT /tentativas/:id/respostas`, `POST /tentativas/:id/enviar` · `GET /tentativas/:id/resultado` (A/D) · `GET /alunos/:studentId/evolucao` (A/D)
- Atividades (D): `/kits` (GET, POST, GET/PATCH/DELETE :id, `:id/compartilhar`, `:id/duplicar`, `POST /kits/gerar-ia`) · `POST|GET /atribuicoes`, `GET /atribuicoes/:id/acompanhamento`, `POST /atribuicoes/:id/encerrar|cancelar` · `PATCH /entregas/:id/corrigir` · `GET /sugestoes/turma/:classSectionId?exameId=` · aluno: `GET /minhas-atividades`, `GET /entregas/:id`, `POST /entregas/:id/entregar`
- Trilhas (A/D): `POST|GET /trilhas`, `GET|PATCH /trilhas/:id`, `POST /trilhas/:id/regenerar`, `GET /trilhas/:id/progresso`, `POST /trilhas/itens/:id/concluir|adiar`
- Painel (D): `GET /painel/curso/:programId`, `/painel/turma/:id`, `/painel/aluno/:studentId` (A próprio), `/painel/mapa-calor`, `/painel/evolucao`, `/painel/risco`, `/painel/disciplinas-impacto` · `POST /painel/alertas/disparar` (G)
- Relatório: `GET /relatorios/regulatorio?exameId=&programId=` (HTML com cabeçalho/logomarca)

## Jobs (registerEduJob)
desempenho.simulados · desempenho.edicoes · desempenho.estatisticas · desempenho.alertas · desempenho.trilhas · desempenho.atividades

## Exportado para outros módulos (`routes.ts`)
priorizarLacunas, estimarConceitoEnade, projecaoOAB, montarSimulado, corrigir, gerarPlanoSemanal, analisarGrupo, rankingRisco, desempenhoEixos, lacunasGrupo, ultimasTentativas, aplicarCatalogo.

## Observações
Projeções de conceito ENADE/aprovação são ESTIMATIVAS internas. Questões de IA entram como RASCUNHO. Selftest: `npx tsx src/modules/desempenho/__selftest__.ts`.
