import assert from 'node:assert/strict'
import * as L from './logic'

// distribuição por peso soma o total
const d = L.distribuirPorPeso(80, [{ id: 'a', peso: 10 }, { id: 'b', peso: 7 }, { id: 'c', peso: 3 }])
assert.equal(Object.values(d).reduce((s, v) => s + v, 0), 80)
assert.equal(d.a, 40)

// montagem
const pool: L.QuestaoPool[] = []
for (let i = 0; i < 20; i++) pool.push({ id: 'p' + i, eixoId: 'E1', nivel: (['FACIL', 'MEDIO', 'DIFICIL'] as const)[i % 3] })
for (let i = 0; i < 3; i++) pool.push({ id: 'q' + i, eixoId: 'E2', nivel: 'MEDIO' })
const m = L.montarSimulado(pool, [{ eixoId: 'E1', quantidade: 6, niveis: { FACIL: 1, MEDIO: 2, DIFICIL: 3 } }, { eixoId: 'E2', quantidade: 5 }], 7)
assert.equal(m.selecionadas.filter((s) => s.eixoId === 'E1').length, 6)
assert.equal(m.faltantes[0].eixoId, 'E2'); assert.equal(m.faltantes[0].obtido, 3)
assert.equal(new Set(m.selecionadas.map((s) => s.questaoId)).size, m.selecionadas.length)
const dif = m.selecionadas.filter((s) => s.eixoId === 'E1').map((s) => pool.find((p) => p.id === s.questaoId)!.nivel)
assert.equal(dif.filter((n) => n === 'DIFICIL').length, 3)
assert.deepEqual(L.montarSimulado(pool, [{ eixoId: 'E1', quantidade: 5 }], 3), L.montarSimulado(pool, [{ eixoId: 'E1', quantidade: 5 }], 3))

// correção
const c = L.corrigir([{ questaoId: '1', eixoId: 'A', gabarito: 'B' }, { questaoId: '2', eixoId: 'A', gabarito: 'C' }, { questaoId: '3', eixoId: 'B', gabarito: 'D' }], { '1': 'b', '2': 'A' })
assert.equal(c.acertos, 1); assert.equal(c.percentual, 33.3)
assert.equal(c.porEixo.find((e) => e.eixoId === 'A')!.percentual, 50)

// discriminação
const part = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ nota: n, acertou: n > 5 }))
assert.equal(L.indiceDiscriminacao(part), 1)
assert.equal(L.indiceDiscriminacao(part.slice(0, 3)), null)
assert.equal(L.avaliarDiscriminacao(-0.2), 'REVISAR_GABARITO')

// conceito/projeção
assert.equal(L.estimarConceitoEnade(72).conceito, 5)
assert.equal(L.estimarConceitoEnade(72).estimativa, true)
assert.equal(L.projecaoOAB(45).aprovadoProvavel, false)
assert.equal(L.projetarTendencia([40, 50, 60]), 70)

// lacunas
const lac = L.priorizarLacunas([
  { eixoId: 'x', peso: 10, meta: 60, atual: 30 },
  { eixoId: 'y', peso: 1, meta: 60, atual: 0 },
  { eixoId: 'z', peso: 8, meta: 60, atual: 70 },
])
assert.equal(lac[0].eixoId, 'x'); assert.equal(lac[0].prioridade, 100)
assert.equal(lac.find((l) => l.eixoId === 'z')!.gap, 0)

// plano
const plano = L.gerarPlanoSemanal(lac, { inicio: new Date('2026-03-02T00:00:00Z'), semanas: 4, horasSemana: 6 })
assert.ok(plano.some((i) => i.tipo === 'ESTUDO' && i.eixoId === 'x'))
assert.ok(plano.some((i) => i.tipo === 'REVISAO'))
assert.ok(!plano.some((i) => i.eixoId === 'z'))
assert.equal(plano[plano.length - 1].tipo, 'SIMULADO')
assert.equal(L.revisoesEspacadas(new Date('2026-01-01'), new Date('2026-01-10')).length, 3)

// risco
assert.equal(L.calcularRisco({ percentual: 20, meta: 60, tendencia: -5, entregasAtrasadas: 2 }).nivel, 'CRITICO')
assert.equal(L.calcularRisco({ percentual: 80, meta: 60 }).nivel, 'BAIXO')

// mapa de calor
const mp = L.mapaCalor([{ linha: 'T1', eixoId: 'a', acertos: 5, total: 10 }, { linha: 'T1', eixoId: 'a', acertos: 5, total: 10 }])
assert.equal(mp[0].celulas.a, 50)

// entrega
assert.equal(L.estadoEntrega(new Date('2020-01-01'), null), 'ATRASADA')
assert.equal(L.letraValida('E', 4), false)
console.log('desempenho selftest OK')
