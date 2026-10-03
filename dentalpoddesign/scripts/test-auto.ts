// Desenho automático + análise sobre o caso de demonstração (sem navegador).
import { createProject, activeVariant, syncStatuses } from '../src/core/project'
import { demoMarks, DEMO_W, DEMO_H } from '../src/render/demoFace'
import { autoDesignVariant } from '../src/core/autoDesign'
import { computeLayout } from '../src/core/designEngine'
import { analyze } from '../src/core/analysis'
import { silhouetteOf } from '../src/render/silhouettes'

const p = createProject('t')
const dm = demoMarks()
p.marks = dm.marks
p.calib = dm.calib
p.face = { source: 'ia', shape: 'oval', label: 'Oval', lengthWidth: 1.3, jawCheek: 0.8, smile: 0.9 }
const v0 = activeVariant(p)
const r = autoDesignVariant(p, v0, DEMO_W, DEMO_H)
console.log('notas:', r.notes)
const q = r.variant.params
console.log({ shape: q.shape, w: q.centralWidth, wl: q.wl, arc: q.smileArc, inc: q.incisalOffset, mid: q.midlineShift, upTo: q.upperTo, scale: q.archScale, spee: q.spee })
const lay = computeLayout(q, r.variant.teeth)
const a = analyze(p, r.variant, lay, (f) => { const t = lay.byFdi.get(f); return t ? silhouetteOf(t.spec) : null }, DEMO_W, DEMO_H)
console.log('índice', a.score)
for (const i of a.items) console.log(i.level.padEnd(4), i.label.padEnd(58), i.value)
void syncStatuses
console.log('tip 13/23:', r.variant.teeth[13].tip, r.variant.teeth[23].tip)
import * as THREE from 'three'
import { archToImage } from '../src/core/analysis'
const T = archToImage(p, r.variant, DEMO_W, DEMO_H)
for (const f of [13, 23]) {
  const t = lay.byFdi.get(f)!
  const pup = f === 23 ? p.marks.pupilL! : p.marks.pupilR!
  const P = T.toArch(pup.x, pup.y)
  const cerv = new THREE.Vector3(0, -t.spec.H, 0).applyMatrix4(t.matrix)
  console.log(f, 'edge', t.position.x.toFixed(1), t.position.y.toFixed(1), 'cerv', cerv.x.toFixed(1), cerv.y.toFixed(1), 'pupil', P.x.toFixed(1), P.y.toFixed(1), 'axis°', (Math.atan2(cerv.x - t.position.x, cerv.y - t.position.y) * 180 / Math.PI).toFixed(1), 'toP°', (Math.atan2(P.x - t.position.x, P.y - t.position.y) * 180 / Math.PI).toFixed(1))
}
