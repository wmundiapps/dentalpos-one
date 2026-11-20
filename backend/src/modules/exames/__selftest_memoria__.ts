import assert from 'node:assert'
import { ehMelhor, resumir } from './memoria'

assert.equal(ehMelhor({ nota: 8, perfeita: false }, { melhorNota: 7, perfeita: false }), true)
assert.equal(ehMelhor({ nota: 6, perfeita: false }, { melhorNota: 7, perfeita: false }), false)
assert.equal(ehMelhor({ nota: 10, perfeita: true }, { melhorNota: 9.6, perfeita: false }), true)
assert.equal(ehMelhor({ nota: 9.6, perfeita: false }, { melhorNota: 10, perfeita: true }), false)
const r = resumir([
  { melhorNota: 10, perfeita: true, tentativas: 1, curso: 'Medicina', disciplina: 'Anatomia' },
  { melhorNota: 9.2, perfeita: false, tentativas: 2, curso: 'Medicina', disciplina: 'Anatomia' },
  { melhorNota: 7.5, perfeita: false, tentativas: 1, curso: 'Medicina', disciplina: 'Anatomia' },
  { melhorNota: 5, perfeita: false, tentativas: 3, curso: 'Medicina', disciplina: 'Anatomia' },
])
assert.deepEqual(r, { series: 4, media: 7.9, tentativas: 7, tacas: 1, ouro: 1, prata: 1, bronze: 1 })
assert.equal(resumir([]).media, null)
console.log('memoria selftest OK')
