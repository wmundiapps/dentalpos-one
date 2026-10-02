# Módulo regulatorio (prefixo Reg) — MEC/INEP

Montado em `/api/edu/regulatorio`. Papéis: leitura = COORDINATOR/SECRETARY/STAFF; escrita = COORDINATOR/SECRETARY
(ADMIN/OWNER/RECTOR/BOARD sempre). Itens de checklist: também FACILITIES/LIBRARIAN/FINANCE.

## Modelos
RegProcesso, RegProcessoHistorico, RegDiligencia, RegAto, RegChecklistModelo, RegChecklistModeloItem,
RegChecklist, RegChecklistItem, RegIndicador, RegSimulacao, RegAnaliseDocumento.

## Endpoints
- `POST /bootstrap` — modelos de checklist (credenciamento, autorização, reconhecimento, renovação, aditamentos, mantença) + indicadores institucionais. Idempotente.
- `GET /painel`, `GET /alertas`, `GET /relatorios/situacao.html` (HTML com logomarca)
- Processos: CRUD `/processos` (filtros tipo/etapa/resultado/programId); `GET /processos/:id/detalhe`; `POST /processos/:id/avancar` (máquina de estados; protocolo e-MEC obrigatório; checklist obrigatório; publicação DEFERIDO pode registrar o ato)
- Diligências: `POST /processos/:id/diligencias`, `GET /diligencias`, `POST /diligencias/:id/{responder|cumprir|cancelar}`
- Atos: CRUD `/atos`; `GET /atos/situacao`; `POST /atos/reavaliar`; `POST /atos/:id/reavaliar`; `GET /atos/:id/alertas`
- Janela de reconhecimento: `POST /janela-reconhecimento`; `GET /cursos/:programId/janela-reconhecimento`
- Checklists: CRUD `/checklist-modelos` (+`POST /checklist-modelos/:id/itens`, `DELETE .../itens/:itemId`); `POST/GET /checklists`, `GET/PATCH/DELETE /checklists/:id`; `PATCH /checklists/itens/:itemId`; `POST /checklists/itens/:itemId/evidencias`; `POST /checklists/itens/:itemId/conferir` (IA com fallback heurístico)
- Autoavaliação: CRUD `/indicadores`; `GET /indicadores/resumo`; `POST /indicadores/gerar`
- Simulador (SIMULAÇÃO, sem valor oficial): `GET /simulador/parametros`, `POST /simulador/cpc`, `POST /simulador/cc`, `GET /simulador/cc-autoavaliacao`, `GET/DELETE /simulacoes`
- IA documentos: `POST /analise-documentos`, `POST /analise-documentos/:id/criar-tarefas`, `GET /analise-documentos[/:id]`

## Jobs
`regulatorio:reavaliar-atos` — reavalia atos com vencimento (lembretes D-180/90/60/30/15/7 p/ RECTOR e COORDINATOR),
sugere abertura de renovação, marca diligências vencidas e reforça prazos de protocolo.

## Exportado para outros módulos
- `rules.ts`: `statusAto`, `marcosAlerta`, `janelaReconhecimento`, `simularCPC`, `simularCC`, `prontidao`, `classificarRisco`, `transicaoValida`, `analisarDocumentoHeuristico`
- `alertas.ts`: `reavaliarAto`, `reavaliarTodos`, `sincronizarAlertasAto`
- `painel.ts`: `montarPainel(tenantId)`

Teste das regras: `npx tsx src/modules/regulatorio/__selftest__.ts`.
Parâmetros legais/pesos/faixas (CPC/CC, janela 50–75%, ciclo trienal) são padrões a CONFERIR com a norma vigente.
