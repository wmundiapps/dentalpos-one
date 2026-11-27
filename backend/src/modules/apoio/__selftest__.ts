import assert from 'assert'
import * as L from './logic'

// risco
const bom = L.calcularRisco({ faltasPercent: 3, mediaNotas: 8.5, avaliacoesAbaixoMedia: 0, avaliacoesTotal: 6, diasMaiorAtraso: 0, parcelasVencidas: 0, diasSemAtividade: 2, requerimentoTrancamento: false })
assert.equal(bom.nivel, 'BAIXO'); assert.equal(bom.score, 0); assert.equal(bom.confianca, 1)
const ruim = L.calcularRisco({ faltasPercent: 45, mediaNotas: 3.5, avaliacoesAbaixoMedia: 5, avaliacoesTotal: 6, diasMaiorAtraso: 80, parcelasVencidas: 3, diasSemAtividade: 40, requerimentoTrancamento: false })
assert.equal(ruim.nivel, 'CRITICO'); assert.ok(ruim.score >= 90); assert.ok(ruim.acoesSugeridas.length >= 4)
const tranc = L.calcularRisco({ requerimentoTrancamento: true })
assert.ok(tranc.score >= 55 && tranc.score < 75 && tranc.nivel === 'ALTO', String(tranc.score)); assert.ok(tranc.confianca < 0.2)
const vazio = L.calcularRisco({}); assert.equal(vazio.score, 0); assert.equal(vazio.confianca, 0)
const medio = L.calcularRisco({ faltasPercent: 20, mediaNotas: 6, diasMaiorAtraso: 15, parcelasVencidas: 1, diasSemAtividade: 10 })
assert.ok(medio.score > 15 && medio.score < 60, String(medio.score))
assert.equal(L.prazoContatoDias('CRITICO'), 2)

// bolsas
assert.equal(L.rendaPerCapita(3000, 4), 750)
assert.throws(() => L.rendaPerCapita(1000, 0))
const prog = { rendaPerCapitaMaxSM: 1.5, mediaMinima: 6, frequenciaMinima: 75, tipo: 'SOCIOECONOMICA' }
const a = L.avaliarInscricaoBolsa(prog, { rendaPerCapita: 800, mediaAtual: 7, frequenciaAtual: 90, condicoes: { cadUnico: true } }, { salarioMinimo: 1600 })
assert.ok(a.elegivel && a.pontuacao > 40, JSON.stringify(a))
const b = L.avaliarInscricaoBolsa(prog, { rendaPerCapita: 3000, mediaAtual: 5 }, { salarioMinimo: 1600 })
assert.ok(!b.elegivel && b.pendencias.length >= 2)
const c = L.avaliarInscricaoBolsa(prog, { rendaPerCapita: 500, mediaAtual: 7, documentosExigidos: ['RG'], documentosEnviados: [] }, { salarioMinimo: 1600 })
assert.ok(c.elegivel && c.pendencias.length === 1)
const cl = L.classificarInscricoes([
  { id: '1', pontuacao: 70, rendaPerCapita: 500, elegivel: true, createdAt: new Date(2026, 0, 1) },
  { id: '2', pontuacao: 70, rendaPerCapita: 400, elegivel: true, createdAt: new Date(2026, 0, 2) },
  { id: '3', pontuacao: 50, rendaPerCapita: 400, elegivel: true, createdAt: new Date(2026, 0, 2) },
  { id: '4', pontuacao: 99, rendaPerCapita: 9000, elegivel: false, createdAt: new Date(2026, 0, 2) },
], 2)
assert.deepEqual(cl.deferidas.map((x) => x.id), ['2', '1']); assert.deepEqual(cl.listaEspera.map((x) => x.id), ['3']); assert.equal(cl.indeferidas.length, 1)
const jr = L.janelaRenovacao(new Date('2026-12-31'), 30, new Date('2026-12-10')); assert.equal(jr.estado, 'ABERTA')
assert.equal(L.janelaRenovacao(new Date('2026-12-31'), 30, new Date('2026-10-01')).estado, 'AGUARDANDO')
assert.equal(L.pontuacaoMonitoria(9, 8), 9 * 6 + 8 * 4)

// estágio
const base = { tipo: 'NAO_OBRIGATORIO' as const, inicio: new Date('2026-03-01'), fim: new Date('2027-03-01'), jornadaDiariaHoras: 6, cargaSemanalHoras: 30, bolsaValor: 1200, auxilioTransporte: 200, apoliceSeguro: 'AP-1', orientadorUserId: 'u1', supervisorNome: 'Fulano' }
assert.deepEqual(L.validarTermoEstagio(base).erros, [])
assert.ok(L.validarTermoEstagio({ ...base, jornadaDiariaHoras: 8, cargaSemanalHoras: 40 }).erros.length === 2)
assert.equal(L.validarTermoEstagio({ ...base, jornadaDiariaHoras: 8, cargaSemanalHoras: 40, semAulasNoPeriodo: true }).erros.length, 0)
assert.ok(L.validarTermoEstagio({ ...base, fim: new Date('2029-01-01') }).erros.some((e) => e.includes('2 anos')))
assert.equal(L.validarTermoEstagio({ ...base, fim: new Date('2029-01-01'), alunoPcd: true }).erros.length, 0)
assert.ok(L.validarTermoEstagio({ ...base, bolsaValor: 0 }).erros.length === 1)
assert.ok(L.validarTermoEstagio({ ...base, apoliceSeguro: null, orientadorUserId: null }).erros.length === 2)
assert.ok(L.validarTermoEstagio({ ...base, convenioFim: new Date('2026-06-01') }).erros.length === 1)
const rel = L.prazosRelatoriosEstagio(new Date('2026-03-01'), new Date('2027-09-01'))
assert.deepEqual(rel.map((r) => r.tipo), ['PARCIAL', 'PARCIAL', 'FINAL'])
assert.equal(L.prazosRelatoriosEstagio(new Date('2026-03-01'), new Date('2026-06-01')).length, 1)

// ocorrência
assert.equal(L.validarTransicaoOcorrencia('NOTIFICADA', { status: 'REGISTRADA', gravidade: 'LEVE' }), null)
assert.ok(L.validarTransicaoOcorrencia('DECIDIDA', { status: 'REGISTRADA', gravidade: 'LEVE' }))
const agora = new Date('2026-05-10')
assert.ok(L.validarTransicaoOcorrencia('EM_JULGAMENTO', { status: 'NOTIFICADA', gravidade: 'GRAVE', prazoDefesaEm: new Date('2026-05-15'), agora }))
assert.equal(L.validarTransicaoOcorrencia('EM_JULGAMENTO', { status: 'NOTIFICADA', gravidade: 'GRAVE', prazoDefesaEm: new Date('2026-05-05'), agora }), null)
assert.ok(L.validarTransicaoOcorrencia('CONCLUIDA', { status: 'DECIDIDA', gravidade: 'GRAVE', prazoRecursoEm: new Date('2026-05-15'), agora }))
assert.ok(L.validarTransicaoOcorrencia('EM_RECURSO', { status: 'DECIDIDA', gravidade: 'GRAVE', prazoRecursoEm: new Date('2026-05-01'), agora }))
assert.ok(L.validarSancao('LEVE', 'DESLIGAMENTO'))
assert.ok(L.validarSancao('MEDIA', 'SUSPENSAO', 10, 'x'.repeat(30)))
assert.equal(L.validarSancao('GRAVE', 'SUSPENSAO', 10, 'x'.repeat(30)), null)
assert.ok(L.validarSancao('GRAVISSIMA', 'DESLIGAMENTO', null, 'curta'))
assert.equal(L.validarSancao('GRAVISSIMA', 'DESLIGAMENTO', null, 'fundamentação completa do caso'), null)
// dias úteis: sexta + 1 = segunda
assert.equal(L.addBusinessDays(new Date('2026-05-08T12:00:00Z'), 1).toISOString().slice(0, 10), '2026-05-11')

// NPS e agregação
const nps = L.calcularNps([10, 10, 9, 8, 7, 3, 0]); assert.equal(nps.promotores, 3); assert.equal(nps.detratores, 2); assert.equal(nps.nps, 14)
assert.equal(L.calcularNps([]).nps, null)
const perg: L.PerguntaInst[] = [{ id: 'q1', texto: 'Didática', tipo: 'ESCALA', obrigatoria: true }, { id: 'q2', texto: 'Indica?', tipo: 'NPS' }, { id: 'q3', texto: 'Coment', tipo: 'TEXTO' }, { id: 'q4', texto: 'Pontual?', tipo: 'SIM_NAO' }]
assert.ok(L.validarRespostas(perg, {}, 5)); assert.ok(L.validarRespostas(perg, { q1: 6 }, 5)); assert.equal(L.validarRespostas(perg, { q1: 5, q2: 10, q4: true }, 5), null)
const dados = [5, 4, 4, 3, 5].map((v, i) => ({ respostas: { q1: v, q2: 10 - i, q4: i % 2 === 0 }, nps: 10 - i, comentario: i === 0 ? 'ótimo' : null }))
const ag: any = L.agregarRespostas(perg, dados, 5, 10)
assert.equal(ag.suprimido, false); assert.equal(ag.mediaGeral, 4.2); assert.equal(ag.taxaResposta, 50); assert.deepEqual(ag.comentarios, ['ótimo'])
const sup: any = L.agregarRespostas(perg, dados.slice(0, 3), 5); assert.equal(sup.suprimido, true); assert.equal(sup.porPergunta, undefined)

// ouvidoria
const p = L.gerarProtocolo(2026, 123); assert.ok(L.protocoloValido(p), p); assert.ok(!L.protocoloValido(p.slice(0, -1) + ((Number(p.slice(-1)) + 1) % 10)))
const s = L.gerarSenhaAcompanhamento(); assert.equal(s.length, 8)
const h = L.hashSenha(s); assert.ok(L.verificarSenha(s.toLowerCase(), h.hash, h.salt)); assert.ok(!L.verificarSenha('ZZZZZZZZ', h.hash, h.salt))
const cr = new Date('2026-01-01'), pr = new Date('2026-01-31')
assert.equal(L.estadoSla(cr, pr, new Date('2026-01-10')).estado, 'NO_PRAZO')
assert.equal(L.estadoSla(cr, pr, new Date('2026-01-27')).estado, 'ATENCAO')
const ven = L.estadoSla(cr, pr, new Date('2026-02-03')); assert.equal(ven.estado, 'VENCIDA'); assert.equal(ven.nivelEscalonamento, 1)
assert.equal(L.estadoSla(cr, pr, new Date('2026-02-10')).nivelEscalonamento, 2)
const agm = L.agregarManifestacoes([
  { tipo: 'RECLAMACAO', status: 'ENCERRADA', setorId: 's1', criadoEm: new Date('2026-01-01'), prazoEm: new Date('2026-01-31'), respondidaEm: new Date('2026-01-11'), avaliacaoNota: 5 },
  { tipo: 'ELOGIO', status: 'ENCERRADA', setorId: 's1', criadoEm: new Date('2026-01-01'), prazoEm: new Date('2026-01-31'), respondidaEm: new Date('2026-02-10'), avaliacaoNota: 3, anonima: true },
  { tipo: 'DENUNCIA', status: 'EM_ANALISE', criadoEm: new Date('2025-01-01'), prazoEm: new Date('2025-01-31') },
])
assert.equal(agm.total, 3); assert.equal(agm.tempoMedioRespostaDias, 25); assert.equal(agm.percentualNoPrazo, 50); assert.equal(agm.abertasVencidas, 1); assert.equal(agm.satisfacaoMedia, 4); assert.equal(agm.anonimas, 1)

// egressos
const ind = L.calcularIndicadoresEgressos([
  { situacaoProfissional: 'EMPREGADO', atuaNaArea: true, anoConclusao: 2024, primeiroEmpregoEm: new Date('2025-03-01'), faixaSalarial: '2_5sm' },
  { situacaoProfissional: 'EMPREGADO', atuaNaArea: false, cursandoPos: true },
  { situacaoProfissional: 'DESEMPREGADO' },
  { situacaoProfissional: 'NAO_INFORMADO' },
])
assert.equal(ind.total, 4); assert.equal(ind.informados, 3); assert.equal(ind.taxaInsercao, 66.7); assert.equal(ind.taxaAtuacaoNaArea, 50); assert.equal(ind.taxaInformacao, 75)
assert.ok(ind.tempoMedioPrimeiroEmpregoMeses! > 1 && ind.tempoMedioPrimeiroEmpregoMeses! < 3)
assert.equal(L.adaptacaoTempoExtra(100, 50), 150); assert.equal(L.estadoPlanoAee(new Date('2020-01-01'), 'VIGENTE'), 'VENCIDO')
console.log('apoio selftest OK')
