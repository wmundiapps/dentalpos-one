# Módulo `secretaria` (prefixo Sec)

Secretaria acadêmica: protocolo/requerimentos, documentos HTML, conferência documental (IA + fallback), certificados, diplomas/livros/colação, arquivo e temporalidade.
Montado em `/api/edu/secretaria` (autenticado) e `/api/public/edu/secretaria` (verificação pública).

## Modelos (27)
SecContador, SecTipoRequerimento, SecProtocolo, SecTramite, SecAnexo, SecChecklistModelo, SecChecklistItemModelo, SecConferencia, SecConferenciaItem,
SecDocumentoEmitido, SecCertModelo, SecCertLote, SecCertificado, SecLivro, SecAta, SecDiploma, SecColacao, SecColacaoFormando, SecTemporalidade, SecArquivoItem, SecDescarte.

Papéis: SEC = SECRETARY; GESTAO = SECRETARY+COORDINATOR; LEITURA = SECRETARY, COORDINATOR, STAFF, FINANCE, ADMISSIONS, SUPPORT, TEACHER (ADMIN/OWNER/RECTOR/BOARD sempre).

## Endpoints
- POST `/bootstrap` (GESTAO) — tipos, checklists, modelos de certificado, temporalidade e livros padrão (idempotente).
- Tipos: CRUD `/tipos` (R LEITURA, W GESTAO). Resumo: GET `/protocolos-resumo`.
- Protocolos: GET/POST `/protocolos` (R LEITURA / W SEC), GET `/protocolos/:id`, POST `/:id/status|atribuir|comentarios|anexos|taxa/isentar` (GESTAO; anexos SEC), GET `/:id/anexos/:anexoId`.
- Portal aluno (STUDENT): GET `/portal/tipos`, GET/POST `/portal/protocolos`, GET `/portal/protocolos/:id`, POST `/:id/anexos`, POST `/:id/cancelar`, POST `/portal/documentos/emitir`, GET `/portal/documentos[/:id/html]`, GET `/portal/certificados[/:id/html]`, GET `/portal/conferencias`, POST `/portal/conferencias/itens/:itemId/enviar`.
- Documentos: GET `/documentos/tipos`, POST `/documentos/preview|emitir` (SEC; `?formato=html`), GET `/documentos`, GET `/documentos/:id/html`, POST `/documentos/:id/cancelar` (GESTAO), GET `/alunos/:studentId/historico`.
- Checklists: CRUD `/checklists`, `/checklist-itens` (GESTAO). Conferência: POST/GET `/conferencias`, GET `/conferencias/:id`, PATCH `/conferencias/itens/:itemId`, POST `.../itens/:itemId/analisar` (IA ou heurística), POST `.../itens/:itemId/decidir`, POST `/conferencias/:id/solicitar-reenvio` (SEC).
- Certificados: CRUD `/cert-modelos` (+ GET `/:id/variaveis`, POST `/:id/preview`), POST `/certificados`, POST `/certificados/lote` (lista/turma/curso), GET `/certificados[/:id[/html]]`, POST `/certificados/:id/revogar|reemitir` (GESTAO).
- Livros/atas: CRUD `/livros` (+ POST `/:id/encerrar`, GET `/:id/termo`), CRUD `/atas` (+ GET `/:id/html`).
- Diplomas: GET/POST `/diplomas`, GET `/diplomas/:id`, POST `/:id/transitar` (SEC), POST `/:id/registrar` (GESTAO), POST `/:id/entregar` (SEC), GET `/:id/termo-registro`.
- Colação: CRUD `/colacoes`, GET/POST `/colacoes/:id/formandos`, POST `/:id/reavaliar`, PATCH `/:id/formandos/:formandoId`, POST `/:id/status|ata` (GESTAO), GET `/:id/lista`.
- Arquivo: CRUD `/temporalidade` (GESTAO), CRUD `/arquivo` (W SEC), GET `/arquivo-busca`, POST `/arquivo/:id/suspender|retomar`, POST `/arquivo-reclassificar`, `/descartes` (GET, POST SEC), POST `/descartes/:id/aprovar|rejeitar` (COORDINATOR, aprovador != solicitante), POST `/executar` (GESTAO), GET `/termo`.
- Situação do aluno: GET `/alunos` (busca), `/alunos/:studentId/situacao`, `/alunos/:studentId/situacao/html`.
- Público: GET `/verificar/:codigo[?hash=&formato=json]`, GET `/verificar/:codigo/pagina`.

## Jobs (`registerEduJob`)
`secretaria.protocolos` (escalonamento de SLA, cancelamento por falta de reenvio, sync de taxa), `secretaria.arquivo`, `secretaria.colacoes`, `secretaria.diplomas`.

## Exportado para outros módulos
`abrirProtocolo`, `mudarStatusProtocolo`, `sincronizarTaxa` (protocolos.ts); `emitirDocumento`, `renderDocumento`, `montarHistorico` (documentos.ts); `emitirCertificado`, `renderCertificadoHtml` (certificados.ts); `criarConferencia`, `recalcularConferencia`, `analisarComIa` (conferencia.ts); `avaliarFormando` (diplomas.ts); `registrarNoArquivo`, `reclassificarArquivo` (arquivo.ts); `situacaoDoAluno` (situacao.ts); `verificarCodigo` (verificacao.ts); funções puras em logic.ts. Selftest: `npx tsx src/modules/secretaria/__selftest__.ts`.

## Notas
- Histórico lê dinamicamente o model `Nt*` do módulo notas (NtResultado) via DMMF; sem ele, usa AssessmentAttempt/Attendance do núcleo.
- QR Code: gerado no navegador (qrcodejs via cdnjs); o código e a URL de verificação sempre aparecem impressos.
- Feriados: usa `calFeriado`/`calDiaNaoLetivo` se existirem; caso contrário só fins de semana.
