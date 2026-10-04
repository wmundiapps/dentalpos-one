import assert from 'node:assert/strict'
import {
  REGRA_PADRAO, calcResultado, calcMediaParcial, calcFrequencia, calcCR, estatisticas, parseNotasCsv,
  notaNecessaria, faltasRestantes, avaliarRisco, arredondar, notaDeTentativas, validarNota, ComponenteCalc, RegraCalc,
} from './calc'

const regra: RegraCalc = { ...REGRA_PADRAO }
const P1: ComponenteCalc = { id: 'p1', tipo: 'AVALIACAO', peso: 4, notaMaxima: 10, obrigatorio: true }
const P2: ComponenteCalc = { id: 'p2', tipo: 'AVALIACAO', peso: 6, notaMaxima: 10, obrigatorio: true }
const REC: ComponenteCalc = { id: 'rec', tipo: 'RECUPERACAO', peso: 1, notaMaxima: 10, obrigatorio: false }
const EX: ComponenteCalc = { id: 'ex', tipo: 'EXAME', peso: 1, notaMaxima: 10, obrigatorio: false }
const comps = [P1, P2, REC, EX]
const run = (notas: any[], o: Partial<{ freq: number | null; enc: boolean; regra: RegraCalc; comps: ComponenteCalc[] }> = {}) =>
  calcResultado({ componentes: o.comps ?? comps, notas, regra: o.regra ?? regra, frequenciaPct: o.freq === undefined ? 90 : o.freq, encerrado: !!o.enc })

// média ponderada
assert.equal(calcMediaParcial([P1, P2], [{ componenteId: 'p1', valor: 8 }, { componenteId: 'p2', valor: 6 }], regra).media, 6.8)
// aritmética
assert.equal(calcMediaParcial([P1, P2], [{ componenteId: 'p1', valor: 8 }, { componenteId: 'p2', valor: 6 }], { ...regra, regraMedia: 'ARITMETICA' }).media, 7)
// normalização (componente 0-5)
assert.equal(calcMediaParcial([{ ...P1, notaMaxima: 5, peso: 1 }], [{ componenteId: 'p1', valor: 4 }], regra).media, 8)

// aprovado direto
let r = run([{ componenteId: 'p1', valor: 8 }, { componenteId: 'p2', valor: 8 }])
assert.equal(r.situacao, 'APROVADO'); assert.equal(r.mediaFinal, 8)
// em curso (falta P2)
r = run([{ componenteId: 'p1', valor: 8 }])
assert.equal(r.situacao, 'EM_CURSO'); assert.deepEqual(r.pendentes, ['p2'])
// ausente conta zero
r = run([{ componenteId: 'p1', valor: 8 }, { componenteId: 'p2', valor: null, ausente: true }])
assert.equal(r.mediaParcial, 3.2); assert.equal(r.situacao, 'REPROVADO_NOTA')
// recuperação
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }])
assert.equal(r.situacao, 'RECUPERACAO')
// recuperação substitui menor (P1=3,P2=8: media=6.0; rec 9 substitui P1 -> (9*4+8*6)/10=8.4)
r = run([{ componenteId: 'p1', valor: 3 }, { componenteId: 'p2', valor: 8 }, { componenteId: 'rec', valor: 9 }])
assert.equal(r.mediaParcial, 6); assert.equal(r.mediaFinal, 8.4); assert.equal(r.situacao, 'APROVADO')
// recuperação não piora
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }, { componenteId: 'rec', valor: 2 }])
assert.equal(r.mediaAposRecuperacao, 6); assert.equal(r.situacao, 'EXAME')
// exame: 6*0.6 + 6*0.4 = 6.0 >= 5 aprovado ; exame 2 => 3.6+0.8=4.4 reprovado
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }, { componenteId: 'rec', valor: 2 }, { componenteId: 'ex', valor: 6 }])
assert.equal(r.mediaFinal, 6); assert.equal(r.situacao, 'APROVADO')
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }, { componenteId: 'rec', valor: 2 }, { componenteId: 'ex', valor: 2 }])
assert.equal(r.mediaFinal, 4.4); assert.equal(r.situacao, 'REPROVADO_NOTA')
// abaixo da mínima: reprova direto
r = run([{ componenteId: 'p1', valor: 2 }, { componenteId: 'p2', valor: 3 }])
assert.equal(r.situacao, 'REPROVADO_NOTA')
// sem rec/exame na regra
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }], { comps: [P1, P2] })
assert.equal(r.situacao, 'REPROVADO_NOTA')
// frequência
r = run([{ componenteId: 'p1', valor: 9 }, { componenteId: 'p2', valor: 9 }], { freq: 70 })
assert.equal(r.situacao, 'REPROVADO_FREQ')
r = run([{ componenteId: 'p1', valor: 9 }], { freq: 70 })
assert.equal(r.situacao, 'EM_CURSO'); assert.equal(r.riscoFrequencia, true)
r = run([{ componenteId: 'p1', valor: 9 }], { freq: 70, enc: true })
assert.equal(r.situacao, 'REPROVADO_FREQ')
// diário fechado, em recuperação sem nota => reprovado
r = run([{ componenteId: 'p1', valor: 6 }, { componenteId: 'p2', valor: 6 }], { enc: true })
assert.equal(r.situacao, 'REPROVADO_NOTA')
// arredondamento
assert.equal(arredondar(6.95, 'UM_DECIMAL'), 7); assert.equal(arredondar(6.74, 'MEIO_PONTO'), 6.5); assert.equal(arredondar(6.5, 'INTEIRO'), 7)

// frequência
assert.deepEqual(calcFrequencia(0, [], true), { total: 0, presencas: 0, faltas: 0, pct: null })
let f = calcFrequencia(20, [...Array(14).fill({ presente: true }), { presente: false, justificada: true }, { presente: false }], true)
assert.equal(f.presencas, 15); assert.equal(f.faltas, 5); assert.equal(f.pct, 75)
f = calcFrequencia(20, [...Array(14).fill({ presente: true }), { presente: false, justificada: true }], false)
assert.equal(f.pct, 70)
assert.deepEqual(faltasRestantes(80, 5, 75), { maxFaltas: 20, restantes: 15, estourou: false })

// nota necessária
let nn = notaNecessaria([P1, P2], [{ componenteId: 'p1', valor: 5 }], regra)
assert.equal(nn.necessaria, 8.33); assert.equal(nn.possivel, true)
nn = notaNecessaria([P1, P2], [{ componenteId: 'p1', valor: 0 }], regra)
assert.equal(nn.possivel, false)
assert.equal(avaliarRisco({ componentes: [P1, P2], notas: [{ componenteId: 'p1', valor: 0 }], regra, frequenciaPct: 90, situacao: 'EM_CURSO' }).nivel, 'ALTO')
assert.equal(avaliarRisco({ componentes: [P1, P2], notas: [{ componenteId: 'p1', valor: 9 }], regra, frequenciaPct: 78, situacao: 'EM_CURSO' }).nivel, 'ATENCAO')

// CR
assert.equal(calcCR([{ mediaFinal: 8, cargaHoraria: 80, situacao: 'APROVADO' }, { mediaFinal: 5, cargaHoraria: 40, situacao: 'REPROVADO_NOTA' }, { mediaFinal: null, cargaHoraria: 60, situacao: 'EM_CURSO' }]), 7)
assert.equal(calcCR([]), null)

// estatísticas
const st = estatisticas([2, 4, 6, 8, 10, null])
assert.equal(st.n, 5); assert.equal(st.media, 6); assert.equal(st.mediana, 6); assert.equal(st.maxima, 10)
assert.equal(st.distribuicao.reduce((s, d) => s + d.quantidade, 0), 5); assert.equal(st.distribuicao[4].quantidade, 2)

// CSV
const csv = parseNotasCsv('ra;P1;P2\n2024001;8,5;7\n2024002;ausente;\n2024003;abc;5')
assert.deepEqual(csv.colunas, ['P1', 'P2'])
assert.equal(csv.linhas[0].valores.P1, 8.5); assert.equal(csv.linhas[1].valores.P1, 'AUSENTE')
assert.equal(csv.linhas[2].erros.length, 1); assert.equal(csv.linhas[1].valores.P2, undefined)

assert.equal(validarNota(11, 10) !== null, true); assert.equal(validarNota(10, 10), null); assert.equal(validarNota(-1, 10) !== null, true)
assert.equal(notaDeTentativas([4, 9, 6], 'MELHOR'), 9); assert.equal(notaDeTentativas([4, 9, 6], 'ULTIMA'), 6); assert.equal(notaDeTentativas([4, 8], 'MEDIA'), 6)
console.log('notas selftest OK')
