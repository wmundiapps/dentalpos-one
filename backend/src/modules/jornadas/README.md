# Módulo jornadas (prefixo Jor)

Fluxogramas de jornadas por persona (grafo versionado) + motor de instâncias com lembretes ("nada cai no esquecimento").

## Modelos
JorTemplate, JorNo, JorTransicao (grafo versionado por chave+versão), JorInstancia (pessoa tipo+id), JorEtapa (nó visitado), JorHistorico.

## Arquivos
`engine.ts` (funções puras: validação, condições, roteamento, checklist, prazos, escalonamento, analytics) · `layout.ts` (layout em camadas + Mermaid) · `templates.ts` (8 templates padrão) · `service.ts` (regras com banco + job) · `routes.ts` · `exportMermaid.ts` · `__selftest__.ts`.

## Endpoints (/api/edu/jornadas)
- POST /bootstrap (ADMIN) — cria os 8 templates padrão publicados (idempotente)
- GET /templates, GET /templates/:id (todos) · POST /templates, PUT /templates/:id (só rascunho), DELETE /templates/:id, POST /templates/:id/publicar|arquivar|nova-versao (ADMIN) · POST /templates/:id/validar (ADMIN, COORDINATOR)
- GET /templates/:id/mermaid[?direcao=LR&formato=json], GET /templates/:id/diagrama[?direcao=LR|TB] (todos)
- POST /instancias (OPERACAO) · GET /instancias (gestão) · GET /instancias/:id, /:id/historico, /:id/diagrama (todos; aluno só a sua)
- POST /instancias/:id/etapas/:etapaId/avancar | checklist (papel da etapa/responsável/admin) · /atraso (operação, professor) · /pular (COORDINATOR+, justificativa) · /reatribuir (gestão)
- POST /instancias/:id/cancelar | pausar | retomar (gestão)
- POST /eventos (operação) — dispara evento que destrava etapas ESPERA_EVENTO
- GET /pendencias?personType&personId · GET /minhas-pendencias
- GET /painel/resumo | onde-estao | funil?templateId | gargalos | atrasos-responsavel (gestão) · POST /processar-atrasos (ADMIN)

Gestão = COORDINATOR, SECRETARY, ADMISSIONS, FINANCE (+ admin/reitoria). Sem rotas públicas.

## Jobs
`jornadas.atrasos` — marca etapas vencidas como ATRASADA, escalona (nível 1 ao vencer para `escalarPara`; nível 2 após `escalarAposDias` para `escalarPara2`) via lembrete CRITICO + histórico.

## Lembretes
Cada etapa com SLA cria `scheduleReminder` (refType `JorEtapa`, dedupeKey `jor:etapa:<id>`), concluído ao avançar/pular/cancelar.

## Exportadas (import de './jornadas/routes' ou './jornadas/service')
`iniciarJornada(tenantId,{personType,personId,templateKey,...})`, `avancarEtapa(tenantId,{etapaId|instanciaId+noChave,...})`, `listarPendenciasDaPessoa(tenantId,personType,personId)`, `dispararEvento(tenantId,{evento,personType,personId})`, `pularEtapa`, `registrarAtraso`, `cancelarInstancia`, `processarAtrasos`.

## Documentação
`npx tsx src/modules/jornadas/exportMermaid.ts` gera `docs/EDUMASTER-JORNADAS.md`.
