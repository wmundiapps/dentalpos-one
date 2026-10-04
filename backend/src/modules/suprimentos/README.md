# Módulo suprimentos (prefixo Sup)

Compras, estoque/almoxarifado, insumos de cursos, contratos e vendas. Montado em `/api/edu/suprimentos`.
Papéis: SUPPLIES (gestão), FINANCE, COORDINATOR, TEACHER, FACILITIES, STAFF, SECRETARY (+ ADMIN/OWNER/RECTOR/BOARD sempre).

## Models (33)
SupFornecedor, SupFornecedorDocumento, SupFornecedorAvaliacao, SupCategoria, SupItem, SupAlmoxarifado, SupSaldo, SupLote, SupMovimentacao,
SupInventario(+Item), SupAlcada, SupRequisicao(+Item), SupAprovacao, SupCotacao, SupCotacaoProposta, SupCotacaoPreco, SupPedido(+Item),
SupRecebimento(+Item), SupContrato, SupKit(+Item), SupKitConsumo, SupProduto, SupCaixa, SupCaixaMov, SupVenda(+Item), SupDevolucao, SupSequencia.

## Endpoints (prefixo /api/edu/suprimentos)
- POST /bootstrap (SUPPLIES, FINANCE) — categorias, almoxarifados, alçadas (0/2000/10000), itens-modelo.
- CRUD (GET/GET:id/POST/PUT/PATCH/DELETE): /fornecedores, /fornecedor-documentos, /categorias, /itens, /almoxarifados, /alcadas (FINANCE), /contratos, /produtos.
- Fornecedores: POST /fornecedores/avaliacoes, GET /fornecedores/:id/avaliacoes, GET /fornecedor-documentos-vencendo.
- Contratos: POST /contratos/:id/reajustar, POST /contratos/:id/renovar, GET /contratos-vencendo.
- Requisições: GET/POST /requisicoes, GET/PUT /requisicoes/:id, POST /:id/enviar | decidir | cancelar | reabrir | atender-estoque.
- Cotações: POST /requisicoes/:id/cotacoes, GET /cotacoes, PUT /cotacoes/:id/propostas/:fornecedorId, GET /cotacoes/:id/mapa, POST /cotacoes/:id/encerrar | cancelar | gerar-pedido.
- Pedidos: GET/POST /pedidos, GET /pedidos/:id, POST /:id/emitir | cancelar | receber | encerrar-saldo.
- Estoque: GET /estoque/saldos | movimentacoes | lotes | reposicao | curva-abc | consumo; POST /estoque/movimentacoes; POST /estoque/reposicao/gerar-requisicao.
- Inventário: POST/GET /inventarios, GET /:id, PUT /:id/contagem, POST /:id/finalizar | ajustar | cancelar.
- Kits: GET/POST /kits, GET/PUT/DELETE /kits/:id, GET /kits/:id/disponibilidade, POST /kits/:id/consumir | solicitar, GET /kits-consumos.
- Vendas: GET /produtos-pdv; POST /caixa/abrir, GET /caixa/atual, GET /caixa, GET /caixa/:id/resumo, POST /caixa/:id/movimento | fechar; POST/GET /vendas, GET /vendas/:id, POST /vendas/:id/devolucao, GET /vendas/:id/recibo (HTML), GET /vendas-relatorio.
- Relatórios: GET /relatorios/gasto | prazo-entrega | economia-cotacoes, GET /dashboard.

## Jobs (registerEduJob)
suprimentos:documentos-fornecedores, :contratos (status + renovação automática), :validade-lotes, :estoque-minimo, :prazos-compras, :kits-aulas.

## Exportado para outros módulos (via ./routes)
`movimentar`, `movimentarTx`, `checarEstoqueMinimo`, `saldoTotalItem`, `calcularReposicao`, `compararCotacoes`, `sugerirReposicao`, `curvaABC`, `parcelar`, `custoMedioPonderado`.

## Testes
`npx tsx src/modules/suprimentos/__selftest__.ts` (lógica pura em `logic.ts`).
