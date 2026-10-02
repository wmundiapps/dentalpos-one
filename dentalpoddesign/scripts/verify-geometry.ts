// Verificação automática de geometria: toda coroa/casca/coroa oca precisa ser watertight, sem NaN e com volume > 0.
import { computeLayout } from '../src/core/designEngine'
import { defaultParams } from '../src/core/presets'
import { teethForMode } from '../src/core/project'
import { QUALITY, buildCrown, hollowCrown, veneerShell } from '../src/geometry/toothMesh'
import { meshStats, transformMesh } from '../src/geometry/mesh'
import { PRESETS } from '../src/core/presets'
import type { DesignParams } from '../src/core/types'

let bad = 0
const fmt = (n: number, d = 1) => n.toFixed(d)
function check(label: string, s: ReturnType<typeof meshStats>, requireVol = true) {
  const problems: string[] = []
  if (!s.watertight) problems.push(`NÃO watertight (borda=${s.boundaryEdges}, nm=${s.nonManifoldEdges}, inc=${s.inconsistentEdges}, nan=${s.nanVertices})`)
  if (s.degenerateTris) problems.push(`degenerados=${s.degenerateTris}`)
  if (requireVol && !(s.volume > 0.5)) problems.push(`volume=${fmt(s.volume)}`)
  if (problems.length) {
    bad++
    console.log('  ✗', label, problems.join('; '))
  }
}

const shapes = ['natural', 'ovoid', 'square', 'triangular', 'rectangular', 'round'] as const
const modes: DesignParams['mode'][] = ['veneers', 'complete']
let total = 0
for (const preset of [{ id: 'default', params: {} }, ...PRESETS]) {
  for (const shape of preset.id === 'default' ? shapes : [undefined]) {
    const p: DesignParams = { ...defaultParams(), ...preset.params, ...(shape ? { shape } : {}) }
    p.upperTo = 7
    p.lowerEnabled = true
    p.lowerTo = 7
    const teeth = teethForMode({ ...p, mode: 'complete' })
    const layout = computeLayout(p, teeth)
    for (const t of layout.all) {
      const { mesh, grid } = buildCrown(t.spec, QUALITY.standard)
      const s = meshStats(mesh)
      total++
      check(`${preset.id}/${shape ?? ''} ${t.fdi} sólido`, s)
      const sh = veneerShell(grid, mesh, t.spec, { thickness: 0.6, wrapDeg: 20, incisalWrap: t.n <= 3 ? 0.6 : 0 })
      check(`${preset.id}/${shape ?? ''} ${t.fdi} faceta`, meshStats(sh))
      const hc = hollowCrown(grid, t.spec, 1.0)
      check(`${preset.id}/${shape ?? ''} ${t.fdi} coroa oca`, meshStats(hc))
      const w = transformMesh(mesh, t.matrix)
      check(`${preset.id}/${shape ?? ''} ${t.fdi} mundo`, meshStats(w))
    }
  }
}
console.log(`\n${total} dentes verificados (sólido+casca+oca+mundo)`)

// tabela de referência (padrão)
const p0 = defaultParams()
p0.upperTo = 7
const lay = computeLayout(p0, teethForMode({ ...p0, mode: 'complete' }))
console.log('\nFDI   Warc    W    H   BL   vol(mm³)  bbox(mm)')
for (const t of lay.upper.filter((x) => x.side === 1)) {
  const { mesh } = buildCrown(t.spec, QUALITY.standard)
  const s = meshStats(mesh)
  console.log(`${t.fdi}  ${fmt(t.widthArc)}  ${fmt(t.spec.W)}  ${fmt(t.spec.H)}  ${fmt(t.spec.BL)}   ${fmt(s.volume, 0)}   ${s.bbox.size.map((v) => fmt(v)).join(' x ')}`)
}
// dentaduras
import { buildDenture, bridgeConnectors } from '../src/geometry/denture'
import { defaultDenture } from '../src/core/project'
{
  const p = defaultParams()
  p.upperTo = 7
  p.lowerEnabled = true
  p.lowerTo = 7
  const tc = teethForMode({ ...p, mode: 'complete' })
  for (const palatal of ['plate', 'strap', 'none'] as const) {
    for (const lc of ['horseshoe', 'lingualBar', 'none'] as const) {
      // completa
      const lay = computeLayout(p, tc)
      const dd = buildDenture(lay, { ...defaultDenture(), palatal, lowerConnector: lc })
      for (const d of dd) { const st = meshStats(d.mesh); check(`completa ${palatal}/${lc} ${d.name}`, st); total++ }
      // parcial: central + posteriores como prótese
      const tp = teethForMode({ ...p, mode: 'complete' })
      for (const f of [11, 12, 21, 22, 25, 26, 27, 35, 36, 37, 45, 46, 47]) tp[f].status = 'denture'
      for (const f of Object.keys(tp).map(Number)) if (![11, 12, 21, 22, 25, 26, 27, 35, 36, 37, 45, 46, 47].includes(f)) tp[f].status = 'natural'
      const lay2 = computeLayout(p, tp)
      const d2 = buildDenture(lay2, { ...defaultDenture(), palatal, lowerConnector: lc })
      for (const d of d2) { const st = meshStats(d.mesh); check(`parcial ${palatal}/${lc} ${d.name}`, st); total++ }
      if (palatal === 'plate' && lc === 'horseshoe') console.log('parcial:', d2.map((d) => d.name).join(', '))
    }
  }
  const tb = teethForMode({ ...p, mode: 'complete' })
  for (const f of [13, 14, 15, 16]) tb[f].status = f === 14 ? 'pontic' : 'crown'
  const lb = computeLayout(p, tb)
  for (const c of bridgeConnectors(lb)) { check('conector ' + c.name, meshStats(c.mesh)); total++ }
}
console.log(bad ? `\nFALHAS: ${bad}` : '\nOK — todas as malhas são fechadas e válidas.')
process.exit(bad ? 1 : 0)
