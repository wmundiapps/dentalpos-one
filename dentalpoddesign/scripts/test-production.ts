import { createProject, applyMode, activeVariant } from '../src/core/project'
import { buildProduction } from '../src/geometry/production'
import { reportParts, to3mf, toStlBinary, toObj, toPly, toStlAscii } from '../src/geometry/exporters'

for (const mode of ['veneers', 'crowns', 'partial', 'complete'] as const) {
  for (const product of ['wax', 'veneerShell', 'hollowCrown'] as const) {
    for (const merge of [false, true]) {
      const p = createProject('t')
      const v = activeVariant(p)
      applyMode(v, mode)
      const t0 = Date.now()
      const r = await buildProduction(p, v, { ...p.export, product, merge, orientation: 'print', quality: 'draft' })
      const rep = reportParts(r.parts)
      const bad = rep.filter((x) => !x.watertight).length
      const sizes = [toStlBinary(r.parts).byteLength, toStlAscii(r.parts).length, toObj(r.parts).obj.length, toPly(r.parts).byteLength, to3mf(r.parts).length]
      console.log(mode.padEnd(9), product.padEnd(11), merge ? 'merge' : 'split', 'peças', rep.length, 'não-estanques', bad, 'avisos', r.warnings.length, `${Date.now() - t0}ms`, sizes.join('/'))
      if (r.warnings.length) console.log('   ', r.warnings.slice(0, 3).join(' | '))
    }
  }
}
