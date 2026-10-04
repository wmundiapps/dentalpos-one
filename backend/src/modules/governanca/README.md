# Módulo governanca (prefixo Gov)

PDI, documentos institucionais/PPC, CPA, NDE, colegiados, CIPA/SST e plano de carreira.
Schema: `prisma/edu/governanca.prisma`. Selftest: `npx tsx src/modules/governanca/__selftest__.ts`.

Papéis: leitura = COORDINATOR/TEACHER/SECRETARY/STAFF/FINANCE/FACILITIES; escrita = COORDINATOR/SECRETARY
(CIPA: FACILITIES/STAFF/SECRETARY; carreira: leitura SECRETARY/FINANCE, escrita SECRETARY). ADMIN/OWNER/RECTOR/BOARD sempre.
CRUD (mountCrud) = GET lista, GET /:id, POST, PUT/PATCH /:id, DELETE /:id.

## Modelos
GovSequencia; GovPdi, GovPdiEixo, GovPdiObjetivo, GovPdiMeta, GovPdiMedicao, GovPdiAcao; GovDocumento, GovDocumentoVersao;
GovCpa, GovCpaMembro, GovCpaCiclo, GovCpaQuestionario, GovCpaModeloQuestionario, GovCpaPergunta, GovCpaConvite, GovCpaResposta,
GovCpaRespostaItem, GovCpaRelatorio, GovCpaPlanoAcao; GovNde, GovNdeMembro, GovNdeReuniao; GovOrgao, GovOrgaoMembro, GovReuniao,
GovPauta, GovPautaModelo, GovDeliberacao, GovVotoRegistro; GovCipaGestao/Membro/Reuniao/Risco/Inspecao/Acidente/Sipat/PlanoAcao;
GovCarreiraPlano, GovCarreiraNivel, GovCarreiraEnquadramento, GovCarreiraProgressao.

## Endpoints (/api/edu/governanca)
- PDI (CRUD): /pdis, /pdi-eixos, /pdi-objetivos, /pdi-metas, /pdi-acoes. POST /pdis/:id/ativar|encerrar; GET /pdis/:id/execucao;
  GET /pdis/:id/relatorio[?format=html]; GET|POST /pdi-metas/:id/medicoes; DELETE /pdi-medicoes/:id; GET /pdi-coletas-pendentes.
- Documentos: CRUD /documentos; GET|POST /documentos/:id/versoes; GET|PATCH /documentos-versoes/:id; POST /documentos-versoes/:id/publicar|revogar;
  GET /documentos/:id/vigente[?data]; GET /documentos/:id/comparar?de&para; GET /ppc/:programId.
- CPA: CRUD /cpa/comissoes, /cpa/membros, /cpa/ciclos, /cpa/questionarios, /cpa/perguntas, /cpa/plano-acao; GET /cpa/comissoes/:id/composicao;
  POST /cpa/ciclos/:id/avancar; GET /cpa/modelos; POST /cpa/questionarios/from-modelo; POST /cpa/questionarios/:id/convites (tokens devolvidos 1x);
  GET /cpa/questionarios/:id/convites/resumo; GET /cpa/ciclos/:id/resultados; POST|GET /cpa/ciclos/:id/relatorios; GET /cpa/relatorios/:id/html;
  POST /cpa/ciclos/:id/plano/gerar.
  PÚBLICO (/api/public/edu/governanca): GET|POST /cpa/responder/:token (anônimo).
- NDE: CRUD /ndes, /nde-membros, /nde-reunioes; GET /ndes/:id/validacao; GET /ndes-conformidade.
- Colegiados: CRUD /orgaos, /orgao-membros, /reunioes, /pautas, /deliberacoes; GET /orgaos/:id/composicao; GET /pauta-modelos;
  POST /reunioes/:id/pautas/from-modelo|convocar|presenca|realizar|cancelar; GET /reunioes/:id/ata-html;
  POST /deliberacoes/:id/abrir-votacao|votos|apurar|arquivar; GET /deliberacoes/:id/votos|resolucao-html.
- CIPA: CRUD /cipa/gestoes, /cipa/membros, /cipa/reunioes, /cipa/riscos, /cipa/inspecoes, /cipa/acidentes, /cipa/sipat, /cipa/plano-acao;
  POST /cipa/gestoes/:id/ativar|encerrar; GET /cipa/gestoes/:id/situacao; POST /cipa/acidentes/:id/cat; GET /cipa/painel.
- Carreira: CRUD /carreira/planos, /carreira/niveis, /carreira/enquadramentos, /carreira/progressoes (POST cria com simulação obrigatória);
  GET /carreira/enquadramentos/:id/simulacao; GET /carreira/planos/:id/elegiveis; GET /carreira/progressoes/:id/transicoes;
  POST /carreira/progressoes/:id/transicao.
- POST /bootstrap (idempotente: modelos CPA por segmento, pautas-modelo, planos de carreira exemplo, PDI rascunho com eixos SINAES).

## Jobs (registerEduJob)
governanca.pdi, governanca.mandatos, governanca.cpa, governanca.nde, governanca.cipa, governanca.carreira.

## Funções exportadas p/ outros módulos
- `verificarNde(tenantId, ndeId)` (nde.ts); `validarNde(membros)` (ndeLogic.ts) — para o módulo regulatorio.
- `calcularPainelPdi(pdi)` (pdi.ts), `execucaoPdi`, `percentualMeta`, `semaforo` (pdiLogic.ts).
- `agregarCpa`, `conceitoIndice`, `carregarAgregado(tenantId, cicloId)` (cpa.ts) — resultados da CPA para o regulatorio/desempenho.
- `simularProgressao` (carreiraLogic.ts); `apurar`, `quorumNecessario` (colegiadoLogic.ts); `proximoNumero` (common.ts).
