# Admissões (prefixo Adm)

Captação, vestibular, matrícula e rematrícula. Autenticado em `/api/edu/admissoes`, público em `/api/public/edu/admissoes` (tenant via `?tenant=` ou header `x-tenant-id`).

## Modelos
AdmProcessoSeletivo, AdmOferta, AdmCampanha, AdmCampanhaGasto, AdmCandidato, AdmInteracao, AdmResultadoProva, AdmChamada, AdmConvocacao, AdmDocumentoTipo, AdmDocumentoCandidato, AdmMatricula, AdmBolsa, AdmBolsaConcessao, AdmRematriculaCampanha, AdmRematricula.

## Endpoints (papéis; ADMIN/OWNER/RECTOR/BOARD sempre)
- POST /bootstrap (ADMISSIONS, COORDINATOR): checklist de documentos e bolsas padrão (idempotente)
- CRUD /processos, /ofertas (GESTAO: ADMISSIONS, COORDINATOR, SECRETARY; leitura + MARKETING, FINANCE)
- POST /processos/:id/{abrir,encerrar,cancelar,finalizar}; GET /processos/:id/ocupacao
- POST /processos/:id/classificar[?simular=true]; GET /processos/:id/classificacao
- POST /processos/:id/notas-lote; POST|GET /candidatos/:id/notas
- GET|POST /processos/:id/chamadas; POST /chamadas/:id/encerrar; POST /convocacoes/:id/renunciar
- CRUD /campanhas, /campanhas-gastos (ADMISSIONS, MARKETING, COORDINATOR, SECRETARY); GET /campanhas/:id/metricas; GET /marketing/por-canal
- GET|POST /candidatos, GET|PATCH /candidatos/:id, POST /candidatos/:id/{status,gerar-cobranca,isentar-taxa,interacoes,follow-up,bolsa}, GET /candidatos/:id/interacoes, GET /follow-ups, POST /leads/importar, GET /funil
- CRUD /documentos-tipos; GET /candidatos/:id/documentos; POST /candidatos/:id/documentos/:codigo/{enviar,revisar}
- GET /matriculas, GET /matriculas/:id[/contrato], POST /matriculas/iniciar, /matriculas/:id/{aceitar-contrato,efetivar,cancelar,lembrar-documentos}
- CRUD /bolsas (ADMISSIONS, FINANCE, COORDINATOR); POST /bolsas/simular; GET /bolsas/:id/concessoes
- CRUD /rematricula/campanhas; POST /rematricula/campanhas/:id/{gerar-lista,abrir,encerrar}; GET .../itens, .../relatorio; POST /rematricula/itens/:id/{recalcular,confirmar,nao-renovou}; STUDENT: GET /rematricula/minhas, POST /rematricula/minhas/:id/confirmar
- GET /relatorios/{funil,vagas,campanhas,painel}

Públicos: GET /processos, POST /inscricoes, POST /leads, GET|POST /consulta (protocolo+CPF).

## Jobs
`admissoes.manutencao`: encerra processos vencidos, expira convocações, sincroniza taxas pagas, lembretes de leads parados/matrículas paradas/orçamento de campanha, reavalia e lembra rematrícula (D-30/15/7/1), encerra janelas.

## Exportado para outros módulos
logic.ts (puras): validarCpf, classificar, proximaChamada, calcularFunil, calcularMetricasCampanha, aplicarBeneficios, avaliarRematricula, calcularRetencao. services.ts: mudarStatusCandidato, gerarCobrancaInscricao, montarCobrancaInscricao, iniciarMatricula, efetivarMatricula, expirarConvocacoes. rematricula.ts: avaliarAluno, confirmarRematricula. Selftest: `npx tsx src/modules/admissoes/__selftest__.ts`.

Obs.: a taxa de inscrição usa `AccountReceivable.studentId = "ADM:<candidatoId>"` até a matrícula, quando é reatribuída ao aluno.
