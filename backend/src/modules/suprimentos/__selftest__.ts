import assert from 'node:assert/strict'
import {
  alcadasNecessarias, aplicarMovimento, compararCotacoes, curvaABC, custoMedioPonderado, fechamentoCaixa, parcelar, podeTransitar, pontoDePedido,
  proximoNivelPendente, quantidadesKit, reajustar, renovarVigencia, REQ_TRANSICOES, PEDIDO_TRANSICOES, selecionarLotesFEFO, statusContrato, statusValidade,
  sugerirReposicao, totalVenda, validarDevolucao, formatarNumero, notaAvaliacao, novaMedia, DAY,
} from './logic'

// Alçadas
const al = [{ nivel: 1, valorMinimo: 0, papel: 'COORDINATOR' }, { nivel: 2, valorMinimo: 2000, papel: 'FINANCE' }, { nivel: 3, valorMinimo: 10000, papel: 'RECTOR' }]
assert.deepEqual(alcadasNecessarias(500, al).map((a) => a.nivel), [1])
assert.deepEqual(alcadasNecessarias(2000, al).map((a) => a.nivel), [1, 2])
assert.deepEqual(alcadasNecessarias(50000, al).map((a) => a.nivel), [1, 2, 3])
assert.equal(alcadasNecessarias(100, [])[0].papel, 'COORDINATOR')
assert.equal(proximoNivelPendente([{ nivel: 1, status: 'APROVADO' }, { nivel: 2, status: 'PENDENTE' }, { nivel: 3, status: 'PENDENTE' }])?.nivel, 2)
assert.equal(proximoNivelPendente([{ nivel: 1, status: 'APROVADO' }]), null)

// Máquinas de estado
assert.ok(podeTransitar(REQ_TRANSICOES, 'RASCUNHO', 'AGUARDANDO_APROVACAO'))
assert.ok(!podeTransitar(REQ_TRANSICOES, 'ATENDIDA', 'CANCELADA'))
assert.ok(podeTransitar(PEDIDO_TRANSICOES, 'PARCIALMENTE_RECEBIDO', 'RECEBIDO'))
assert.ok(!podeTransitar(PEDIDO_TRANSICOES, 'RECEBIDO', 'CANCELADO'))

// Cotações
const itens = [{ id: 'a', quantidade: 10, precoEstimado: 12 }, { id: 'b', quantidade: 5, precoEstimado: 20 }]
const props = [
  { fornecedorId: 'F1', respondeu: true, frete: 30, prazoEntregaDias: 10, precos: [{ requisicaoItemId: 'a', precoUnitario: 10 }, { requisicaoItemId: 'b', precoUnitario: 18 }] }, // 100+90+30=220
  { fornecedorId: 'F2', respondeu: true, frete: 0, prazoEntregaDias: 3, precos: [{ requisicaoItemId: 'a', precoUnitario: 11 }, { requisicaoItemId: 'b', precoUnitario: 19 }] },  // 110+95=205
  { fornecedorId: 'F3', respondeu: true, frete: 0, prazoEntregaDias: 1, precos: [{ requisicaoItemId: 'a', precoUnitario: 5 }] },  // parcial
  { fornecedorId: 'F4', respondeu: false, precos: [] },
]
const m = compararCotacoes(itens, props, 'MENOR_PRECO')
assert.equal(m.vencedor, 'F2'); assert.equal(m.totalVencedor, 205)
assert.equal(m.melhorPorItem['a']?.fornecedorId, 'F3')           // parcial aparece no melhor por item
assert.equal(m.linhas.length, 3)                                 // F4 não respondeu
assert.equal(m.referencia, 220); assert.equal(m.economia, 15)    // estimado 120+100=220
assert.equal(compararCotacoes(itens, props, 'MELHOR_PRAZO').vencedor, 'F2')
assert.ok(compararCotacoes(itens, [], 'MENOR_PRECO').semProposta)
const empate = compararCotacoes([{ id: 'a', quantidade: 1 }], [{ fornecedorId: 'X', respondeu: true, prazoEntregaDias: 9, precos: [{ requisicaoItemId: 'a', precoUnitario: 5 }] }, { fornecedorId: 'Y', respondeu: true, prazoEntregaDias: 2, precos: [{ requisicaoItemId: 'a', precoUnitario: 5 }] }])
assert.equal(empate.vencedor, 'Y')                               // desempate por prazo
assert.equal(empate.economia, 0)                                 // sem estimado: referência = média

// Parcelamento (centavos)
const ps = parcelar(100, 3, new Date('2026-01-10'), 30)
assert.deepEqual(ps.map((p) => p.valor), [33.33, 33.33, 33.34])
assert.equal(Math.round(ps.reduce((s, p) => s + p.valor, 0) * 100), 10000)
assert.equal(ps[1].vencimento.getTime() - ps[0].vencimento.getTime(), 30 * DAY)

// Custo médio e movimentação
assert.equal(custoMedioPonderado(10, 5, 10, 7), 6)
assert.equal(custoMedioPonderado(0, 0, 4, 9), 9)
let r = aplicarMovimento(10, 5, 1, 10, 7)
assert.deepEqual([r.saldo, r.custoMedio, r.valorTotal], [20, 6, 70])
r = aplicarMovimento(20, 6, -1, 5)
assert.deepEqual([r.saldo, r.custoMedio, r.valorTotal], [15, 6, 30])
assert.throws(() => aplicarMovimento(3, 6, -1, 5), /Saldo insuficiente/)
assert.throws(() => aplicarMovimento(3, 6, 1, 0), /maior que zero/)

// Ponto de pedido e reposição
assert.equal(pontoDePedido(2, 7, 5), 19)
const rep = sugerirReposicao([
  { itemId: 'ok', saldo: 100, minimo: 10, maximo: 200, consumoDiario: 1, leadTimeDias: 5 },
  { itemId: 'baixo', saldo: 8, minimo: 10, maximo: 100, consumoDiario: 1, leadTimeDias: 5 },
  { itemId: 'zerado', saldo: 0, minimo: 5, maximo: 50, consumoDiario: 2, leadTimeDias: 7 },
  { itemId: 'comprado', saldo: 8, minimo: 10, maximo: 100, consumoDiario: 1, leadTimeDias: 5, emPedido: 200 },
])
assert.deepEqual(rep.map((x) => x.itemId), ['zerado', 'baixo'])
assert.equal(rep[0].prioridade, 'CRITICA'); assert.equal(rep[0].quantidadeSugerida, 50)
assert.equal(rep[1].quantidadeSugerida, 92)

// Curva ABC
const abc = curvaABC([{ id: '1', valor: 800 }, { id: '2', valor: 120 }, { id: '3', valor: 50 }, { id: '4', valor: 20 }, { id: '5', valor: 10 }])
assert.deepEqual(abc.map((x) => x.classe), ['A', 'B', 'B', 'C', 'C'])
assert.equal(curvaABC([]).length, 0)

// Validade / FEFO
const hoje = new Date('2026-06-01')
assert.equal(statusValidade(new Date('2026-05-30'), hoje), 'VENCIDO')
assert.equal(statusValidade(new Date('2026-06-10'), hoje), 'CRITICO')
assert.equal(statusValidade(new Date('2026-07-15'), hoje), 'ATENCAO')
assert.equal(statusValidade(new Date('2027-01-01'), hoje), 'OK')
assert.equal(statusValidade(null, hoje), 'SEM_VALIDADE')
const f = selecionarLotesFEFO([
  { id: 'l1', numero: 'A', validade: new Date('2026-12-01'), quantidade: 5 },
  { id: 'l2', numero: 'B', validade: new Date('2026-08-01'), quantidade: 3 },
  { id: 'l3', numero: 'C', validade: new Date('2026-01-01'), quantidade: 9 },   // vencido: ignorado
  { id: 'l4', numero: 'D', validade: null, quantidade: 10 },
], 10, hoje)
assert.deepEqual(f.selecao.map((x) => [x.numero, x.quantidade]), [['B', 3], ['A', 5], ['D', 2]])
assert.equal(f.faltante, 0)
assert.equal(selecionarLotesFEFO([{ id: 'x', numero: 'X', validade: null, quantidade: 2 }], 5, hoje).faltante, 3)

// Kits
assert.deepEqual(quantidadesKit([{ itemId: 'i', quantidadeFixa: 1, quantidadePorAluno: 2 }, { itemId: 'z', quantidadeFixa: 0, quantidadePorAluno: 0 }], 20, 2), [{ itemId: 'i', quantidade: 82 }])

// Contratos
const c = { vigenciaInicio: new Date('2026-01-01'), vigenciaFim: new Date('2026-12-31'), avisoDias: 60, status: 'VIGENTE' }
assert.equal(statusContrato(c, new Date('2026-06-01')), 'VIGENTE')
assert.equal(statusContrato(c, new Date('2026-11-15')), 'A_VENCER')
assert.equal(statusContrato(c, new Date('2027-01-05')), 'VENCIDO')
assert.equal(statusContrato({ ...c, status: 'ENCERRADO' }, new Date('2027-01-05')), 'ENCERRADO')
assert.equal(reajustar(1000, 4.5), 1045)
const rv = renovarVigencia(new Date('2026-01-01'), new Date('2026-12-31'))
assert.equal(rv.meses, 12); assert.equal(rv.inicio.toISOString().slice(0, 10), '2027-01-01'); assert.equal(rv.fim.toISOString().slice(0, 10), '2027-12-31')

// Avaliação
assert.equal(notaAvaliacao({ prazo: 5, qualidade: 5, preco: 5, atendimento: 5 }), 5)
assert.equal(novaMedia(4, 3, 5), 4.25)

// Vendas / caixa
assert.deepEqual(totalVenda([{ quantidade: 2, precoUnitario: 10 }, { quantidade: 1, precoUnitario: 5.5 }], 5), { subtotal: 25.5, desconto: 5, total: 20.5 })
assert.equal(totalVenda([{ quantidade: 1, precoUnitario: 10 }], 99).total, 0)
assert.deepEqual(fechamentoCaixa({ abertura: 100, vendasDinheiro: 300, devolucoesDinheiro: 20, suprimentos: 50, sangrias: 200, contado: 225 }), { esperado: 230, diferenca: -5 })
const vend = [{ id: 'v1', quantidade: 3, quantidadeDevolvida: 1, precoUnitario: 10 }]
assert.equal(validarDevolucao(vend, [{ vendaItemId: 'v1', quantidade: 2 }]), 20)
assert.throws(() => validarDevolucao(vend, [{ vendaItemId: 'v1', quantidade: 3 }]), /excede/)
assert.throws(() => validarDevolucao(vend, [{ vendaItemId: 'nope', quantidade: 1 }]), /não pertence/)

assert.equal(formatarNumero('REQ', 2026, 7), 'REQ-2026-0007')
console.log('suprimentos: selftest OK')
