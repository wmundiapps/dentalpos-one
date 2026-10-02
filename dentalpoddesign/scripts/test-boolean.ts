import { computeLayout } from '../src/core/designEngine'
import { defaultParams } from '../src/core/presets'
import { teethForMode, defaultDenture } from '../src/core/project'
import { QUALITY, buildCrown } from '../src/geometry/toothMesh'
import { meshStats, transformMesh } from '../src/geometry/mesh'
import { buildDenture } from '../src/geometry/denture'
import { subtractMeshes, unionMeshes, growMesh } from '../src/geometry/boolean'

const p = defaultParams(); p.upperTo = 7
const lay = computeLayout(p, teethForMode({ ...p, mode: 'complete' }))
const base = buildDenture(lay, defaultDenture()).find((d) => d.name === 'base-superior')!
const teeth = lay.upper.map((t) => transformMesh(buildCrown(t.spec, QUALITY.draft).mesh, t.matrix))
let t0 = Date.now()
const u = await unionMeshes([base.mesh, ...teeth])
console.log('união', meshStats(u).watertight, meshStats(u).volume.toFixed(0), Date.now() - t0, 'ms')
t0 = Date.now()
const sock = await subtractMeshes(base.mesh, teeth.map((t) => growMesh(t, 0.1)))
const s = meshStats(sock)
console.log('socket', s.watertight, s.volume.toFixed(0), 'base', meshStats(base.mesh).volume.toFixed(0), Date.now() - t0, 'ms')
