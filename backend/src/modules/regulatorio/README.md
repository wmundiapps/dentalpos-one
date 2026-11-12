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

---

# Comissão de avaliação do MEC e "instituição nota máxima" (`/api/edu/regulatorio/mec/*`)

> **DADOS FICTÍCIOS DE DEMONSTRAÇÃO.** Tudo o que o seed `backend/scripts/seeds/mec-comissao.ts` cria (conceitos CI/IGC/CPC/CC/ENADE/IDD,
> protocolos e-MEC, comissão avaliadora, egressos, docentes) é inventado e marcado `ficticio` na API e na UI. Não é resultado oficial do MEC/INEP.

Aba **"Comissão de avaliação do MEC"** (2ª aba do Regulatório; também no menu da Reitoria: `/edu/regulatorio?aba=comissao`) e aba **"Excelência MEC"**.
Papéis: leitura = COORDINATOR/SECRETARY/STAFF; escrita = COORDINATOR/SECRETARY (ADMIN/OWNER/RECTOR/BOARD sempre); responsáveis por evidências
(+FACILITIES/LIBRARIAN/FINANCE) usam `POST /mec/evidencias/:id/atualizar` (só situação, documento e observação).

## Modelos (`prisma/edu/regulatorio-mec.prisma`, migration bloco `MEC:BEGIN/END`)
`RegMecFase` (7 fases: protocolo, análise documental, designação da comissão, visita in loco, relatório, conceito, despacho/portaria),
`RegMecMembro` (comissão avaliadora), `RegMecVisita` + `RegMecRoteiro` (roteiro por dimensão INEP), `RegMecEvidencia` (kit da visita: indicador, documento,
responsável, prazo, conceito estimado 1–5), `RegMecConceito` (CI, IGC, CPC, CC, ENADE, IDD por instituição/curso/ano). Aplica-se a processos de tipo
AUTORIZACAO_CURSO, RECONHECIMENTO_CURSO, RENOVACAO_RECONHECIMENTO, CREDENCIAMENTO e RECREDENCIAMENTO (demais tipos: 409).

## Endpoints
- `GET /mec/catalogo`, `GET /mec/painel` (processos, fases, prazos críticos, kit, conceito simulado), `GET /mec/processos/:id` (detalhe completo)
- `POST /mec/processos/:id/iniciar` (cria fases + 18 evidências padrão; idempotente), `PATCH /mec/fases/:id`
- Comissão: `GET|POST /mec/processos/:id/membros`, `PATCH|DELETE /mec/membros/:id` (um único coordenador)
- Visita: `POST /mec/processos/:id/visita` (agenda/reagenda), `PATCH /mec/visitas/:id` (REALIZADA conclui a fase), `POST /mec/visitas/:id/roteiro/gerar` (`refazer`), CRUD de itens `/mec/visitas/:id/roteiro`, `/mec/roteiro/:id`
- Evidências: `GET|POST /mec/processos/:id/evidencias`, `POST .../evidencias/gerar`, `PATCH|DELETE /mec/evidencias/:id` (ATENDIDO exige documento)
- Simulação: `GET|POST /mec/processos/:id/simulacao` (média por dimensão × pesos 40/30/30; corpo opcional faz "e se"). **Simulação sem valor oficial.**
- Kit: `GET /mec/processos/:id/kit` (por dimensão/indicador) e `/kit.html` (imprimível, com logomarca)
- Avisos: `POST /mec/avisos/processar`, `GET /mec/avisos`. Job diário `regulatorio:mec-avisos`; também disparado ao agendar visita, mudar fase ou evidência.
  Prazo vencido ou a ≤ 15 dias → lembrete CRITICO/ATENCAO para **RECTOR e BOARD** (reitoria e diretoria); evidências viram um aviso agregado por processo.
- Conceitos: `GET|POST /mec/conceitos` (upsert por tipo/curso/ano; faixa derivada do contínuo; CI e CC exigem faixa), `DELETE /mec/conceitos/:id`
- `GET /mec/excelencia`: placar único (CI, IGC, CPC/CC/ENADE/IDD por curso, PDI, CPA, autoavaliação, egressos, titulação/regime docente, infraestrutura, exames, posição no comparativo)

## Integrações
Painel da reitoria ganhou os indicadores `conceitos_mec` (faixa mínima entre CI/IGC/cursos) e `titulacao_docente` (% mestres/doutores).
`excelencia` lê PDI/CPA/egressos/infra/comparativo dos módulos donos dos dados (nada é copiado).

## Seed e testes
- `seedMecComissao(api, ctx)` — idempotente, só via API. Rodar **depois** de academico, regulatorio, governanca, reitoria2 (comparativo), apoio e infraestrutura do seed principal;
  `ctx.mk` (opcional) cadastra 10 docentes fictícios. O seed também **ajusta** o que os outros seeds criaram para a IES de demonstração aparecer no máximo: atos renovados e com conceito 5,
  diligências cumpridas, checklists/autoavaliação concluídos, PDI com metas atingidas, NDE titulado, requisitos de infraestrutura calibrados ao que a demo possui, CPA concluída.
- E2E: `DATABASE_URL=... npx tsx scripts/e2e/mec-comissao.ts` (200+ verificações; cria um mini-baseline, roda o seed duas vezes e confere os painéis).
- Parâmetros (pesos 40/30/30, faixas, prazo de aviso de 15 dias, catálogo de evidências) são padrões de acompanhamento: **conferir com o instrumento INEP e a norma vigentes**.
