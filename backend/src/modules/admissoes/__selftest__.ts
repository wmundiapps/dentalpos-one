import assert from 'node:assert/strict'
import * as L from './logic'

// CPF
assert.ok(L.validarCpf('529.982.247-25'))
assert.ok(!L.validarCpf('111.111.111-11'))
assert.ok(!L.validarCpf('529.982.247-24'))
assert.match(L.gerarProtocolo(2026), /^ADM2026-[A-Z2-9]{6}$/)
assert.equal(L.gerarSenhaProvisoria().length, 10)
assert.equal(L.proximoRA(2026, 41), '2026000042')

// transições
assert.ok(L.podeTransicionar('LEAD', 'INSCRITO'))
assert.ok(!L.podeTransicionar('LEAD', 'MATRICULADO'))
assert.ok(L.podeTransicionar('CONVOCADO', 'APROVADO'))

// funil
const f = L.calcularFunil([
  { status: 'LEAD' }, { status: 'INSCRITO' }, { status: 'PROVA' }, { status: 'MATRICULADO' },
  { status: 'DESISTENTE', etapaMaxima: 2 }, { status: 'REPROVADO' },
])
assert.equal(f.total, 6)
assert.equal(f.etapas[0].alcancou, 6)
assert.equal(f.etapas[1].alcancou, 5)
assert.equal(f.etapas[2].alcancou, 4) // PROVA, MATRICULADO, DESISTENTE(2), REPROVADO
assert.equal(f.etapas[5].alcancou, 1)
assert.equal(f.desistentes, 1)

// nota final
assert.equal(L.calcularNotaFinal([{ componente: 'PROVA', nota: 80 }, { componente: 'REDACAO', nota: 5, notaMaxima: 10 }], { PROVA: 3, REDACAO: 1 }), 72.5)
assert.equal(L.calcularNotaFinal([]), null)

// classificação + desempate
const cands: L.CandidatoClassif[] = [
  { id: 'a', ofertaId: 'o1', notaFinal: 80, notas: [{ componente: 'REDACAO', nota: 70 }] },
  { id: 'b', ofertaId: 'o1', notaFinal: 80, notas: [{ componente: 'REDACAO', nota: 90 }] },
  { id: 'c', ofertaId: 'o1', ofertaId2: 'o2', notaFinal: 75 },
  { id: 'd', ofertaId: 'o1', ofertaId2: 'o2', notaFinal: 60 },
  { id: 'e', ofertaId: 'o1', notaFinal: 40 },
  { id: 'f', ofertaId: 'o1', notaFinal: null },
  { id: 'g', ofertaId: 'o1', notaFinal: 80, notas: [{ componente: 'REDACAO', nota: 90 }], dataNascimento: '1980-01-01' },
]
const r = L.classificar(cands, { o1: 2, o2: 1 }, { notaMinima: 50, criterios: ['REDACAO', 'IDADE'] })
const m = Object.fromEntries(r.resultados.map((x) => [x.id, x]))
assert.equal(m.g.posicaoGeral, 1) // empata com b em nota e redação; mais velho vence
assert.equal(m.b.posicaoGeral, 2)
assert.equal(m.a.posicaoGeral, 3)
assert.equal(m.g.ofertaAlocada, 'o1')
assert.equal(m.b.ofertaAlocada, 'o1')
assert.equal(m.a.situacao, 'LISTA_ESPERA')
assert.equal(m.c.ofertaAlocada, 'o2') // sem vaga em o1, cai na 2ª opção
assert.equal(m.d.situacao, 'LISTA_ESPERA')
assert.equal(m.e.situacao, 'DESCLASSIFICADO')
assert.equal(m.f.situacao, 'DESCLASSIFICADO')
assert.deepEqual(r.filaPorOferta.o1, ['g', 'b', 'a', 'd'])

// chamadas
const ch1 = L.proximaChamada(
  [{ ofertaId: 'o1', vagas: 2, ocupadas: 0, fila: r.filaPorOferta.o1 }, { ofertaId: 'o2', vagas: 1, ocupadas: 0, fila: r.filaPorOferta.o2 }],
  new Set(),
)
assert.deepEqual(ch1.map((x) => x.candidatoId + ':' + x.ofertaId), ['g:o1', 'b:o1', 'c:o2'])
// b renunciou (excluído) e liberou vaga: ocupadas=1 (g) -> próximo é a
const ch2 = L.proximaChamada(
  [{ ofertaId: 'o1', vagas: 2, ocupadas: 1, fila: r.filaPorOferta.o1 }],
  new Set(['g', 'b', 'c']),
  new Set(['b']),
)
assert.deepEqual(ch2, [{ candidatoId: 'a', ofertaId: 'o1' }])

// campanha
const mc = L.calcularMetricasCampanha({ custo: 10000, leads: 500, inscritos: 100, matriculas: 20, receitaPorMatricula: 6000, metaMatriculas: 25, orcamento: 12000 })
assert.equal(mc.cpl, 20)
assert.equal(mc.custoPorMatricula, 500)
assert.equal(mc.roi, 1100)
assert.equal(mc.atingimentoMetaMatriculas, 80)
assert.equal(L.calcularMetricasCampanha({ custo: 0, leads: 0, inscritos: 0, matriculas: 0 }).cpl, null)

// bolsas
const b1: L.BolsaDef = { id: 'b1', nome: 'Mérito', percentual: 30, regras: { notaMinima: 80 } }
assert.ok(L.avaliarElegibilidadeBolsa(b1, { notaFinal: 85 }).elegivel)
assert.ok(!L.avaliarElegibilidadeBolsa(b1, { notaFinal: 70 }).elegivel)
assert.ok(!L.avaliarElegibilidadeBolsa({ ...b1, limiteConcessoes: 1, concessoesAtuais: 1 }, { notaFinal: 90 }).elegivel)
assert.ok(!L.avaliarElegibilidadeBolsa({ id: 'c', nome: 'c', percentual: 10, regras: { convenioEmpresa: 'ACME' } }, { empresaConvenio: 'x' }).elegivel)
const ap = L.aplicarBeneficios(1000, [{ id: 'a', percentual: 30 }, { id: 'b', percentual: 20 }, { id: 'c', percentual: 15, cumulativa: true }])
assert.equal(ap.percentualTotal, 45)
assert.equal(ap.valorFinal, 550)
assert.equal(L.aplicarBeneficios(1000, [{ id: 'a', percentual: 90, cumulativa: true }, { id: 'b', percentual: 50, cumulativa: true }]).percentualTotal, 100)

// rematrícula
assert.deepEqual(L.calcularDescontoAntecipacao(1000, 10, new Date('2026-12-01'), new Date('2026-11-30')), { desconto: 100, valorFinal: 900, aplicado: true })
assert.equal(L.calcularDescontoAntecipacao(1000, 10, new Date('2026-12-01'), new Date('2026-12-02')).aplicado, false)
const base = { statusAluno: 'ATIVO', temMatriculaAtiva: true, parcelasVencidas: 0, valorVencido: 0, bloqueiaInadimplente: true }
assert.equal(L.avaliarRematricula(base).status, 'ELEGIVEL')
assert.equal(L.avaliarRematricula({ ...base, parcelasVencidas: 2, valorVencido: 800 }).status, 'PENDENTE_FINANCEIRO')
assert.equal(L.avaliarRematricula({ ...base, parcelasVencidas: 2, valorVencido: 800, bloqueiaInadimplente: false }).status, 'ELEGIVEL')
assert.equal(L.avaliarRematricula({ ...base, faltasExcessivas: true }).status, 'PENDENTE_ACADEMICO')
assert.equal(L.avaliarRematricula({ ...base, statusAluno: 'TRANCADO' }).status, 'TRANCADA')
const ret = L.calcularRetencao([{ status: 'CONFIRMADA' }, { status: 'CONFIRMADA' }, { status: 'NAO_RENOVOU' }, { status: 'ELEGIVEL' }, { status: 'TRANCADA' }])
assert.equal(ret.base, 4)
assert.equal(ret.taxaRetencao, 50)
const lem = L.datasLembretesRematricula(new Date('2026-12-31'), new Date('2026-12-20'))
assert.deepEqual(lem.map((x) => x.offset), [7, 1])

// meses
assert.equal(L.somarMeses(new Date(2026, 0, 31), 1, 31).getDate(), 28)
console.log('admissoes selftest OK')
