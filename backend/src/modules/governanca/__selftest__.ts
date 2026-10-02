import assert from 'node:assert/strict'
import { percentualMeta, execucaoPdi, semaforo, proximaColeta, fracaoTempo } from './pdiLogic'
import { agregarCpa } from './cpaLogic'
import { validarNde } from './ndeLogic'
import { apurar, quorumNecessario, formatarNumeracao } from './colegiadoLogic'
import { simularProgressao, transicaoValida } from './carreiraLogic'
import { pontuacaoRisco, prazoCat, reunioesMensaisFaltantes, fimGestao } from './cipaLogic'

// PDI
assert.equal(percentualMeta({ linhaBase: 50, valorMeta: 80, valorAtual: 65 }), 50)
assert.equal(percentualMeta({ linhaBase: 20, valorMeta: 10, valorAtual: 15, sentido: 'MENOR_MELHOR' }), 50)
assert.equal(percentualMeta({ linhaBase: 10, valorMeta: 20, valorAtual: 30 }), 100)
assert.equal(percentualMeta({ linhaBase: 10, valorMeta: 20, valorAtual: 5 }), 0)
assert.equal(percentualMeta({ linhaBase: 10, valorMeta: 20, valorAtual: null }), 0)
const ex = execucaoPdi([{ id: 'e1', peso: 1, objetivos: [{ id: 'o1', peso: 1, metas: [
  { id: 'm1', peso: 1, linhaBase: 0, valorMeta: 10, valorAtual: 10 }, { id: 'm2', peso: 3, linhaBase: 0, valorMeta: 10, valorAtual: 0 }] }] }])
assert.equal(ex.percentual, 25)
assert.equal(semaforo(100, 50), 'VERDE'); assert.equal(semaforo(46, 50), 'VERDE'); assert.equal(semaforo(35, 50), 'AMARELO'); assert.equal(semaforo(10, 50), 'VERMELHO'); assert.equal(semaforo(0, 0, true), 'CINZA')
assert.equal(proximaColeta(new Date('2026-01-31T00:00:00Z'), 'MENSAL').toISOString().slice(0, 10), '2026-02-28')
assert.equal(fracaoTempo(new Date('2026-01-01'), new Date('2026-01-11'), new Date('2026-01-06')), 0.5)

// CPA: anonimato
const perguntas = [{ id: 'p1', eixo: 1, dimensao: 8, tipo: 'LIKERT5' as const }, { id: 'p2', eixo: 5, dimensao: 7, tipo: 'SIM_NAO' as const }]
const rs = (seg: string, n: number, v: number) => Array.from({ length: n }, () => ({ segmento: seg, programId: 'c1', itens: [{ perguntaId: 'p1', valor: v }, { perguntaId: 'p2', valor: 1 }] }))
const ag = agregarCpa([...rs('DISCENTE', 6, 5), ...rs('DOCENTE', 2, 1)], perguntas, 5)
assert.equal(ag.porEixo['1'].suprimido, false); assert.equal(ag.porEixo['1'].n, 8)
assert.equal(ag.porEixo['1'].media, 4); assert.equal(ag.porEixoSegmento['1'].DOCENTE.suprimido, true)
assert.equal(ag.porEixoSegmento['1'].DOCENTE.media, null); assert.equal(ag.porEixoSegmento['1'].DISCENTE.indice, 100)
assert.equal(ag.porEixo['5'].indice, 100)
assert.equal(agregarCpa(rs('DOCENTE', 4, 3), perguntas, 5).porEixo['1'].suprimido, true)

// NDE
const hoje = new Date('2026-06-01T00:00:00Z')
const m = (t: any, r: any, ini = '2025-01-01', extra = {}) => ({ titulacao: t, regime: r, inicio: new Date(ini), ...extra })
const ok = validarNde([m('DOUTOR', 'INTEGRAL', '2024-01-01', { presidente: true }), m('MESTRE', 'PARCIAL', '2024-09-01'), m('MESTRE', 'PARCIAL', '2025-03-01'), m('DOUTOR', 'HORISTA', '2025-09-01'), m('ESPECIALISTA', 'PARCIAL', '2026-01-01')], hoje)
assert.equal(ok.conforme, true); assert.equal(ok.metricas.pctStricto, 80); assert.equal(ok.metricas.pctIntegral, 20)
const ruim = validarNde([m('MESTRE', 'PARCIAL'), m('ESPECIALISTA', 'HORISTA'), m('GRADUADO', 'HORISTA')], hoje)
assert.equal(ruim.conforme, false)
for (const c of ['MIN_MEMBROS', 'STRICTO_SENSU', 'TEMPO_INTEGRAL']) assert.ok(ruim.violacoes.some((v) => v.codigo === c), c)
const bloco = validarNde(Array.from({ length: 5 }, () => m('DOUTOR', 'INTEGRAL', '2024-01-01', { presidente: true })), hoje)
assert.ok(bloco.violacoes.some((v) => v.codigo === 'RENOVACAO_PARCIAL'))
const venc = validarNde([m('DOUTOR', 'INTEGRAL', '2020-01-01')], hoje)
assert.ok(venc.violacoes.some((v) => v.codigo === 'MANDATO_VENCIDO'))

// Colegiado
assert.equal(quorumNecessario(10, 50), 6); assert.equal(quorumNecessario(9, 50), 5); assert.equal(quorumNecessario(10, 30), 3)
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 5, votos: [], quorumPercent: 50 }).resultado, 'SEM_QUORUM')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'FAVOR', 'FAVOR', 'CONTRA', 'ABSTENCAO', 'FAVOR'], quorumPercent: 50 }).resultado, 'APROVADA')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'CONTRA', 'CONTRA', 'CONTRA', 'ABSTENCAO', 'CONTRA'], quorumPercent: 50 }).resultado, 'REJEITADA')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'FAVOR', 'FAVOR', 'CONTRA', 'CONTRA', 'CONTRA'], quorumPercent: 50 }).resultado, 'EMPATE')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'CONTRA'], quorumPercent: 50 }).resultado, 'EM_ABERTO')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'FAVOR', 'FAVOR', 'FAVOR'], quorumPercent: 50 }).resultado, 'APROVADA')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 7, votos: ['FAVOR', 'FAVOR', 'FAVOR', 'FAVOR', 'FAVOR', 'FAVOR', 'CONTRA'], quorumPercent: 50, maioria: 'ABSOLUTA' }).resultado, 'APROVADA')
assert.equal(apurar({ totalComVoto: 10, presentesComVoto: 6, votos: ['FAVOR', 'FAVOR', 'FAVOR', 'FAVOR', 'CONTRA', 'CONTRA'], quorumPercent: 50, maioria: 'ABSOLUTA' }).resultado, 'REJEITADA')
assert.equal(formatarNumeracao(3, 2026), '003/2026')

// Carreira
const niveis = [
  { id: 'a', codigo: 'A1', nome: 'Assistente I', ordem: 1, titulacaoMinima: 'ESPECIALISTA' as const, intersticioMeses: 0, pontuacaoMinima: 0, avaliacaoMinima: 0, salarioBase: 5000 },
  { id: 'b', codigo: 'B1', nome: 'Adjunto I', ordem: 2, titulacaoMinima: 'MESTRE' as const, intersticioMeses: 24, pontuacaoMinima: 100, avaliacaoMinima: 7, salarioBase: 6500 },
]
const sim = simularProgressao({ niveis, nivelAtualId: 'a', servidor: { inicioNivel: new Date('2023-01-01'), titulacao: 'MESTRE', pontuacao: 120, avaliacao: 8 }, now: hoje })
assert.equal(sim.elegivel, true); assert.equal(sim.impacto?.diferenca, 1500); assert.equal(sim.impacto?.percentual, 30)
const sim2 = simularProgressao({ niveis, nivelAtualId: 'a', servidor: { inicioNivel: new Date('2025-06-01'), titulacao: 'ESPECIALISTA', pontuacao: 50, avaliacao: 6 }, now: hoje })
assert.equal(sim2.elegivel, false); assert.equal(sim2.faltantes.length, 4)
assert.equal(simularProgressao({ niveis, nivelAtualId: 'b', servidor: { inicioNivel: hoje, pontuacao: 0, avaliacao: 0 }, now: hoje }).nivelDestino, null)
assert.ok(transicaoValida('SOLICITADA', 'EM_ANALISE')); assert.ok(!transicaoValida('SOLICITADA', 'DEFERIDA')); assert.ok(!transicaoValida('EFETIVADA', 'CANCELADA'))

// CIPA
assert.deepEqual(pontuacaoRisco(5, 4), { pontuacao: 20, nivel: 'CRITICO' }); assert.equal(pontuacaoRisco(1, 1).nivel, 'BAIXO'); assert.equal(pontuacaoRisco(3, 3).nivel, 'MEDIO')
// sexta 2026-06-05 -> segunda 2026-06-08
assert.equal(prazoCat({ data: new Date('2026-06-05T12:00:00Z'), vinculo: 'EMPREGADO', tipo: 'TIPICO', gravidade: 'LEVE' }).prazo?.toISOString().slice(0, 10), '2026-06-08')
assert.equal(prazoCat({ data: new Date('2026-06-05T12:00:00Z'), vinculo: 'ALUNO', tipo: 'TIPICO', gravidade: 'LEVE' }).obrigatoria, false)
assert.equal(prazoCat({ data: new Date('2026-06-05T12:00:00Z'), vinculo: 'EMPREGADO', tipo: 'TIPICO', gravidade: 'FATAL' }).prazo?.toISOString().slice(0, 10), '2026-06-05')
assert.equal(fimGestao(new Date('2026-01-01T00:00:00Z')).toISOString().slice(0, 10), '2026-12-31')
assert.deepEqual(reunioesMensaisFaltantes(new Date('2026-01-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z'), ['2026-01', '2026-03'], new Date('2026-04-15T00:00:00Z')), ['2026-02'])

console.log('governanca selftest: OK')
