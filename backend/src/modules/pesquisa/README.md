# Módulo `pesquisa` (prefixo Pes)

Produção científica, grupos, projetos/bolsas/editais, TCC-dissertação-tese, periódico institucional (estilo OJS) e eventos científicos.
Autenticado em `/api/edu/pesquisa`; público em `/api/public/edu/pesquisa/:tenantId/...`. Schema: `prisma/edu/pesquisa.prisma` (33 models, 15 enums).
Papéis: ADMIN/OWNER/RECTOR/BOARD sempre; `COORD` = COORDINATOR, `DOC` = COORDINATOR+TEACHER, `LEIT` = DOC+LIBRARIAN+SECRETARY+STAFF.

## Arquivos
`lib.ts` (funções puras, testadas em `__selftest__.ts`), `ata.ts` (ata HTML com `brandHeaderHtml`), `common.ts`, `publicacoes.ts`, `projetos.ts`, `editais.ts`, `tcc.ts`, `periodico.ts`, `eventos.ts`, `public.ts`, `routes.ts`.

## Endpoints (autenticados)
- `POST /bootstrap` (COORD) cria edital modelo PIBIC, periódico modelo (inativo) e evento modelo. `GET /catalogos`.
- Publicações: `GET/POST /publicacoes`, `GET/PUT/PATCH/DELETE /publicacoes/:id` (DOC; delete COORD), `POST /publicacoes/importar` (BibTeX/JSON, dryRun), `GET /indicadores/producao`, `/indicadores/docente/:userId`, `/indicadores/curso/:programId`.
- Grupos (CRUD): `/grupos`, `/grupos-linhas`, `/grupos-membros` (escrita COORD), `POST /grupos-membros/:id/desligar`, `GET /grupos/:id/painel`.
- Projetos: `GET/POST /projetos`, `GET/PUT/PATCH /projetos/:id`, `POST /projetos/:id/transicao`, `GET /projetos/:id/painel`, `GET /projetos/:id/orcamento`, `POST /projetos/:id/lancamentos`; CRUD `/projetos-membros`, `/projetos-etapas`, `/projetos-rubricas`, `/projetos-entregaveis`, `/projetos-relatorios`; `POST /projetos-membros/:id/desligar`, `POST /projetos-entregaveis/:id/entregar`, `POST /projetos-relatorios/:id/entregar|avaliar`.
- Bolsas: `GET/POST /bolsas`, `GET /minhas-bolsas` (STUDENT), `POST /bolsas/:id/status`, `POST /bolsas/:id/pagamentos/:competencia/liberar` (COORD/FINANCE).
- Editais: `GET/POST/PUT/PATCH/DELETE /editais`, `POST /editais/:id/transicao` (publicar resultado classifica e notifica), `GET/POST /inscricoes`, `POST /inscricoes/:id/homologar|avaliadores|implantar`, `GET /minhas-avaliacoes`, `POST /avaliacoes/:id/concluir`.
- TCC/pós: `GET/POST /trabalhos`, `GET/PATCH /trabalhos/:id`, `POST /trabalhos/:id/transicao|banca|versoes|similaridade|resultado|depositar|orientacoes`, `DELETE /trabalhos/:id/banca/:membroId`, `POST /banca/:membroId/convite`, `GET /trabalhos/:id/ata?fase=` (HTML), `GET /trabalhos-painel`.
- Periódico: CRUD `/periodicos`, `/periodicos-equipe`, `/secoes`, `/edicoes`; `POST /edicoes/:id/publicar`; `GET/POST /submissoes`, `GET /submissoes/:id` (visão por papel: editor/autor/parecerista duplo-cego), `POST /submissoes/:id/triagem|revisores|decisao|revisao-autor|retirar|editoracao|versoes`, `GET /submissoes/:id/sugestao-revisores|revisoes`, `POST /revisoes/:id/cancelar|responder|parecer`, `GET /minhas-revisoes`, `GET /periodicos/:id/estatisticas`.
- Eventos: `GET/POST/PUT/PATCH /eventos`, `GET /eventos/:id`, `POST /eventos/:id/transicao|distribuir-avaliacoes|fechar-avaliacao|anais/gerar`, `GET /eventos/:id/anais`, `GET/POST /eventos-trabalhos`, `GET /eventos-trabalhos/:id`, `POST /eventos-trabalhos/:id/retirar|camera-ready`, `GET /minhas-avaliacoes-evento`, `POST /eventos-avaliacoes/:id/concluir`.

## Endpoints públicos (`publicRouter`)
`GET /:tenantId/periodicos`, `/periodicos/:slug`, `/periodicos/:slug/edicoes`, `/periodicos/:slug/edicoes/:edicaoId`, `/artigos`, `/artigos/:id`, `/artigos/:id/metadados` (JSON-LD/Dublin Core), `/artigos/:id/citacao`, `/eventos`, `/eventos/:slug/anais`; parecerista por token: `GET /:tenantId/revisao/:token`, `POST .../responder`, `POST .../parecer`. Nunca expõem pareceristas, pareceres nem e-mails.

## Jobs (`registerEduJob`)
`pesquisa:projetos-atrasos`, `pesquisa:editais`, `pesquisa:trabalhos-prazos`, `pesquisa:periodico-prazos`, `pesquisa:eventos-prazos`.

## Exportado para outros módulos
- `lib.ts`: `indicadoresProducao`, `pontuacaoPublicacao`, `parseBibtex`, `validarOrcid/Issn`, `normalizarDoi`, `similaridadeTexto`, `calcularResultadoBanca`, `estatisticasPeriodico`.
- `periodico.ts`: `ehEditor`. `projetos.ts`: `criarBolsa`, `mudarStatusBolsa`, `pendenciasProjeto`. `ata.ts`: `ataDefesaHtml`.
- Dados para regulatório/carreira: `GET /indicadores/producao|docente|curso` ou `prisma.pesPublicacao` (autores com `userId` docente).
