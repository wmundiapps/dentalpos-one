import assert from 'node:assert/strict'
import {
  addBusinessDays, alocarRegistro, analisarDocumentoHeuristica, avaliarAptidaoFormando, businessDaysBetween, calcularEliminacao,
  consolidarConferencia, extrairDatas, formatNumero, gerarCodigoVerificacao, mascararCpf, normalizarCodigo, normalizarSituacao,
  novoPrazoAposPendencia, parseNumero, podeTransitar, podeTransitarDiploma, renderTemplate, resumoHistorico, sha256, situacaoDisciplina,
  slaSituacao, statusArquivoCalculado, exigeParecer,
} from './logic'

// numeração
assert.equal(formatNumero(2026, 123), '2026/000123')
assert.deepEqual(parseNumero('2026/000123'), { ano: 2026, seq: 123 })
assert.equal(parseNumero('abc'), null)

// dias úteis: sexta 2026-10-02 + 1 útil = segunda 05/10; + 5 = sexta 09/10; feriado 07/10 empurra
const sex = new Date('2026-10-02T12:00:00Z')
assert.equal(addBusinessDays(sex, 1).toISOString().slice(0, 10), '2026-10-05')
assert.equal(addBusinessDays(sex, 5).toISOString().slice(0, 10), '2026-10-09')
assert.equal(addBusinessDays(sex, 5, ['2026-10-07']).toISOString().slice(0, 10), '2026-10-12')
assert.equal(addBusinessDays(sex, 0).getTime(), sex.getTime())
assert.equal(businessDaysBetween(sex, new Date('2026-10-09T12:00:00Z')), 5)

// SLA
const agora = new Date('2026-10-10T12:00:00Z')
assert.equal(slaSituacao(new Date('2026-10-09T12:00:00Z'), agora).nivel, 'ATRASADO')
assert.equal(slaSituacao(new Date('2026-10-11T12:00:00Z'), agora).nivel, 'VENCENDO')
assert.equal(slaSituacao(new Date('2026-10-20T12:00:00Z'), agora).nivel, 'OK')
assert.equal(slaSituacao(new Date('2026-10-01T12:00:00Z'), agora, true).atrasado, false)
// pausa do SLA
assert.equal(novoPrazoAposPendencia(new Date('2026-10-10T00:00:00Z'), new Date('2026-10-02T00:00:00Z'), new Date('2026-10-05T00:00:00Z')).toISOString(), '2026-10-13T00:00:00.000Z')

// máquina de estados do protocolo
assert.ok(podeTransitar('ABERTO', 'EM_ANALISE'))
assert.ok(podeTransitar('EM_ANALISE', 'DEFERIDO'))
assert.ok(podeTransitar('DEFERIDO', 'CONCLUIDO'))
assert.ok(!podeTransitar('ABERTO', 'CONCLUIDO'))
assert.ok(!podeTransitar('CONCLUIDO', 'EM_ANALISE'))
assert.ok(!podeTransitar('CANCELADO', 'ABERTO'))
assert.ok(exigeParecer('INDEFERIDO') && !exigeParecer('EM_ANALISE'))

// código de verificação
const cod = gerarCodigoVerificacao()
assert.match(cod, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
assert.ok(!/[01OI]/.test(cod))
assert.equal(new Set(Array.from({ length: 200 }, () => gerarCodigoVerificacao())).size, 200)
assert.equal(normalizarCodigo(' abcd efgh-jklm '), 'ABCD-EFGH-JKLM')
assert.equal(sha256('a').length, 64)
assert.equal(mascararCpf('123.456.789-09'), '***.456.789-**')

// template (escape de XSS)
assert.equal(renderTemplate('Olá {{nome}} {{x}}', { nome: '<b>"Ana"</b>' }), 'Olá &lt;b&gt;&quot;Ana&quot;&lt;/b&gt; ')
assert.equal(renderTemplate('{{{html}}}', {}, { html: '<i>ok</i>' }), '<i>ok</i>')

// conferência
const I = (obrigatorio: boolean, status: any, motivo?: string) => ({ obrigatorio, status, motivo })
assert.equal(consolidarConferencia([I(true, 'APROVADO'), I(false, 'PENDENTE')]).status, 'APROVADA')
assert.equal(consolidarConferencia([I(true, 'APROVADO'), I(true, 'PENDENTE')]).status, 'EM_ANDAMENTO')
assert.equal(consolidarConferencia([I(true, 'APROVADO'), I(true, 'REJEITADO', 'ilegível')]).status, 'PENDENTE')
assert.equal(consolidarConferencia([I(true, 'REJEITADO', 'DEFINITIVO: falso')]).status, 'REPROVADA')
assert.equal(consolidarConferencia([I(true, 'APROVADO'), I(false, 'REJEITADO', 'x')]).status, 'APROVADA')
assert.equal(consolidarConferencia([I(true, 'APROVADO'), I(true, 'PENDENTE')]).percentual, 50)

// análise heurística
const now = new Date('2026-10-02T00:00:00Z')
assert.deepEqual(extrairDatas('emitido em 15/09/2026 e 2026-01-02').map((d) => d.toISOString().slice(0, 10)).sort(), ['2026-01-02', '2026-09-15'])
const a1 = analisarDocumentoHeuristica({ texto: 'Comprovante de residência de MARIA SILVA, Rua A, 100, emitido em 15/09/2026', validadeDias: 90, nomeEsperado: 'Maria Silva', requisitos: 'endereço, data', now })
assert.equal(a1.validade, 'OK')
assert.ok(a1.inconsistencias.every((i) => !/vencida/.test(i)))
const a2 = analisarDocumentoHeuristica({ texto: 'Comprovante de residência de MARIA SILVA emitido em 01/01/2025', validadeDias: 90, nomeEsperado: 'Maria Silva', now })
assert.equal(a2.validade, 'VENCIDO')
assert.equal(a2.parecer, 'REJEITADO')
const a3 = analisarDocumentoHeuristica({ texto: 'Documento de JOSE PEREIRA 10/09/2026 comprovante residência', validadeDias: 90, nomeEsperado: 'Maria Silva', now })
assert.equal(a3.parecer, 'REJEITADO')
assert.equal(analisarDocumentoHeuristica({ texto: '', now }).parecer, 'PENDENTE')

// diploma
assert.ok(podeTransitarDiploma('SOLICITADO', 'CONFERENCIA'))
assert.ok(!podeTransitarDiploma('SOLICITADO', 'REGISTRO'))
assert.ok(podeTransitarDiploma('REGISTRADO', 'ENTREGUE'))
assert.ok(!podeTransitarDiploma('ENTREGUE', 'CANCELADO'))
assert.deepEqual(alocarRegistro({ proximoRegistro: 1, registrosPorFolha: 2 }), { numero: 1, folha: 1, proximoRegistro: 2 })
assert.deepEqual(alocarRegistro({ proximoRegistro: 3, registrosPorFolha: 2 }), { numero: 3, folha: 2, proximoRegistro: 4 })
assert.equal(alocarRegistro({ proximoRegistro: 4, registrosPorFolha: 2 }).folha, 2)

// aptidão de formando
assert.equal(avaliarAptidaoFormando({ cargaHorariaExigida: 3200, cargaHorariaCursada: 3200, disciplinasPendentes: 0 }).apto, true)
const ap = avaliarAptidaoFormando({ cargaHorariaExigida: 3200, cargaHorariaCursada: 3000, disciplinasPendentes: 2, statusAluno: 'TRANCADO', conferenciaStatus: 'PENDENTE', financeiroPendente: 1 })
assert.equal(ap.apto, false)
assert.equal(ap.pendencias.length, 5)

// histórico
assert.equal(situacaoDisciplina(7, 80), 'APROVADO')
assert.equal(situacaoDisciplina(5, 90), 'REPROVADO')
assert.equal(situacaoDisciplina(9, 60), 'REPROVADO POR FALTAS')
assert.equal(situacaoDisciplina(null, null), 'EM CURSO')
assert.equal(normalizarSituacao('REPROVADO_FREQ'), 'REPROVADO POR FALTAS')
assert.equal(normalizarSituacao('REPROVADO_NOTA'), 'REPROVADO')
assert.equal(normalizarSituacao('RECUPERACAO'), 'EM CURSO')
const r = resumoHistorico([
  { disciplina: 'A', cargaHoraria: 60, nota: 8, situacao: 'APROVADO' },
  { disciplina: 'B', cargaHoraria: 40, nota: 5, situacao: 'REPROVADO' },
  { disciplina: 'C', cargaHoraria: 80, nota: null, situacao: 'EM CURSO' },
])
assert.equal(r.cargaHorariaCursada, 60)
assert.equal(r.disciplinasEmCurso, 1)
assert.equal(r.disciplinasReprovadas, 1)
assert.equal(r.coeficienteRendimento, 6.8) // (8*60+5*40)/100

// arquivo / temporalidade
const enc = new Date('2020-03-10T00:00:00Z')
assert.equal(calcularEliminacao(enc, 5, 5, 'ELIMINACAO')?.toISOString().slice(0, 10), '2030-03-10')
assert.equal(calcularEliminacao(enc, 5, 5, 'GUARDA_PERMANENTE'), null)
assert.equal(statusArquivoCalculado('ATIVO', 'ELIMINACAO', new Date('2030-03-10'), new Date('2026-10-02')), 'ATIVO')
assert.equal(statusArquivoCalculado('ATIVO', 'ELIMINACAO', new Date('2026-01-01'), new Date('2026-10-02')), 'ELEGIVEL_DESCARTE')
assert.equal(statusArquivoCalculado('SUSPENSO', 'ELIMINACAO', new Date('2026-01-01'), new Date('2026-10-02')), 'SUSPENSO')
assert.equal(statusArquivoCalculado('ATIVO', 'GUARDA_PERMANENTE', null), 'GUARDA_PERMANENTE')

console.log('secretaria selftest: OK')
