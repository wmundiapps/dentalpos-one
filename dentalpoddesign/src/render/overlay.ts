import * as THREE from 'three'
import type { DesignParams, Marks, Project, Pt, Variant } from '../core/types'
import { DEG, angleDeg, closedSpline, mid } from '../core/math'
import { computeLayout, type Layout } from '../core/designEngine'
import { ToothScene } from './toothScene'

/** Âncora padrão: ponto de contato incisal entre os centrais, na linha média facial e logo abaixo do lábio superior. */
export function defaultAnchor(marks: Marks, w: number, h: number): Pt {
  const mid1 = marks.midTop && marks.midBottom ? mid(marks.midTop, marks.midBottom) : { x: w / 2, y: h / 2 }
  if (marks.upMid && marks.lowMid) {
    return { x: (marks.upMid.x + marks.lowMid.x) / 2, y: marks.upMid.y + (marks.lowMid.y - marks.upMid.y) * 0.62 }
  }
  return { x: mid1.x, y: h * 0.62 }
}

export function pupilRoll(marks: Marks): number {
  if (!marks.pupilR || !marks.pupilL) return 0
  const a = marks.pupilR.x <= marks.pupilL.x ? marks.pupilR : marks.pupilL
  const b = a === marks.pupilR ? marks.pupilL : marks.pupilR
  return angleDeg(a, b)
}

export function facialMidlineX(marks: Marks, atY: number): number | null {
  if (!marks.midTop || !marks.midBottom) return null
  const a = marks.midTop
  const b = marks.midBottom
  if (Math.abs(b.y - a.y) < 1e-6) return a.x
  const t = (atY - a.y) / (b.y - a.y)
  return a.x + (b.x - a.x) * t
}

export function pxPerMm(p: Project, marks: Marks): number {
  if (p.calib.method === 'manual' && p.calib.pxPerMm > 0) return p.calib.pxPerMm
  if (p.calib.method === 'twoPoints' && marks.calibA && marks.calibB && p.calib.refMm > 0) {
    const d = Math.hypot(marks.calibA.x - marks.calibB.x, marks.calibA.y - marks.calibB.y)
    if (d > 1) return d / p.calib.refMm
  }
  if (marks.pupilR && marks.pupilL && p.calib.ipdMm > 0) {
    const d = Math.hypot(marks.pupilR.x - marks.pupilL.x, marks.pupilR.y - marks.pupilL.y)
    if (d > 1) return d / p.calib.ipdMm
  }
  return p.calib.pxPerMm > 0 ? p.calib.pxPerMm : 8
}

export function mouthPolygon(marks: Marks, samples = 10): Pt[] {
  if (marks.mouth && marks.mouth.length >= 4) return closedSpline(marks.mouth, samples)
  return []
}

/** Gera o contorno inicial dos lábios a partir de 4 pontos. */
export function mouthFromKey(commA: Pt, commB: Pt, up: Pt, low: Pt): Pt[] {
  const l = commA.x < commB.x ? commA : commB
  const r = l === commA ? commB : commA
  const lerpP = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const arcUp = (t: number, k: number) => {
    const base = lerpP(l, r, t)
    const bulge = 1 - Math.pow(2 * t - 1, 2)
    return { x: base.x, y: base.y + (up.y - (l.y + r.y) / 2) * bulge * k }
  }
  const arcLow = (t: number, k: number) => {
    const base = lerpP(l, r, t)
    const bulge = 1 - Math.pow(2 * t - 1, 2)
    return { x: base.x, y: base.y + (low.y - (l.y + r.y) / 2) * bulge * k }
  }
  const pts: Pt[] = [l]
  for (const t of [0.17, 0.33, 0.5, 0.67, 0.83]) pts.push(t === 0.5 ? { x: up.x, y: up.y } : arcUp(t, 1))
  pts.push(r)
  for (const t of [0.83, 0.67, 0.5, 0.33, 0.17]) pts.push(t === 0.5 ? { x: low.x, y: low.y } : arcLow(t, 1))
  return pts
}

export interface RenderOpts {
  scale: number // fator de resolução em relação à foto original
  showTeeth?: boolean
  outline?: boolean
  guides?: boolean
  transparent?: boolean
}

export class OverlayEngine {
  readonly glCanvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly ts: ToothScene
  readonly camera = new THREE.PerspectiveCamera(30, 1, 5, 6000)
  private tmp: HTMLCanvasElement
  private maskCv: HTMLCanvasElement
  private eraseCv: HTMLCanvasElement | null = null
  layout: Layout | null = null
  lastCamera: { s: number; ax: number; ay: number; w: number; h: number } | null = null

  constructor() {
    this.glCanvas = document.createElement('canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.NoToneMapping
    this.ts = new ToothScene(this.renderer)
    this.tmp = document.createElement('canvas')
    this.maskCv = document.createElement('canvas')
  }

  /** Atualiza malhas e câmera para (project, variant). Retorna o layout. */
  prepare(project: Project, variant: Variant, w: number, h: number, scale: number): Layout {
    const p = variant.params
    const layout = computeLayout(p, variant.teeth, { cervFade: 0.17 })
    this.layout = layout
    this.ts.setLayout(layout, p, { ghost: false, papillae: variant.look.papillae === false ? null : variant.look.gumColor || '#c9626f' })
    const marks = project.marks
    const roll = pupilRoll(marks) + p.rollOffset
    this.ts.setPose(p, roll)
    const s = pxPerMm(project, marks) * scale
    const anchor = variant.anchor ?? defaultAnchor(marks, w / scale, h / scale)
    const ax = anchor.x * scale
    const ay = anchor.y * scale
    const D = p.cameraDistance
    const X = (w / 2 - ax) / s
    const Y = -(h / 2 - ay) / s
    const cam = this.camera
    cam.aspect = w / h
    cam.fov = 2 * Math.atan(h / (2 * s) / D) / DEG
    cam.near = 5
    cam.far = D * 4
    cam.position.set(X, Y, D)
    cam.up.set(0, 1, 0)
    cam.lookAt(X, Y, 0)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld(true)
    this.lastCamera = { s, ax, ay, w, h }
    return layout
  }

  renderGl(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.renderer.render(this.ts.scene, this.camera)
  }

  /** Compõe a simulação sobre a foto. */
  composite(out: HTMLCanvasElement, photo: CanvasImageSource, project: Project, variant: Variant, opts: RenderOpts) {
    const pw = (photo as HTMLImageElement | ImageBitmap).width
    const ph = (photo as HTMLImageElement | ImageBitmap).height
    const w = Math.round(pw * opts.scale)
    const h = Math.round(ph * opts.scale)
    if (out.width !== w || out.height !== h) {
      out.width = w
      out.height = h
    }
    const g = out.getContext('2d')!
    g.clearRect(0, 0, w, h)
    g.drawImage(photo, 0, 0, w, h)
    if (opts.showTeeth === false) return
    this.prepare(project, variant, w, h, opts.scale)
    this.renderGl(w, h)

    const mouth = mouthPolygon(project.marks)
    const look = variant.look
    // camada de dentes
    if (this.tmp.width !== w || this.tmp.height !== h) {
      this.tmp.width = w
      this.tmp.height = h
      this.maskCv.width = w
      this.maskCv.height = h
    }
    const t = this.tmp.getContext('2d')!
    t.globalCompositeOperation = 'source-over'
    t.clearRect(0, 0, w, h)
    t.drawImage(this.glCanvas, 0, 0, w, h)
    if (mouth.length) {
      const m = this.maskCv.getContext('2d')!
      m.clearRect(0, 0, w, h)
      m.save()
      const f = Math.max(0, look.feather * opts.scale)
      if (f > 0.1 && 'filter' in m) (m as CanvasRenderingContext2D).filter = `blur(${f}px)`
      m.fillStyle = '#fff'
      m.beginPath()
      mouth.forEach((p, i) => (i ? m.lineTo(p.x * opts.scale, p.y * opts.scale) : m.moveTo(p.x * opts.scale, p.y * opts.scale)))
      m.closePath()
      m.fill()
      m.restore()
      t.globalCompositeOperation = 'destination-in'
      t.drawImage(this.maskCv, 0, 0)
      // sombreamento: corredor bucal e sombra do lábio superior
      if (look.mouthShadow > 0) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (const p of mouth) {
          x0 = Math.min(x0, p.x * opts.scale); x1 = Math.max(x1, p.x * opts.scale)
          y0 = Math.min(y0, p.y * opts.scale); y1 = Math.max(y1, p.y * opts.scale)
        }
        t.globalCompositeOperation = 'source-atop'
        const lat = t.createLinearGradient(x0, 0, x1, 0)
        const k = look.mouthShadow
        lat.addColorStop(0, `rgba(25,6,6,${0.75 * k})`)
        lat.addColorStop(0.2, `rgba(25,6,6,${0.18 * k})`)
        lat.addColorStop(0.36, 'rgba(25,6,6,0)')
        lat.addColorStop(0.64, 'rgba(25,6,6,0)')
        lat.addColorStop(0.8, `rgba(25,6,6,${0.18 * k})`)
        lat.addColorStop(1, `rgba(25,6,6,${0.75 * k})`)
        t.fillStyle = lat
        t.fillRect(x0, y0, x1 - x0, y1 - y0)
        const top = t.createLinearGradient(0, y0, 0, y1)
        top.addColorStop(0, `rgba(25,6,6,${0.4 * k})`)
        top.addColorStop(0.28, 'rgba(25,6,6,0)')
        top.addColorStop(0.8, 'rgba(25,6,6,0)')
        top.addColorStop(1, `rgba(25,6,6,${0.35 * k})`)
        t.fillStyle = top
        t.fillRect(x0, y0, x1 - x0, y1 - y0)
      }
      t.globalCompositeOperation = 'source-over'
    }
    // apaga o contorno dos dentes originais: sombra oral ao redor dos novos dentes (embrasuras escuras naturais)
    if (look.eraseOld !== false && mouth.length) {
      if (!this.eraseCv) this.eraseCv = document.createElement('canvas')
      const ec = this.eraseCv
      if (ec.width !== w || ec.height !== h) {
        ec.width = w
        ec.height = h
      }
      const e = ec.getContext('2d')!
      e.globalCompositeOperation = 'source-over'
      e.clearRect(0, 0, w, h)
      e.filter = `blur(${Math.max(1.5, 4.5 * opts.scale)}px)`
      e.drawImage(this.glCanvas, 0, 0, w, h)
      e.drawImage(this.glCanvas, 0, 0, w, h)
      e.filter = 'none'
      e.globalCompositeOperation = 'source-in'
      e.fillStyle = 'rgb(34,10,10)'
      e.fillRect(0, 0, w, h)
      e.globalCompositeOperation = 'destination-in'
      e.drawImage(this.maskCv, 0, 0)
      e.globalCompositeOperation = 'source-over'
      g.drawImage(ec, 0, 0)
    }
    g.save()
    g.globalAlpha = look.opacity
    if ('filter' in g && Math.abs(look.exposure - 1) > 0.01) (g as CanvasRenderingContext2D).filter = `brightness(${look.exposure})`
    g.drawImage(this.tmp, 0, 0)
    g.restore()
  }

  /** Projeção world→pixel (na resolução usada na última composição). */
  project(v: THREE.Vector3): Pt {
    const lc = this.lastCamera!
    const p = v.clone().project(this.camera)
    return { x: ((p.x + 1) / 2) * lc.w, y: ((1 - p.y) / 2) * lc.h }
  }

  /** Contorno do dente em px (resolução da última composição). */
  outlinePx(fdi: number): Pt[] {
    const mesh = this.ts.teeth.get(fdi)
    const sil = this.ts.silhouettes.get(fdi)
    if (!mesh || !sil || !this.lastCamera) return []
    mesh.updateWorldMatrix(true, false)
    const v = new THREE.Vector3()
    const out: Pt[] = []
    for (const [x, y] of sil) {
      v.set(x, y, 0).applyMatrix4(mesh.matrixWorld)
      out.push(this.project(v))
    }
    return out
  }

  pick(px: number, py: number): number | null {
    const lc = this.lastCamera
    if (!lc) return null
    const ndc = new THREE.Vector2((px / lc.w) * 2 - 1, -((py / lc.h) * 2 - 1))
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const meshes = [...this.ts.teeth.values()].filter((m) => !m.userData.ghost)
    const hit = ray.intersectObjects(meshes, false)[0]
    return hit ? (hit.object.userData.fdi as number) : null
  }

  dispose() {
    this.ts.dispose()
    this.renderer.dispose()
  }
}

export type { DesignParams }
