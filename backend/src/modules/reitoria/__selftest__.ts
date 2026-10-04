import assert from 'node:assert/strict'
import {
  TTLCache, alertas, calcularNps, categoriasDaPergunta, checkinDesatualizado, confiancaDoStatus, diasAtraso, mesaItem, montarIndicador,
  ordenarMesa, perfilDoPapel, podeVerPerfil, progressoKR, progressoObjetivo, resumirMesa, resumoHeuristico, resumoSemaforos,
  semaforoContagem, semaforoPorLimites, statusKR, toCsv, urgenciaScore, variacao, variacaoFavoravel, fmtValor,
} from './logic'
import { semaforoPorRazao, DEFS, selecionarDefs } from './indicators'
import { limitarTaxa, citados } from './assistente'
import { MODELOS_OKR } from './routes'

// semáforos
assert.equal(semaforoPorLimites(4, { sentido: 'MENOR_MELHOR', verde: 5, amarelo: 10 }), 'VERDE')
assert.equal(semaforoPorLimites(10, { sentido: 'MENOR_MELHOR', verde: 5, amarelo: 10 }), 'AMARELO')
assert.equal(semaforoPorLimites(11, { sentido: 'MENOR_MELHOR', verde: 5, amarelo: 10 }), 'VERMELHO')
assert.equal(semaforoPorLimites(85, { sentido: 'MAIOR_MELHOR', verde: 80, amarelo: 60 }), 'VERDE')
assert.equal(semaforoPorLimites(null, { sentido: 'MAIOR_MELHOR', verde: 80, amarelo: 60 }), 'CINZA')
assert.equal(semaforoPorLimites(5, { sentido: 'NEUTRO', verde: 1, amarelo: 1 }), 'CINZA')
assert.equal(semaforoContagem(0), 'VERDE'); assert.equal(semaforoContagem(3), 'AMARELO'); assert.equal(semaforoContagem(9), 'VERMELHO')
assert.equal(semaforoPorRazao(90, 100), 'AMARELO'); assert.equal(semaforoPorRazao(100, 100), 'VERDE'); assert.equal(semaforoPorRazao(50, 100), 'VERMELHO')
assert.equal(semaforoPorRazao(100, 100, 'MENOR_MELHOR', { verde: 1.05, amarelo: 1.2 }), 'VERDE')
assert.equal(semaforoPorRazao(130, 100, 'MENOR_MELHOR', { verde: 1.05, amarelo: 1.2 }), 'VERMELHO')
assert.equal(semaforoPorRazao(5, 0), 'VERDE'); assert.equal(semaforoPorRazao(null, 3), 'CINZA')

// variação
const v = variacao(110, 100)
assert.deepEqual([v.abs, v.pct, v.tendencia], [10, 10, 'SOBE'])
assert.equal(variacao(100, 100).tendencia, 'ESTAVEL')
assert.equal(variacao(5, 0).pct, null); assert.equal(variacao(0, 0).pct, 0)
assert.equal(variacao(null, 3).tendencia, null)
assert.equal(variacaoFavoravel('SOBE', 'MAIOR_MELHOR'), true); assert.equal(variacaoFavoravel('SOBE', 'MENOR_MELHOR'), false)
assert.equal(variacaoFavoravel('ESTAVEL', 'MAIOR_MELHOR'), null)

const ind = montarIndicador({ chave: 'x', titulo: 'X', categoria: 'C', valor: 12, anterior: 10, unidade: '%', sentido: 'MENOR_MELHOR', rota: '/x', perfis: ['reitoria'], limites: { verde: 5, amarelo: 10 } })
assert.equal(ind.semaforo, 'VERMELHO'); assert.equal(ind.favoravel, false); assert.equal(ind.variacaoPct, 20); assert.equal(ind.anteriorFonte, 'PERIODO')
assert.equal(fmtValor({ valor: 12.34, unidade: '%' }), '12,3%')
const inds = [ind, montarIndicador({ chave: 'y', titulo: 'Y', categoria: 'C', valor: 1, unidade: '', sentido: 'NEUTRO', rota: '/y', perfis: ['reitoria'], semaforo: 'VERDE' }), montarIndicador({ chave: 'z', titulo: 'Z', categoria: 'C', valor: null, unidade: '', sentido: 'NEUTRO', rota: '/z', perfis: ['reitoria'] })]
const r = resumoSemaforos(inds)
assert.deepEqual([r.VERDE, r.VERMELHO, r.CINZA, r.saude], [1, 1, 1, 50])
assert.deepEqual(alertas(inds).map((i) => i.chave), ['x'])

// NPS
assert.equal(calcularNps([10, 9, 8, 7, 6, 0]).nps, 0) // 2 prom, 2 det
assert.equal(calcularNps([10, 10, 9, 5]).nps, 50)
assert.equal(calcularNps([]).nps, null)
assert.equal(calcularNps([11, -1, 10]).total, 1)

// OKR
assert.equal(progressoKR({ valorInicial: 0, valorMeta: 100, valorAtual: 40 }), 40)
assert.equal(progressoKR({ valorInicial: 15, valorMeta: 8, valorAtual: 11.5 }), 50) // evasão caindo
assert.equal(progressoKR({ valorInicial: 15, valorMeta: 8, valorAtual: 20 }), 0)
assert.equal(progressoKR({ valorInicial: 0, valorMeta: 10, valorAtual: 30 }), 100)
assert.equal(progressoKR({ valorInicial: 5, valorMeta: 5, valorAtual: 5 }), 100)
assert.equal(progressoObjetivo([{ progresso: 100, peso: 1 }, { progresso: 0, peso: 3 }]), 25)
assert.equal(progressoObjetivo([]), 0)
const ini = new Date('2026-01-01'), fim = new Date('2026-12-31'), meio = new Date('2026-07-02')
assert.equal(statusKR(100, ini, fim, meio), 'CONCLUIDO')
assert.equal(statusKR(45, ini, fim, meio), 'NO_PRAZO')
assert.equal(statusKR(30, ini, fim, meio), 'EM_RISCO')
assert.equal(statusKR(5, ini, fim, meio), 'ATRASADO')
assert.equal(statusKR(0, ini, fim, new Date('2025-12-01')), 'NAO_INICIADO')
assert.equal(confiancaDoStatus('ATRASADO'), 'VERMELHO'); assert.equal(confiancaDoStatus('NO_PRAZO'), 'VERDE')
assert.equal(checkinDesatualizado(new Date('2026-06-01'), new Date('2026-01-01'), 14, new Date('2026-06-30')), true)
assert.equal(checkinDesatualizado(new Date('2026-06-20'), new Date('2026-01-01'), 14, new Date('2026-06-30')), false)

// mesa
const now = new Date('2026-10-02T12:00:00Z')
assert.equal(diasAtraso(new Date('2026-10-01T12:00:00Z'), now), 1); assert.equal(diasAtraso(new Date('2026-10-03T12:00:00Z'), now), 0); assert.equal(diasAtraso(null, now), 0)
const base = { origem: 'X', modulo: 'm', titulo: 'T' }
const a = mesaItem({ ...base, id: 'a', tipo: 'LEMBRETE', severidade: 'INFO', prazo: new Date('2026-10-20') }, now)
const b = mesaItem({ ...base, id: 'b', tipo: 'LEMBRETE', severidade: 'CRITICO', prazo: new Date('2026-09-20') }, now)
const c = mesaItem({ ...base, id: 'c', tipo: 'APROVACAO', severidade: 'ATENCAO', prazo: new Date('2026-10-03') }, now)
const d = mesaItem({ ...base, id: 'd', tipo: 'NOTIFICACAO', severidade: 'INFO', prazo: null }, now)
assert.deepEqual(ordenarMesa([a, d, c, b]).map((i) => i.id), ['b', 'c', 'a', 'd'])
assert.ok(urgenciaScore({ severidade: 'INFO', tipo: 'LEMBRETE', prazo: new Date('2026-09-01'), now }) > urgenciaScore({ severidade: 'INFO', tipo: 'LEMBRETE', prazo: new Date('2026-10-10'), now }))
const rs = resumirMesa([a, b, c, d])
assert.deepEqual([rs.total, rs.atrasados, rs.criticos, rs.aprovacoes], [4, 1, 1, 1])

// perfis
assert.equal(perfilDoPapel('finance'), 'administracao'); assert.equal(perfilDoPapel('RECTOR'), 'reitoria'); assert.equal(perfilDoPapel('MARKETING'), 'admissoes')
assert.equal(podeVerPerfil('RECTOR', 'biblioteca'), true); assert.equal(podeVerPerfil('LIBRARIAN', 'biblioteca'), true)
assert.equal(podeVerPerfil('LIBRARIAN', 'reitoria'), false); assert.equal(podeVerPerfil('TEACHER', 'secretaria'), false)

// cache
const cache = new TTLCache<number>(1000, 2)
cache.set('a', 1, 0); cache.set('b', 2, 0); cache.set('c', 3, 0)
assert.equal(cache.get('a', 10), undefined); assert.equal(cache.get('c', 10), 3); assert.equal(cache.get('c', 2000), undefined)
cache.set('t1|x', 1); cache.set('t2|x', 2); cache.clearPrefix('t1|'); assert.equal(cache.get('t1|x'), undefined)

// CSV / texto
assert.equal(toCsv([{ a: 'x;y', b: 'ok' }]), '﻿a;b\r\n"x;y";ok')
assert.deepEqual(categoriasDaPergunta('Como está a inadimplência e a evasão?'), ['Financeiro', 'Acadêmico'])
const txt = resumoHeuristico(inds, 'qual a situação do financeiro?')
assert.match(txt, /Panorama: 2 indicadores/); assert.match(txt, /Pontos de atenção/)
assert.match(resumoHeuristico([]), /Ainda não há dados/)
assert.deepEqual(citados('O indicador X está alto', inds), ['x'])

// rate limit
for (let i = 0; i < 3; i++) assert.equal(limitarTaxa('u', 3, 1000, 0), true)
assert.equal(limitarTaxa('u', 3, 1000, 500), false); assert.equal(limitarTaxa('u', 3, 1000, 2000), true)

// catálogo
const chaves = DEFS.map((d) => d.chave)
assert.equal(new Set(chaves).size, chaves.length, 'chaves duplicadas')
for (const m of MODELOS_OKR) for (const k of m.krs) assert.ok(chaves.includes(k.chave), `modelo OKR usa indicador inexistente: ${k.chave}`)
assert.ok(selecionarDefs({ perfil: 'professor' }).every((d) => !d.soProfessor))
assert.ok(selecionarDefs({ perfil: 'professor', userId: 'u' }).some((d) => d.chave === 'prof_alunos_em_risco'))
assert.ok(selecionarDefs({ perfil: 'coordenacao', programId: 'p' }).every((d) => d.cursoFiltravel))
assert.ok(selecionarDefs({ perfil: 'biblioteca' }).every((d) => d.perfis.includes('biblioteca')))

console.log('reitoria selftest: OK')
