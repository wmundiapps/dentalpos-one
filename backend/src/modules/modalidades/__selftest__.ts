import assert from 'node:assert/strict'
import * as R from './rules'

const d = (id: string, p: number, o: number, extra: any = {}) => ({ id, nome: id, cargaPresencial: p, cargaOnline: o, ...extra })

// Presencial até 40%
let c = R.avaliarConformidade({ modalidade: 'PRESENCIAL', disciplinas: [d('a', 60, 40), d('b', 100, 0)] })
assert.equal(c.percentualEad, 20); assert.ok(c.conforme)
c = R.avaliarConformidade({ modalidade: 'PRESENCIAL', disciplinas: [d('a', 50, 50)] })
assert.ok(!c.conforme); assert.ok(c.alertas.some((a) => a.codigo === 'PRESENCIAL_EXCEDE_EAD'))
c = R.avaliarConformidade({ modalidade: 'PRESENCIAL', disciplinas: [d('a', 50, 50)], regras: { maxPctEadPresencial: 50 } })
assert.ok(c.conforme)
// Semipresencial
c = R.avaliarConformidade({ modalidade: 'SEMIPRESENCIAL', disciplinas: [d('a', 30, 70)] })
assert.ok(c.alertas.some((a) => a.codigo === 'SEMI_PRESENCIAL_INSUFICIENTE') && c.alertas.some((a) => a.codigo === 'SEMI_EXCEDE_EAD'))
// EAD: encontros e avaliação presencial
c = R.avaliarConformidade({ modalidade: 'EAD', disciplinas: [d('a', 0, 80)] })
assert.ok(!c.conforme); assert.ok(c.alertas.some((a) => a.codigo === 'EAD_SEM_AVALIACAO_PRESENCIAL'))
c = R.avaliarConformidade({ modalidade: 'EAD', disciplinas: [d('a', 10, 70, { encontrosPresenciais: 1, avaliacoesPresenciais: 1 })], alunos: 200, tutores: 2 })
assert.ok(c.alertas.some((a) => a.codigo === 'TUTORIA_INSUFICIENTE'))
// Tutor
assert.deepEqual(R.relacaoAlunoTutor(100, 2, 50).status, 'OK')
const t = R.relacaoAlunoTutor(120, 2, 50); assert.equal(t.tutoresFaltantes, 1); assert.equal(t.status, 'ATENCAO')
assert.equal(R.relacaoAlunoTutor(10, 0, 50).status, 'CRITICO')
// SLA
const ab = new Date('2026-01-01T10:00:00Z')
const lim = R.slaLimite(ab, 'NORMAL', { slaRespostaHoras: 48, slaUrgenteHoras: 12 })
assert.equal(lim.toISOString(), '2026-01-03T10:00:00.000Z')
assert.equal(R.estadoSla(new Date('2026-01-04T00:00:00Z'), ab, lim).estado, 'VENCIDO')
assert.equal(R.estadoSla(new Date('2026-01-03T00:00:00Z'), ab, lim).estado, 'EM_RISCO')
assert.equal(R.estadoSla(new Date(), ab, lim, new Date('2026-01-02T00:00:00Z')).estado, 'CUMPRIDO')
// Risco
assert.equal(R.calcularRiscoEngajamento({ diasSemAcesso: 20, horas30d: 0, acessos30d: 1, tarefas30d: 0 }).nivel, 'CRITICO')
assert.equal(R.calcularRiscoEngajamento({ diasSemAcesso: 0, horas30d: 20, acessos30d: 30, tarefas30d: 5 }).nivel, 'BAIXO')
// Presença live
const i = new Date('2026-01-01T19:00:00Z'), f = new Date('2026-01-01T20:00:00Z')
const m = (h: number, mi: number) => new Date(Date.UTC(2026, 0, 1, h, mi))
let p = R.calcularPresencaLive([{ tipo: 'ENTRADA', em: m(19, 5) }, { tipo: 'SAIDA', em: m(19, 25) }, { tipo: 'ENTRADA', em: m(19, 30) }, { tipo: 'SAIDA', em: m(19, 55) }], i, f)
assert.equal(p.minutos, 45); assert.ok(p.presente)
p = R.calcularPresencaLive([{ tipo: 'ENTRADA', em: m(19, 40) }], i, f)
assert.equal(p.minutos, 20); assert.ok(!p.presente)
p = R.calcularPresencaLive([{ tipo: 'ENTRADA', em: m(18, 0) }, { tipo: 'ENTRADA', em: m(19, 10) }, { tipo: 'SAIDA', em: m(21, 0) }], i, f)
assert.equal(p.percentual, 100)
// Pós
assert.ok(!R.validarLato({ cargaHoraria: 300, modulos: [{ cargaHoraria: 300 }] }).conforme)
assert.ok(R.validarLato({ cargaHoraria: 360, modulos: [{ cargaHoraria: 180 }, { cargaHoraria: 180 }], docentes: [{ titulacao: 'MESTRE' }, { titulacao: 'ESPECIALISTA' }] }).conforme)
assert.ok(!R.capacidadeOrientador({ capacidadeOrientandos: 10, orientador: true }, 8, 8).podeOrientar)
assert.equal(R.capacidadeOrientador({ capacidadeOrientandos: 10, orientador: true }, 5, 8).livres, 3)
assert.equal(R.addMeses(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10), '2026-02-28')
const pz = R.calcularPrazosStricto(new Date('2026-03-01T00:00:00Z'), 24)
assert.equal(pz.prazoDeposito.toISOString().slice(0, 10), '2028-03-01')
assert.equal(pz.prazoQualificacao.toISOString().slice(0, 10), '2027-05-01')
const mc = R.marcosLembrete(new Date('2026-06-01T00:00:00Z'), new Date('2026-05-10T00:00:00Z'))
assert.deepEqual(mc.map((x) => x.diasAntes), [15, 7, 1]); assert.equal(mc[2].severity, 'CRITICO')
assert.ok(R.progressoStricto({ creditosCumpridos: 24, qualificadoEm: new Date(), defendidoEm: new Date(), depositadoEm: new Date() }, 24).aptoTitulacao)
assert.equal(R.progressoStricto({ creditosCumpridos: 12 }, 24).percentual, 13)
const h = R.resumoHorasPraticas([{ horas: 40, status: 'VALIDADA' }, { horas: 10, status: 'PENDENTE' }], 100)
assert.equal(h.faltam, 60)
assert.equal(R.ocupacaoPolo(100, 105).status, 'SUPERLOTADO')
assert.ok(R.resumoChecklist([{ obrigatorio: true, atendido: true }]).apto)
console.log('modalidades selftest OK')
