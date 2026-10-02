# Módulo biblioteca (prefixo Bib)

Acervo físico, circulação, inventário, adequação à matriz curricular, biblioteca virtual e repositório institucional.
Montado em `/api/edu/biblioteca` (autenticado) e `/api/public/edu/biblioteca/:tenantId/*` (público).

## Models (schema `prisma/edu/biblioteca.prisma`)
BibConfig, BibPolitica, BibObra, BibExemplar, BibLeitor, BibEmprestimo, BibReserva, BibMulta, BibInventario,
BibInventarioItem, BibBibliografia, BibSugestaoAquisicao, BibRecursoVirtual, BibAcessoVirtual, BibRepositorioItem.

## Arquivos
`logic.ts` (funções puras: multa, prazo, elegibilidade, renovação, fila, ISBN, CSV, adequação, ficha catalográfica, Dublin Core),
`service.ts` (empréstimo/devolução/reservas/multas/jobs), `acervo.ts`, `circulacao.ts`, `adequacao.ts`, `virtual.ts`,
`repositorio.ts`, `relatorios.ts`, `publico.ts`, `__selftest__.ts` (`npx tsx src/modules/biblioteca/__selftest__.ts`).

## Endpoints (LIB = LIBRARIAN; ADMIN/OWNER/RECTOR/BOARD sempre permitidos)
Config/bootstrap: POST /bootstrap (LIB), GET /config (LIB, COORD, TEACHER, SECRETARY, STAFF), PUT /config (LIB), POST /jobs/executar (LIB), CRUD /politicas (leitura: todos; escrita LIB).
Acervo: CRUD /obras, CRUD /exemplares (escrita LIB; leitura LIB/COORD/TEACHER/SECRETARY/STAFF; /obras leitura livre), GET /acervo/busca, GET /exemplares/lookup/:codigo, POST /obras/importar (json|csv, dryRun), POST /obras/:id/exemplares-lote, POST /exemplares/:id/status|baixar|reativar, GET /descartes/termo (LIB).
Circulação (LIB): POST /emprestimos, POST /emprestimos/devolver, GET /emprestimos[/:id], POST /emprestimos/:id/renovar|perdido, POST /reservas, GET /reservas, POST /reservas/:id/cancelar, GET/POST /multas, POST /multas/:id/baixar (PAGAR|ISENTAR|CANCELAR|COBRAR -> AccountReceivable; também FINANCE), CRUD /leitores, POST /leitores/de-aluno/:id, /leitores/de-usuario/:id, GET /leitores/:id/situacao, POST /leitores/:id/bloquear|desbloquear.
Autosserviço (qualquer usuário autenticado): GET /meus/resumo, POST /meus/renovar/:id, /meus/reservar, /meus/reservas/:id/cancelar.
Inventário (LIB): POST/GET /inventarios, GET /inventarios/:id, POST /inventarios/:id/leituras|concluir|cancelar.
Adequação: CRUD /bibliografia (LIB, COORD), GET /bibliografia/disciplina/:id, GET /bibliografia/obra/:id/disciplinas, GET /adequacao, POST /adequacao/gerar-sugestoes (LIB, COORD),
POST/GET /sugestoes (LIB, COORD, TEACHER, STUDENT), POST /sugestoes/:id/decidir (LIB, COORD), /comprar, /receber (LIB).
Virtual: GET /virtual/provedores, GET /virtual/catalogo, POST /virtual/recursos/:id/acessar (usuários), CRUD /virtual/recursos (LIB).
Repositório: POST/GET /repositorio, GET/PUT/PATCH /repositorio/:id, POST /:id/enviar-revisao, /:id/devolver, /:id/publicar, /:id/retirar (LIB), GET /:id/arquivo|ficha-catalografica|dublin-core, DELETE (LIB).
Relatórios: GET /relatorios/resumo|mais-emprestados|ociosos|giro|usuarios-ativos|atrasos|acervo-por-area|virtual-uso|repositorio.
Público: GET /:tenantId/catalogo, /catalogo/:obraId, /virtual, /repositorio, /repositorio/:id, /:id/arquivo, /:id/dublin-core, /:id/ficha-catalografica.

## Jobs (registerEduJob)
biblioteca:atrasos (atualiza dias/multa prevista, lembretes recorrentes de atraso), biblioteca:reservas-expiradas (expira e repassa fila),
biblioteca:multas-cobranca (sincroniza multas EM_COBRANCA com AccountReceivable pago), biblioteca:vigencia-virtual (alerta/inativa assinaturas vencidas).

## Exportado para outros módulos
`service.ts`: `situacaoLeitor`, `emprestar`, `devolver`, `reservar`, `garantirLeitorAluno`, `getConfig`;
`adequacao.ts`: `calcularAdequacao(tenantId, {programId?, disciplineId?})`; `logic.ts`: funções puras.
