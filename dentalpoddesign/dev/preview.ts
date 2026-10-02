import * as THREE from 'three'
import { computeLayout } from '../src/core/designEngine'
import { defaultParams, PRESETS } from '../src/core/presets'
import { teethForMode } from '../src/core/project'
import { ToothScene } from '../src/render/toothScene'

const q = new URLSearchParams(location.search)
const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(1)
renderer.setClearColor(0x2a3342)
renderer.toneMapping = THREE.ACESFilmicToneMapping
const p = { ...defaultParams() }
const preset = PRESETS.find((x) => x.id === q.get('preset'))
if (preset) Object.assign(p, preset.params)
if (q.get('shape')) p.shape = q.get('shape') as any
p.upperTo = +(q.get('upTo') || 7)
p.lowerEnabled = q.get('lower') === '1'
p.lowerTo = 7
p.mode = (q.get('mode') as any) || 'complete'
const teeth = teethForMode({ ...p, mode: 'complete' })
const layout = computeLayout(p, teeth, { cervFade: 0 })
const ts = new ToothScene(renderer)
ts.setLayout(layout, p)
ts.setPose(p, 0)
ts.scene.background = new THREE.Color(0x2a3342)
const view = q.get('view') || 'front'
const W = canvas.width, H = canvas.height
renderer.setSize(W, H, false)
const cam = new THREE.PerspectiveCamera(+(q.get('fov')||20), W / H, 1, 3000)
const d = +(q.get('d') || 520)
if (view === 'front') { cam.position.set(0, 0, d); cam.lookAt(0, 0, 0) }
if (view === 'side') { cam.position.set(d, 0, 0); cam.lookAt(0, 0, 0) }
if (view === 'top') { cam.position.set(0, d, 0.01); cam.up.set(0, 0, -1); cam.lookAt(0, -2, -15) }
if (view === 'oblique') { cam.position.set(d * 0.55, d * 0.25, d * 0.8); cam.lookAt(0, 0, -10) }
if (view === 'close') { cam.position.set(0, 0, d * 0.45); cam.lookAt(0, 0, 0) }
renderer.render(ts.scene, cam)
;(window as any).__ready = true
