import assert from 'node:assert/strict'
import { addDiasUteis, aplicarChecklist, avaliarCondicao, calcAtrasosPorResponsavel, calcFunil, calcGargalos, calcularPrazo, checklistPendente, diasDeAtraso, planoEscalonamento, podeAtuar, proximosNos, validarGrafo } from './engine'
import { calcularLayout, gerarMermaid } from './layout'
import { templatesPadrao } from './templates'

// condições
assert.equal(avaliarCondicao({ campo: 'nota', op: 'gte', valor: 6 }, { nota: 7 }), true)
assert.equal(avaliarCondicao({ campo: 'a.b', op: 'eq', valor: 'x' }, { a: { b: 'x' } }), true)
assert.equal(avaliarCondicao({ and: [{ campo: 'x', op: 'truthy' }, { not: { campo: 'y', op: 'exists' } }] }, { x: 1 }), true)
assert.equal(avaliarCondicao({ or: [{ campo: 'x', op: 'in', valor: ['A', 'B'] }] }, { x: 'C' }), false)
assert.equal(avaliarCondicao(null, {}), true)

// templates padrão: todos válidos, 15–40 nós, sem erros
const tpls = templatesPadrao()
assert.equal(tpls.length, 8)
for (const t of tpls) {
  const v = validarGrafo(t.grafo)
  assert.deepEqual(v.erros, [], `${t.chave}: ${v.erros.join(' | ')}`)
  assert.ok(t.grafo.nos.length >= 14, `${t.chave} tem ${t.grafo.nos.length} nós`)
  const d = calcularLayout(t.grafo)
  assert.equal(d.nos.length, t.grafo.nos.length)
  const ids = new Set(d.nos.map((n) => `${n.x},${n.y}`))
  assert.equal(ids.size, d.nos.length, `${t.chave}: nós sobrepostos`)
  const m = gerarMermaid(t.grafo)
  assert.ok(m.startsWith('flowchart TD') && m.includes('subgraph'))
}
const aluno = tpls.find((t) => t.persona === 'ALUNO')!.grafo
assert.ok(aluno.nos.length >= 30)

// roteamento
assert.deepEqual(proximosNos(aluno, 'gw_aprovado', { aprovado: false }), ['fim_nao_aprovado'])
assert.deepEqual(proximosNos(aluno, 'gw_aprovado', { aprovado: true }), ['convocacao'])
assert.deepEqual(proximosNos(aluno, 'conferencia_docs', { decisao: 'REJEITADO' }), ['documentos'])
assert.deepEqual(proximosNos(aluno, 'conferencia_docs', { decisao: 'APROVADO' }), ['marco_matriculado'])
assert.deepEqual(proximosNos(aluno, 'gw_ultimo', { ultimoPeriodo: true }), ['estagio'])
assert.deepEqual(proximosNos(aluno, 'gw_ultimo', {}), ['frequencia'])

// validação detecta erros
const ruim = validarGrafo({ nos: [{ chave: 'a', titulo: 'A', tipo: 'INICIO' }, { chave: 'b', titulo: 'B', tipo: 'TAREFA' }, { chave: 'c', titulo: 'C', tipo: 'FIM' }], transicoes: [{ deChave: 'a', paraChave: 'b' }] })
assert.ok(ruim.erros.some((e) => e.includes('responsável')))
assert.ok(ruim.erros.some((e) => e.includes('beco')))
assert.ok(ruim.erros.some((e) => e.includes('inalcançável')))

// layout: ciclo não trava; camadas respeitam a ordem; retorno marcado
const ciclo = calcularLayout({
  nos: [{ chave: 'i', titulo: 'I', tipo: 'INICIO' }, { chave: 'a', titulo: 'A', tipo: 'TAREFA', papel: 'STAFF' }, { chave: 'b', titulo: 'B', tipo: 'TAREFA', papel: 'STAFF' }, { chave: 'f', titulo: 'F', tipo: 'FIM' }],
  transicoes: [{ deChave: 'i', paraChave: 'a' }, { deChave: 'a', paraChave: 'b' }, { deChave: 'b', paraChave: 'a', condicao: { campo: 'x', op: 'truthy' } }, { deChave: 'b', paraChave: 'f' }],
}, { direcao: 'LR' })
const cam = Object.fromEntries(ciclo.nos.map((n) => [n.id, n.camada]))
assert.deepEqual([cam.i, cam.a, cam.b, cam.f], [0, 1, 2, 3])
assert.equal(ciclo.arestas.filter((e) => e.retorno).length, 1)
assert.ok(ciclo.nos.find((n) => n.id === 'b')!.x > ciclo.nos.find((n) => n.id === 'a')!.x)
// ramificação: dois nós na mesma camada têm linhas diferentes
const ram = calcularLayout({
  nos: [{ chave: 'i', titulo: 'I', tipo: 'INICIO' }, { chave: 'g', titulo: 'G', tipo: 'GATEWAY' }, { chave: 'x', titulo: 'X', tipo: 'FIM' }, { chave: 'y', titulo: 'Y', tipo: 'FIM' }],
  transicoes: [{ deChave: 'i', paraChave: 'g' }, { deChave: 'g', paraChave: 'x', condicao: { campo: 'a', op: 'truthy' } }, { deChave: 'g', paraChave: 'y' }],
})
const gx = ram.nos.find((n) => n.id === 'x')!, gy = ram.nos.find((n) => n.id === 'y')!
assert.equal(gx.camada, gy.camada); assert.notEqual(gx.x, gy.x)

// checklist
const def = [{ chave: 'a', titulo: 'A', obrigatorio: true }, { chave: 'b', titulo: 'B', obrigatorio: false }]
assert.equal(checklistPendente(def, {}).length, 1)
const est = aplicarChecklist({}, { a: true }, 'u1', new Date(), def)
assert.equal(checklistPendente(def, est).length, 0)
assert.throws(() => aplicarChecklist({}, { z: true }, 'u1', new Date(), def))

// prazos
const seg = new Date('2026-03-02T12:00:00Z') // segunda
assert.equal(addDiasUteis(seg, 5).toISOString().slice(0, 10), '2026-03-09')
assert.equal(calcularPrazo(seg, 2)!.toISOString().slice(0, 10), '2026-03-04')
assert.equal(calcularPrazo(seg, null), null)
assert.equal(diasDeAtraso(new Date('2026-03-01T00:00:00Z'), new Date('2026-03-04T00:00:00Z')), 3)
assert.equal(diasDeAtraso(new Date('2026-03-05T00:00:00Z'), new Date('2026-03-04T00:00:00Z')), 0)

// escalonamento
assert.equal(planoEscalonamento({ escalarPara: 'COORDINATOR' }, 0, 0).nivel, 0)
assert.deepEqual(planoEscalonamento({ escalarPara: 'COORDINATOR' }, 2, 0), { nivel: 1, destinoPapel: 'COORDINATOR', severity: 'CRITICO' })
assert.equal(planoEscalonamento({ escalarPara: 'COORDINATOR' }, 2, 1).destinoPapel, undefined)
assert.equal(planoEscalonamento({ escalarAposDias: 5, escalarPara2: 'BOARD' }, 6, 1).destinoPapel, 'BOARD')

// permissões
assert.equal(podeAtuar({ id: 'u', role: 'SECRETARY' }, { papel: 'SECRETARY' }), true)
assert.equal(podeAtuar({ id: 'u', role: 'STUDENT' }, { papel: 'SECRETARY' }), false)
assert.equal(podeAtuar({ id: 'u', role: 'ADMIN' }, { papel: 'SECRETARY' }), true)
assert.equal(podeAtuar({ id: 'u', role: 'SECRETARY' }, { papel: 'SECRETARY', responsavelUserId: 'outro' }), false)

// analytics
const d0 = new Date('2026-01-01T00:00:00Z'), d1 = new Date('2026-01-11T00:00:00Z')
const garg = calcGargalos([
  { noChave: 'a', titulo: 'A', status: 'CONCLUIDA', iniciadaEm: d0, concluidaEm: d1 },
  { noChave: 'a', titulo: 'A', status: 'CONCLUIDA', iniciadaEm: d0, concluidaEm: new Date('2026-01-03T00:00:00Z') },
  { noChave: 'b', titulo: 'B', status: 'ATRASADA', iniciadaEm: d0 },
], d1)
assert.equal(garg[0].noChave, 'b')
assert.equal(garg.find((g) => g.noChave === 'a')!.tempoMedioDias, 6)
const ar = calcAtrasosPorResponsavel([{ papel: 'X', status: 'ATRASADA', diasAtraso: 4 }, { papel: 'X', status: 'ABERTA' }, { papel: 'Y', status: 'CONCLUIDA' }])
assert.deepEqual([ar.length, ar[0].atrasadas, ar[0].abertas], [1, 1, 2])
const fun = calcFunil([{ chave: 'a', titulo: 'A', ordem: 0 }, { chave: 'b', titulo: 'B', ordem: 1 }], [
  { instanciaId: '1', noChave: 'a', status: 'CONCLUIDA' }, { instanciaId: '1', noChave: 'b', status: 'ABERTA' }, { instanciaId: '2', noChave: 'a', status: 'ABERTA' }])
assert.deepEqual(fun.map((f) => [f.alcancaram, f.agoraAqui]), [[2, 1], [1, 1]])

console.log('jornadas selftest OK')
