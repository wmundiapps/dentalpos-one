import { OverlayEngine } from '../src/render/overlay'
import { makeDemoPhoto, demoMarks } from '../src/render/demoFace'
import { createProject } from '../src/core/project'
import { PRESETS } from '../src/core/presets'

const q = new URLSearchParams(location.search)
const blob = await makeDemoPhoto()
const img = await createImageBitmap(blob)
const project = createProject('demo')
const { marks, calib } = demoMarks()
project.marks = marks
project.calib = calib
const v = project.variants[0]
const preset = PRESETS.find((x) => x.id === q.get('preset'))
if (preset) Object.assign(v.params, preset.params)
v.params.upperTo = +(q.get('upTo') || 5)
if (q.get('shade')) v.params.shade = q.get('shade')!
if (q.get('dist')) v.params.cameraDistance = +q.get('dist')!
const eng = new OverlayEngine()
const cv = document.getElementById('c') as HTMLCanvasElement
const scale = +(q.get('scale') || 0.5)
eng.composite(cv, img, project, v, { scale, showTeeth: q.get('teeth') !== '0' })
// recorte
const crop = q.get('crop')
if (crop) {
  const [x, y, w, h] = crop.split(',').map(Number)
  const c2 = document.createElement('canvas')
  c2.width = w * scale; c2.height = h * scale
  c2.getContext('2d')!.drawImage(cv, x * scale, y * scale, w * scale, h * scale, 0, 0, w * scale, h * scale)
  cv.width = c2.width; cv.height = c2.height
  cv.getContext('2d')!.drawImage(c2, 0, 0)
}
const ol = eng.outlinePx(11)
if (ol.length) { const xs = ol.map(p=>p.x), ys = ol.map(p=>p.y); const x=(Math.min(...xs)+Math.max(...xs))/2/ (scale/ scale), y=(Math.min(...ys)+Math.max(...ys))/2
  const d = eng.glCanvas.getContext('webgl2')
  ;(window as any).__info = { ol: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] } }
;(window as any).__ready = true
