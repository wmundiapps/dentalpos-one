import assert from 'node:assert/strict'
import * as c from './calc'

const d = (s: string) => new Date(s + 'T12:00:00')

// depreciação
let r = c.depreciacaoLinear({ valorAquisicao: 12000, dataAquisicao: d('2024-01-15'), vidaUtilMeses: 120, residualPct: 10, dataReferencia: d('2025-01-15') })
assert.equal(r.mesesUsados, 12); assert.equal(r.depreciacaoMensal, 90); assert.equal(r.valorContabil, 10920)
r = c.depreciacaoLinear({ valorAquisicao: 12000, dataAquisicao: d('2024-01-15'), vidaUtilMeses: 120, residualPct: 10, dataReferencia: d('2025-01-14') })
assert.equal(r.mesesUsados, 11)
r = c.depreciacaoLinear({ valorAquisicao: 1000, dataAquisicao: d('2000-01-01'), vidaUtilMeses: 60, valorResidual: 100, dataReferencia: d('2026-01-01') })
assert.equal(r.valorContabil, 100); assert.ok(r.totalmenteDepreciado)
r = c.depreciacaoLinear({ valorAquisicao: 1200, dataAquisicao: d('2024-01-01'), vidaUtilMeses: 12, dataReferencia: d('2026-01-01'), dataBaixa: d('2024-04-01') })
assert.equal(r.mesesUsados, 3); assert.equal(r.valorContabil, 900)
assert.equal(c.depreciacaoLinear({ valorAquisicao: 500, dataAquisicao: d('2030-01-01'), vidaUtilMeses: 12, dataReferencia: d('2026-01-01') }).valorContabil, 500)

// SLA
const ab = d('2025-03-03')
assert.equal(c.prazoSla(ab, 'URGENTE').getTime() - ab.getTime(), 4 * 3600000)
const pz = c.prazoSla(ab, 'ALTA')
assert.equal(c.situacaoSla(ab, pz, null, new Date(ab.getTime() + 3600000)), 'NO_PRAZO')
assert.equal(c.situacaoSla(ab, pz, null, new Date(ab.getTime() + 20 * 3600000)), 'EM_RISCO')
assert.equal(c.situacaoSla(ab, pz, null, new Date(ab.getTime() + 30 * 3600000)), 'VENCIDO')
assert.equal(c.situacaoSla(ab, pz, new Date(ab.getTime() + 3600000)), 'CUMPRIDO')
assert.equal(c.situacaoSla(ab, pz, new Date(ab.getTime() + 99 * 3600000)), 'DESCUMPRIDO')

// plano preventivo
let p = c.avaliarPlano(d('2025-06-30'), 30, 7, d('2025-06-10'))
assert.equal(p.deveGerar, false); assert.equal(p.proximaExecucao.getTime(), d('2025-06-30').getTime())
p = c.avaliarPlano(d('2025-06-30'), 30, 7, d('2025-06-24'))
assert.equal(p.deveGerar, true); assert.equal(p.proximaExecucao.getTime(), d('2025-07-30').getTime())
p = c.avaliarPlano(d('2025-01-01'), 30, 7, d('2025-06-24'))
assert.ok(p.proximaExecucao > d('2025-06-24'))

// indicadores
const os = [
  { abertaEm: d('2025-01-01'), concluidaEm: d('2025-01-02'), tipo: 'CORRETIVA', status: 'CONCLUIDA', bemParado: true, bemId: 'a' },
  { abertaEm: d('2025-01-05'), concluidaEm: d('2025-01-08'), tipo: 'CORRETIVA', status: 'CONCLUIDA', bemParado: true, bemId: 'b' },
  { abertaEm: d('2025-01-05'), concluidaEm: null, tipo: 'PREVENTIVA', status: 'ABERTA' },
]
assert.equal(c.mttrHoras(os), 48)
assert.equal(c.mttrHoras([]), null)
assert.equal(c.disponibilidadePct(os, d('2025-01-01'), d('2025-01-11'), 2), 80)
assert.equal(c.custoPorM2(1000, 250), 4); assert.equal(c.custoPorM2(1, 0), null)

// energia
const cc = c.consumoEntre({ dataLeitura: d('2025-01-01'), valor: 1000 }, { dataLeitura: d('2025-01-31'), valor: 1300 })
assert.deepEqual(cc, { consumo: 300, dias: 30, mediaDiaria: 10 })
assert.throws(() => c.consumoEntre({ dataLeitura: d('2025-01-01'), valor: 1000 }, { dataLeitura: d('2025-01-31'), valor: 900 }))
assert.throws(() => c.consumoEntre({ dataLeitura: d('2025-02-01'), valor: 1 }, { dataLeitura: d('2025-01-31'), valor: 9 }))
let dv = c.desvioConsumo(15, [10, 10, 10], 25)
assert.equal(dv.desvioPct, 50); assert.equal(dv.alerta, true)
dv = c.desvioConsumo(11, [10, 10, 10], 25); assert.equal(dv.alerta, false)
dv = c.desvioConsumo(5, [10, 10], 25); assert.equal(dv.alerta, true); assert.equal(dv.desvioPct, -50)
assert.equal(c.desvioConsumo(5, [10], 25).alerta, false)
assert.equal(c.desvioConsumo(5, [0, 0], 25).alerta, true)

// reservas
assert.equal(c.conflitoHorario({ inicio: d('2025-01-01'), fim: d('2025-01-02') }, { inicio: d('2025-01-02'), fim: d('2025-01-03') }), false)
assert.equal(c.conflitoHorario({ inicio: d('2025-01-01'), fim: d('2025-01-03') }, { inicio: d('2025-01-02'), fim: d('2025-01-04') }), true)

// projeto
assert.equal(c.percentualProjeto([{ peso: 1, percentual: 0, status: 'CONCLUIDA' }, { peso: 3, percentual: 50, status: 'EM_ANDAMENTO' }]), 62.5)
assert.equal(c.percentualProjeto([]), 0)

// inventário
assert.equal(c.classificarDivergencia({ contado: false }), 'NAO_ENCONTRADO')
assert.equal(c.classificarDivergencia({ contado: true, spaceEsperadoId: 'a', spaceEncontradoId: 'b' }), 'LOCAL_DIVERGENTE')
assert.equal(c.classificarDivergencia({ contado: true, spaceEsperadoId: 'a', spaceEncontradoId: 'a', estadoEsperado: 'BOM', estadoEncontrado: 'RUIM' }), 'ESTADO_DIVERGENTE')
assert.equal(c.classificarDivergencia({ contado: true, semBemCadastrado: true }), 'SOBRA')
assert.equal(c.classificarDivergencia({ contado: true, spaceEsperadoId: 'a', spaceEncontradoId: 'a' }), 'NENHUMA')
assert.equal(c.resumoInventario(['NENHUMA', 'NENHUMA', 'NAO_ENCONTRADO', 'SOBRA']).acuracidadePct, 50)

// adequação
assert.equal(c.quantidadeExigida(2, 2, 40), 20); assert.equal(c.quantidadeExigida(5, 2, 4), 5); assert.equal(c.quantidadeExigida(3, null, 100), 3)
assert.deepEqual(c.avaliarRequisito(10, 4), { situacao: 'PARCIAL', lacuna: 6, coberturaPct: 40 })
assert.equal(c.avaliarRequisito(3, 0).situacao, 'NAO_ATENDE'); assert.equal(c.avaliarRequisito(3, 5).situacao, 'ATENDE')
assert.equal(c.conceitoAdequacao(100), 5); assert.equal(c.conceitoAdequacao(72), 3); assert.equal(c.conceitoAdequacao(10), 1)

// estacionamento
assert.equal(c.normalizarPlaca('abc-1d23'), 'ABC1D23'); assert.ok(c.placaValida('ABC-1234')); assert.ok(c.placaValida('abc1d23')); assert.ok(!c.placaValida('AB12'))
assert.equal(c.credencialVigente('ATIVA', d('2020-01-01'), d('2025-01-01')).ok, false)
assert.equal(c.credencialVigente('ATIVA', null).ok, true)
assert.equal(c.credencialVigente('SUSPENSA', null).ok, false)
assert.equal(c.ocupacaoPct(5, 20), 25)

console.log('infraestrutura selftest OK')
