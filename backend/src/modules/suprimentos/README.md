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

---
# Compras e Patrimônio (extensão — modelos auxiliares prefixo `Cpp`)
Fragmento `prisma/edu/cpp.prisma`; SQL no bloco `CPP:BEGIN/END` de `prisma/manual-migrations/20261004_edumaster_pro.sql` (CREATE das tabelas Cpp + `ADD COLUMN IF NOT EXISTS` em `InfBem.departamentoId/fotoPrincipalId`, `SupRequisicao.departamentoId`, `SupPedido.formaPagamento`; gerado por `prisma migrate diff`, conferido: após aplicar, o diff contra o schema fica vazio).
Testes: `DATABASE_URL=postgresql://... npx tsx scripts/e2e/compras-patrimonio.ts` (363 verificações, inclui o seed). Seed: `scripts/seeds/compras-patrimonio.ts` (`seedComprasPatrimonio(api, ctx)`).

## Fluxo de compra (obrigatório)
1. Requisição aprovada pela alçada -> **cotação** com fornecedores. `POST /cotacoes/:id/encerrar` é **bloqueado** (409, `codigo: COTACOES_INSUFICIENTES`) sem ao menos `minCotacoes` (padrão 3) propostas respondidas de fornecedores distintos, salvo **exceção formal aprovada** (`POST /excecoes-cotacao` com justificativa >= 30 caracteres; aprovada por quem a alçada do valor indica, nunca pelo solicitante; encerrar com exceção exige justificativa da escolha). `POST /cotacoes/:id/fornecedores` convida mais fornecedores.
2. No encerramento o **mapa comparativo é congelado** (`CppMapaCotacao`: propostas, escolha, sugerido pelo critério, justificativa, exceção usada). `GET /cotacoes/:id/mapa-comparativo[?format=html]`.
3. **Compra** (`POST /compras {cotacaoId, formaPagamento: A_VISTA|PARCELADO|BOLETO|PIX|CARTAO|PRAZO, parcelas, intervaloParcelasDias, entrada, primeiroVencimentoEm}`): o **valor escolhido e a forma de pagamento** passam pela alçada (`SupAlcada` do valor; formas que geram obrigação futura acrescentam o nível FINANCE). `POST /compras/:id/decidir`, `/cancelar`; `GET /compras[?pendentesMinhaAprovacao=true]`. **`POST /cotacoes/:id/gerar-pedido` só é aceito com a compra APROVADA** e herda parcelas/intervalo/forma (`SupPedido.formaPagamento`). Política `exigirAprovacaoCompra=false` (Financeiro) desliga o gate.
4. **Pedido direto** (`POST /pedidos` sem cotação) só abaixo de `valorDispensaCotacao` (padrão R$ 1.000) ou com `excecaoId` de exceção PEDIDO_DIRETO aprovada (uso único, valor até +10%).
5. **Conferência** (`POST /conferencias`, `PUT /conferencias/:id/itens/:itemId`, `POST /conferencias/:id/finalizar|cancelar`, `GET /conferencias/:id/relatorio`): contagem x pedido x nota; divergências `QUANTIDADE_NOTA`, `EXCESSO`, `FALTA`, `VALOR` (tolerância da política), `QUALIDADE`; decisão `ACEITAR | ACEITE_PARCIAL | RECUSAR` + destino do rejeitado (`DEVOLVER | DESCARTAR | AGUARDAR_REPOSICAO`); só o **Financeiro/Direção** aceita preço da nota acima do pedido; finalizar cria o recebimento, dá **entrada no estoque** (só o aceito) e gera `CppDevolucaoFornecedor` (`/devolucoes-fornecedor`, inclusive devolução pós-entrada). O recebimento direto (`/pedidos/:id/receber`) continua existindo, mas é bloqueado durante uma conferência aberta e, com `exigirConferencia`, sempre.
6. Se o recebimento final ficar abaixo do aprovado, as parcelas ainda em RASCUNHO são reduzidas proporcionalmente e o Financeiro é alertado.

## CONTRATO para Financeiro/Tesouraria — conta a pagar em rascunho
`POST /api/edu/suprimentos/compras/:id/gerar-conta-pagar` (`:id` = `CppCompra.id`; papéis SUPPLIES, FINANCE, ADMIN/OWNER/RECTOR/BOARD). Também é chamado automaticamente na aprovação final da compra.
- Só para compra `APROVADA`; **idempotente** (`200 {jaGeradas:true}` devolve as mesmas contas); `?regenerar=true` recria enquanto todas estiverem em RASCUNHO (`409` se alguma já foi conferida).
- Cria 1 `AccountPayable` (módulo financeiro existente, status `PENDENTE`) por parcela (mais a entrada, se houver), com `descricao` iniciada por `[RASCUNHO] `, `fornecedor` = razão social, `categoria` do 1º item, `costCenterId` da requisição ou do departamento.
- Resposta `201`: `{ compraId, numero, fornecedorId, fornecedor, valorTotal, formaPagamento, jaGeradas, contas:[{ id, accountPayableId, parcela, totalParcelas, valor, vencimento, situacao:'RASCUNHO' }] }` (`id` = `CppContaPagar`).
- Elo e estado: `CppContaPagar{ accountPayableId, situacao RASCUNHO|CONFERIDA|CANCELADA, valorOriginal, divergencia }`. **Quem paga/concilia deve ignorar `AccountPayable` cujo id esteja em `CppContaPagar` com `situacao = RASCUNHO`.**
- `POST /compras/:id/contas-pagar/conferir {ids?, ajustes?:[{id,valor,vencimento}], observacao}` (FINANCE) remove o prefixo, marca `CONFERIDA` e libera; `GET /compras/:id/contas-pagar` lista com o AccountPayable. Cancelar o pedido/compra cancela os rascunhos (`status CANCELADO`). Referência cruzada: a descrição passa a conter o nº do pedido quando ele é gerado.

## Almoxarifado (`/almoxarifado/...`) e departamentos
`/departamentos` (CRUD; compartilhado com o patrimônio; departamento com centro de custo apropria a requisição). Requisições aceitam `departamentoId` (filtro `?departamentoId=`). `GET /almoxarifado/painel`; `GET|PUT /almoxarifado/pontos-reposicao`, `POST /almoxarifado/pontos-reposicao/gerar-requisicao` (ponto por almoxarifado, sobrepõe o do item); `GET /almoxarifado/inventarios/:id/folha-contagem[?format=html]` (cega: sem o saldo do sistema), `.../divergencias[?format=csv]`, `POST .../recontagem`; `GET /almoxarifado/requisicoes-departamento`; relatórios `/almoxarifado/relatorios/{posicao,consumo-departamento,movimentacao,itens-parados,divergencias-recebimento}[?format=csv]`. Política: `GET|PUT /politica-compras` (PUT só FINANCE).

## Limites conhecidos
- Exceções, alçadas e conferência usam os papéis existentes (não há cadastro de pessoa por departamento além do responsável); o aprovador da exceção é o papel do maior nível da alçada do valor.
- A conta a pagar em rascunho é um AccountPayable `PENDENTE` com marcação (prefixo + `CppContaPagar`): o módulo financeiro legado não tem estado "rascunho" nativo.
- Mudança de comportamento deliberada: `gerar-pedido` agora exige compra aprovada (o e2e `qa4-suprimentos.ts` ganhou o passo de aprovação).
