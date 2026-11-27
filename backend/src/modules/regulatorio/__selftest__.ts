import assert from 'node:assert/strict'
import * as R from './rules'

const d = (s: string) => new Date(s + 'T00:00:00Z')

// máquina de estados
assert.ok(R.transicaoValida('PREPARACAO', 'PROTOCOLADO'))
assert.ok(!R.transicaoValida('PREPARACAO', 'PUBLICADO'))
assert.ok(R.transicaoValida('DILIGENCIA', 'EM_ANALISE'))
assert.ok(!R.transicaoValida('PUBLICADO', 'EM_ANALISE'))

// janela de reconhecimento: curso 8 semestres (48 meses), início 2024-02-01
const ini = d('2024-02-01')
let j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, agora: d('2024-12-01') })
assert.equal(j.situacao, 'ANTES_DA_JANELA')
assert.ok(j.diasParaAbrir! > 0)
j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, agora: d('2026-06-01') }) // ~51%
assert.equal(j.situacao, 'JANELA_ABERTA')
assert.ok(j.percentualAtual >= 50 && j.percentualAtual < 75)
j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, agora: d('2027-01-01') })
assert.equal(j.situacao, 'JANELA_ENCERRANDO')
j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, agora: d('2027-03-01') })
assert.equal(j.situacao, 'JANELA_ENCERRADA')
j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, percentualCumprido: 60, agora: d('2025-01-01') })
assert.equal(j.situacao, 'JANELA_ABERTA')
assert.throws(() => R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 0 }))
// parametrizável
j = R.janelaReconhecimento({ inicioPrimeiraTurma: ini, duracaoSemestres: 8, percentualCumprido: 45, agora: d('2025-01-01') }, { inicioPct: 40, fimPct: 80 })
assert.equal(j.situacao, 'JANELA_ABERTA')

// status do ato
const hoje = d('2026-10-02')
assert.equal(R.statusAto(null, hoje).situacao, 'SEM_PRAZO')
assert.equal(R.statusAto(d('2026-09-01'), hoje).situacao, 'VENCIDO')
assert.equal(R.statusAto(d('2026-11-01'), hoje).situacao, 'VENCENDO')
assert.equal(R.statusAto(d('2027-02-01'), hoje).situacao, 'RENOVACAO_ABERTA')
assert.equal(R.statusAto(d('2028-01-01'), hoje).situacao, 'VIGENTE')
assert.equal(R.statusAto(d('2026-10-02'), hoje).diasRestantes, 0)
assert.equal(R.statusAto(d('2026-12-01'), hoje, { janelaRenovacaoDias: 30, vencendoDias: 10 }).situacao, 'VIGENTE')
assert.equal(R.proximoCiclo(d('2025-05-10'), 3).toISOString().slice(0, 10), '2028-05-10')
assert.equal(R.addMonths(d('2024-01-31'), 1).toISOString().slice(0, 10), '2024-02-29')

// marcos
const venc = d('2027-01-01')
let m = R.marcosAlerta(venc, hoje) // faltam 91 dias
assert.deepEqual(m.map((x) => x.dias), [180, 90, 60, 30, 15, 7])
assert.equal(m.find((x) => x.vigente)!.dias, 180)
assert.equal(m.filter((x) => !x.passado).length, 5)
assert.equal(R.marcosParaAgendar(venc, hoje).length, 6)
assert.equal(R.marcosParaAgendar(d('2026-01-01'), hoje).length, 0)
assert.equal(R.severidadePorDias(7), 'CRITICO')
assert.equal(R.severidadePorDias(60), 'ATENCAO')
assert.equal(R.severidadePorDias(180), 'INFO')

// prontidão
let p = R.prontidao([
  { status: 'ATENDIDO', peso: 2, dimensao: 'A' },
  { status: 'PENDENTE', peso: 2, dimensao: 'A', prazo: d('2026-01-01') },
  { status: 'NAO_APLICAVEL', peso: 10 },
  { status: 'EM_ANDAMENTO', peso: 1, dimensao: 'B', obrigatorio: false },
], hoje)
assert.equal(p.total, 3)
assert.equal(p.atrasados, 1)
assert.equal(p.obrigatoriosPendentes, 1)
assert.equal(p.percentual, Math.round(((2 + 0.3) / 5) * 1000) / 10)
assert.equal(R.prontidao([]).percentual, 0)
assert.equal(R.classificarRisco({ atoVencido: true, diligenciasVencidas: 1 }).risco, 'CRITICO')
assert.equal(R.classificarRisco({ prontidao: 90, diasParaPrazo: 300 }).risco, 'BAIXO')
assert.equal(R.classificarRisco({ prontidao: 30, diasParaPrazo: 40 }).risco, 'ALTO')

// CPC
const somaPesos = Object.values(R.PESOS_CPC).reduce((a, b) => a + b, 0)
assert.ok(Math.abs(somaPesos - 1) < 1e-9)
const base = { enade: 3, idd: 3, mestres: 3, doutores: 3, regime: 3, organizacaoDidatico: 3, infraestrutura: 3, oportunidades: 3 }
let c = R.simularCPC(base)
assert.equal(c.continuo, 3)
assert.equal(c.faixa, 4)
assert.equal(c.simulacao, true)
assert.ok(c.aviso.includes('SIMULAÇÃO'))
c = R.simularCPC({ ...base, enade: 2, idd: 2 }) // 3 - 0.55 - 0.35... = 2.45
assert.equal(c.faixa, 3)
assert.ok(c.paraSubir && c.paraSubir.proximaFaixa === 4)
assert.ok(c.paraSubir!.faltam > 0 && c.paraSubir!.caminho.length > 0)
// aplicar o caminho sugerido realmente sobe de faixa
const novo: any = { ...{ ...base, enade: 2, idd: 2 } }
for (const s of c.paraSubir!.caminho) novo[s.chave] = Math.min(5, s.paraNota + 0.01)
assert.ok(R.simularCPC(novo).faixa >= 4)
assert.equal(R.simularCPC({ ...base, enade: 5, idd: 5, mestres: 5, doutores: 5, regime: 5, organizacaoDidatico: 5, infraestrutura: 5, oportunidades: 5 }).paraSubir, null)
assert.equal(R.simularCPC({ enade: 0, idd: 0, mestres: 0, doutores: 0, regime: 0, organizacaoDidatico: 0, infraestrutura: 0, oportunidades: 0 }).faixa, 1)
assert.throws(() => R.simularCPC({ ...base, enade: 6 }))
assert.throws(() => R.simularCPC({ enade: 3 } as any))
assert.equal(R.faixaDeContinuo(0.944), 1)
assert.equal(R.faixaDeContinuo(0.945), 2)
assert.equal(R.faixaDeContinuo(3.945), 5)

// CC
let cc = R.simularCC({ organizacaoDidatico: 4, corpoDocente: 4, infraestrutura: 3 })
assert.equal(cc.continuo, 3.6)
assert.equal(cc.faixa, 4)
cc = R.simularCC({ organizacaoDidatico: 2, corpoDocente: 2, infraestrutura: 2 })
assert.equal(cc.faixa, 2)
assert.ok(cc.alerta)
assert.throws(() => R.simularCC({ organizacaoDidatico: 0, corpoDocente: 2, infraestrutura: 2 }))
assert.deepEqual(R.mediaIndicadores([{ dimensao: 'X', conceito: 4 }, { dimensao: 'X', conceito: 5 }, { dimensao: 'Y', conceito: null }]), { X: 4.5 })

// análise heurística
const txt = `PORTARIA Nº 123/2026. Fica reconhecido o curso de Odontologia. A instituição deverá apresentar o relatório de adequação no prazo de 30 (trinta) dias. Deverá regularizar o PPC até 15/12/2026. Texto qualquer sem relevância para o teste.`
const a = R.analisarDocumentoHeuristico(txt)
assert.equal(a.numeroAto, '123/2026')
assert.ok(a.prazos.some((x) => x.dias === 30))
assert.ok(a.prazos.some((x) => x.data === '2026-12-15'))
assert.ok(a.exigencias.length >= 2)
assert.ok(a.tarefasSugeridas.length >= 2)
assert.equal(R.isoDeBR('31', '02', '2026'), undefined)
const cf = R.conferenciaHeuristica('Regimento institucional aprovado pelo CONSUP', 'REGIMENTO INSTITUCIONAL aprovado em reunião do CONSUP')
assert.equal(cf.atende, true)
assert.equal(R.conferenciaHeuristica('Laudo de acessibilidade arquitetônica', 'Cardápio do restaurante universitário').atende, false)

console.log('regulatorio selftest OK')
