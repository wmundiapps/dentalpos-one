import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pt, Variant } from '../core/types'
import { activeVariant } from '../core/project'
import { clamp, closedSpline } from '../core/math'
import { MARK_DEFS, WIZARD_ORDER, getMark, setMark } from '../core/marks'
import { archToImage, lowerLipBorder } from '../core/analysis'
import { defaultAnchor, mouthFromKey, mouthPolygon, pupilRoll, facialMidlineX } from '../render/overlay'
import { getEngine } from '../render/engine'
import { getPhotoBitmap, getState, mutate, mutateVariant, select, setState, toast, useApp, type MarkTool } from '../store/store'
import { makeFdi, fdiSide, fdiArch, fdiIndex, PROPORTIONS } from '../core/toothSpecs'

export type StageMode = 'photos' | 'analysis' | 'design' | 'present'

const HIT = 11

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'mark'; key: Exclude<MarkTool, null> }
  | { kind: 'mouth'; i: number }
  | { kind: 'anchor'; start: Pt; a0: Pt }
  | { kind: 'split' }
  | { kind: 'move'; fdi: number; start: Pt; cfg: { dx: number; dy: number } }
  | { kind: 'width'; fdi: number; w0: number; half0: number; cx: number }
  | { kind: 'height'; fdi: number; end: 'top' | 'bottom'; h0: number; H0: number; dy0: number }
  | { kind: 'rot'; fdi: number; a0: number; tip0: number; cx: number; cy: number }

export function advanceWizard() {
  const s = getState()
  const idx = s.wizardIndex
  if (idx < 0) return
  const next = idx + 1
  if (next < WIZARD_ORDER.length) setState({ wizardIndex: next, tool: WIZARD_ORDER[next] })
  else {
    setState({ wizardIndex: -1, tool: null })
    finalizeMarks()
    toast('Análise facial concluída. Ajuste os pontos arrastando-os.', 'ok')
  }
}

export function finalizeMarks() {
  mutate((p) => {
    const m = p.marks
    if (m.commR && m.commL && m.upMid && m.lowMid && (!m.mouth || m.mouth.length < 4)) m.mouth = mouthFromKey(m.commR, m.commL, m.upMid, m.lowMid)
    for (const v of p.variants) v.anchor = null
  })
}

export function placeMark(key: Exclude<MarkTool, null>, pt: Pt) {
  mutate((p) => setMark(p.marks, key, pt))
  const s = getState()
  if (s.wizardIndex >= 0 && WIZARD_ORDER[s.wizardIndex] === key) advanceWizard()
  else setState({ tool: null })
}

export function PhotoStage({ mode, photoId }: { mode: StageMode; photoId?: string | null }) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const comp = useRef<HTMLCanvasElement | null>(null)
  const view = useRef({ zoom: 1, ox: 0, oy: 0, w: 100, h: 100 })
  const drag = useRef<Drag | null>(null)
  const raf = useRef(0)
  const lastScale = useRef(1)
  const spaceDown = useRef(false)
  const [, force] = useState(0)

  const project = useApp((s) => s.project)
  const rev = useApp((s) => s.rev)
  const photoRev = useApp((s) => s.photoRev)
  const selected = useApp((s) => s.selected)
  const tool = useApp((s) => s.tool)
  const guides = useApp((s) => s.guides)
  const compare = useApp((s) => s.compare)
  const split = useApp((s) => s.split)
  const symmetric = useApp((s) => s.symmetric)
  const zoomReset = useApp((s) => s.zoomReset)
  const wizardIndex = useApp((s) => s.wizardIndex)

  const pid = photoId ?? project.basePhotoId
  const bmp = getPhotoBitmap(pid)
  const variant = activeVariant(project)
  const showTeeth = mode === 'design' || mode === 'present' || mode === 'analysis'

  const fit = useCallback(() => {
    const v = view.current
    if (!bmp) return
    const k = Math.min(v.w / bmp.width, v.h / bmp.height) * 0.97
    v.zoom = k
    v.ox = (v.w - bmp.width * k) / 2
    v.oy = (v.h - bmp.height * k) / 2
  }, [bmp])

  const fitMouth = useCallback(() => {
    const v = view.current
    const m = project.marks.mouth
    if (!bmp || !m || m.length < 4) return fit()
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const q of m) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x)
      y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
    }
    const w = (x1 - x0) * 1.5
    const h = Math.max((y1 - y0) * 2.4, w * 0.55)
    const k = Math.min(v.w / w, v.h / h)
    v.zoom = k
    v.ox = v.w / 2 - ((x0 + x1) / 2) * k
    v.oy = v.h / 2 - ((y0 + y1) / 2) * k
  }, [bmp, project.marks.mouth, fit])

  // ---- composição ---------------------------------------------------------------------------------------------
  const renderComp = useCallback(() => {
    if (!bmp) return
    if (!comp.current) comp.current = document.createElement('canvas')
    const eng = getEngine()
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
    lastScale.current = scale
    const doTeeth = showTeeth && compare !== 'before' && variant.look.showTeeth && pid === project.basePhotoId
    try {
      eng.composite(comp.current, bmp, project, variant, { scale, showTeeth: doTeeth })
      if (!doTeeth || (mode === 'design' && variant.look.outline)) eng.prepare(project, variant, comp.current.width, comp.current.height, scale)
    } catch (e) {
      console.error('Falha ao compor', e)
    }
  }, [bmp, project, variant, showTeeth, compare, mode, pid])

  const toScreen = (p: Pt) => ({ x: view.current.ox + p.x * view.current.zoom, y: view.current.oy + p.y * view.current.zoom })
  const toImage = (x: number, y: number): Pt => ({ x: (x - view.current.ox) / view.current.zoom, y: (y - view.current.oy) / view.current.zoom })

  // ---- desenho -------------------------------------------------------------------------------------------------
  const draw = useCallback(() => {
    const c = cv.current
    if (!c) return
    const v = view.current
    const dpr = window.devicePixelRatio || 1
    if (c.width !== Math.round(v.w * dpr) || c.height !== Math.round(v.h * dpr)) {
      c.width = Math.round(v.w * dpr)
      c.height = Math.round(v.h * dpr)
    }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#070b11'
    g.fillRect(0, 0, v.w, v.h)
    if (!bmp) return
    g.imageSmoothingQuality = 'high'
    const showComp = showTeeth && compare !== 'before' && comp.current && pid === project.basePhotoId
    const W = bmp.width
    const H = bmp.height
    g.save()
    g.translate(v.ox, v.oy)
    g.scale(v.zoom, v.zoom)
    if (showComp && comp.current) {
      g.drawImage(comp.current, 0, 0, W, H)
      if (compare === 'split') {
        g.save()
        g.beginPath()
        g.rect(W * split, 0, W * (1 - split), H)
        g.clip()
        g.drawImage(bmp, 0, 0)
        g.restore()
      }
    } else g.drawImage(bmp, 0, 0)
    g.restore()

    const marks = project.marks
    const isBase = pid === project.basePhotoId
    if (compare === 'split' && showComp) {
      const x = toScreen({ x: W * split, y: 0 }).x
      g.strokeStyle = '#fff'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x, v.oy)
      g.lineTo(x, v.oy + H * v.zoom)
      g.stroke()
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(x, v.oy + (H * v.zoom) / 2, 14, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#000'
      g.font = '700 12px system-ui'
      g.textAlign = 'center'
      g.fillText('↔', x, v.oy + (H * v.zoom) / 2 + 4)
      g.font = '600 11px system-ui'
      g.fillStyle = '#fff'
      g.textAlign = 'left'
      g.fillText('DEPOIS', x - 62, v.oy + 20)
      g.fillText('ANTES', x + 12, v.oy + 20)
    }
    if (!isBase || mode === 'photos' || mode === 'present') {
      if (mode === 'present') drawLabel(g, v, compare)
      return
    }

    const T = archToImage(project, variant, W, H)
    const S = (p: Pt) => toScreen(p)
    const line = (a: Pt, b: Pt, color: string, w = 1.2, dash: number[] = []) => {
      const sa = S(a)
      const sb = S(b)
      g.strokeStyle = color
      g.lineWidth = w
      g.setLineDash(dash)
      g.beginPath()
      g.moveTo(sa.x, sa.y)
      g.lineTo(sb.x, sb.y)
      g.stroke()
      g.setLineDash([])
    }
    const ext = (a: Pt, b: Pt, color: string, w = 1, dash: number[] = [6, 5]) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l = Math.hypot(dx, dy) || 1
      const k = (W * 1.5) / l
      line({ x: a.x - dx * k, y: a.y - dy * k }, { x: a.x + dx * k, y: a.y + dy * k }, color, w, dash)
    }

    // guias
    if (guides.pupil && marks.pupilR && marks.pupilL) ext(marks.pupilR, marks.pupilL, 'rgba(56,189,248,.75)')
    if (guides.midline && marks.midTop && marks.midBottom) ext(marks.midTop, marks.midBottom, 'rgba(251,191,36,.75)')
    if (guides.pupil && marks.commR && marks.commL) ext(marks.commR, marks.commL, 'rgba(251,113,133,.55)', 1, [3, 5])
    const r = (pupilRoll(marks) + variant.params.rollOffset) * (Math.PI / 180)
    const a0 = T.anchor
    if (guides.incisal && (mode === 'design' || mode === 'analysis')) {
      const d = { x: Math.cos(r), y: Math.sin(r) }
      ext(a0, { x: a0.x + d.x, y: a0.y + d.y }, 'rgba(61,217,197,.8)', 1.2, [8, 4])
      ext(a0, { x: a0.x - d.y, y: a0.y + d.x }, 'rgba(61,217,197,.55)', 1, [8, 4])
    }
    if (guides.grid && mode === 'design') {
      const cr = Math.cos(r)
      const sr = Math.sin(r)
      for (let i = -30; i <= 30; i++) {
        const o = i * 5 * T.s
        line({ x: a0.x + o * cr - -60 * T.s * sr, y: a0.y + o * sr + -60 * T.s * cr }, { x: a0.x + o * cr - 60 * T.s * sr, y: a0.y + o * sr + 60 * T.s * cr }, 'rgba(255,255,255,.10)', 1)
        line({ x: a0.x - 160 * T.s * cr - o * -sr, y: a0.y - 160 * T.s * sr - o * cr }, { x: a0.x + 160 * T.s * cr - o * -sr, y: a0.y + 160 * T.s * sr - o * cr }, 'rgba(255,255,255,.10)', 1)
      }
    }
    // régua DSD
    if (guides.ruler && mode === 'design') {
      const cr = Math.cos(r)
      const sr = Math.sin(r)
      const base = { x: a0.x - sr * -16 * T.s, y: a0.y + cr * 16 * T.s }
      for (let i = -30; i <= 30; i++) {
        const len = i % 5 === 0 ? 10 : 5
        const p = { x: base.x + i * T.s * cr, y: base.y + i * T.s * sr }
        const q = { x: p.x - sr * len, y: p.y + cr * len }
        line(p, q, 'rgba(255,255,255,.7)', 1)
        if (i % 5 === 0 && i !== 0) {
          const sp = S(q)
          g.fillStyle = 'rgba(255,255,255,.8)'
          g.font = '10px system-ui'
          g.textAlign = 'center'
          g.fillText(String(Math.abs(i)), sp.x, sp.y + 11)
        }
      }
      line({ x: base.x - 30 * T.s * cr, y: base.y - 30 * T.s * sr }, { x: base.x + 30 * T.s * cr, y: base.y + 30 * T.s * sr }, 'rgba(255,255,255,.7)', 1)
    }
    // grade de proporções (áurea / RED / Preston / Chu)
    if (guides.golden && (mode === 'design' || mode === 'analysis')) {
      const p = variant.params
      const sys = PROPORTIONS.find((x) => x.id === p.proportion)
      const rat: [number, number] = p.proportion === 'red' ? [p.redPct, p.redPct * p.redPct] : sys?.ratios ?? [0.618, 0.382]
      const Wc = p.centralWidth
      const xs = [0, Wc, Wc + Wc * rat[0], Wc + Wc * rat[0] + Wc * rat[1]]
      for (const sgn of [-1, 1]) {
        xs.forEach((x, i) => {
          if (sgn === -1 && i === 0) return
          const p1 = T.toImg(sgn * x, -2)
          const p2 = T.toImg(sgn * x, 14)
          line(p1, p2, i === 0 ? 'rgba(255,224,102,.95)' : 'rgba(255,224,102,.65)', 1.3, [4, 3])
        })
      }
      const lab = S(T.toImg(0, 15.5))
      g.fillStyle = 'rgba(255,224,102,.95)'
      g.font = '600 11px system-ui'
      g.textAlign = 'center'
      g.fillText(`100 : ${Math.round(rat[0] * 100)} : ${Math.round(rat[1] * 100)} %`, lab.x, lab.y)
    }
    // arco do sorriso + zênites
    const eng = getEngine()
    if (eng.layout && (mode === 'design' || mode === 'analysis')) {
      const up = eng.layout.upper.filter((t) => t.designed && t.n <= 5).sort((a, b) => a.position.x - b.position.x)
      if (guides.arc && up.length > 2) {
        const pts = up.map((t) => T.toImg(t.position.x, t.position.y))
        g.strokeStyle = 'rgba(255,255,255,.95)'
        g.lineWidth = 2
        g.setLineDash([])
        g.beginPath()
        const sp = closedSpline(pts.map((p) => S(p)), 8)
        // spline aberta simples: usa pontos originais com curva quadrática
        void sp
        const sps = pts.map((p) => S(p))
        g.moveTo(sps[0].x, sps[0].y)
        for (let i = 1; i < sps.length - 1; i++) {
          const mx = (sps[i].x + sps[i + 1].x) / 2
          const my = (sps[i].y + sps[i + 1].y) / 2
          g.quadraticCurveTo(sps[i].x, sps[i].y, mx, my)
        }
        g.lineTo(sps[sps.length - 1].x, sps[sps.length - 1].y)
        g.stroke()
        const lipB = lowerLipBorder(marks)
        if (lipB.length > 3) {
          g.strokeStyle = 'rgba(244,114,182,.9)'
          g.lineWidth = 1.5
          g.setLineDash([5, 4])
          g.beginPath()
          lipB.forEach((p, i) => {
            const q = S(p)
            if (i) g.lineTo(q.x, q.y)
            else g.moveTo(q.x, q.y)
          })
          g.stroke()
          g.setLineDash([])
        }
      }
      if (guides.zenith) {
        const zs = up.map((t) => T.toImg(t.position.x, t.position.y + t.spec.H))
        g.fillStyle = '#ff7b7b'
        zs.forEach((z) => {
          const q = S(z)
          g.beginPath()
          g.moveTo(q.x, q.y + 6)
          g.lineTo(q.x - 5, q.y - 3)
          g.lineTo(q.x + 5, q.y - 3)
          g.closePath()
          g.fill()
        })
        g.strokeStyle = 'rgba(255,123,123,.6)'
        g.lineWidth = 1
        g.beginPath()
        zs.forEach((z, i) => {
          const q = S(z)
          if (i) g.lineTo(q.x, q.y)
          else g.moveTo(q.x, q.y)
        })
        g.stroke()
      }
    }
    // contornos
    if (mode === 'design' && (guides.outline || variant.look.outline) && eng.layout && comp.current) {
      const k = 1 / lastScale.current
      g.lineWidth = 1.6
      for (const t of eng.layout.all) {
        if (!t.designed) continue
        const o = eng.outlinePx(t.fdi)
        if (o.length < 3) continue
        g.strokeStyle = t.fdi === selected ? '#3dd9c5' : 'rgba(255,255,255,.92)'
        g.beginPath()
        o.forEach((p, i) => {
          const q = S({ x: p.x * k, y: p.y * k })
          if (i) g.lineTo(q.x, q.y)
          else g.moveTo(q.x, q.y)
        })
        g.closePath()
        g.stroke()
      }
    }
    // numeração FDI
    if (guides.numbers && mode === 'design' && eng.layout) {
      const k = 1 / lastScale.current
      g.font = '700 11px system-ui'
      g.textAlign = 'center'
      for (const t of eng.layout.all) {
        if (!t.designed) continue
        const o = eng.outlinePx(t.fdi)
        if (!o.length) continue
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
        for (const p of o) {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x)
          y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
        }
        const q = S({ x: ((x0 + x1) / 2) * k, y: ((y0 + y1) / 2) * k })
        g.fillStyle = 'rgba(0,0,0,.55)'
        g.fillRect(q.x - 11, q.y - 8, 22, 15)
        g.fillStyle = '#fff'
        g.fillText(String(t.fdi), q.x, q.y + 3)
      }
    }
    // máscara labial
    if (guides.mask || mode === 'analysis') {
      const poly = mouthPolygon(marks, 10)
      if (poly.length) {
        g.strokeStyle = 'rgba(255,255,255,.6)'
        g.lineWidth = 1.2
        g.setLineDash([4, 3])
        g.beginPath()
        poly.forEach((p, i) => {
          const q = S(p)
          if (i) g.lineTo(q.x, q.y)
          else g.moveTo(q.x, q.y)
        })
        g.closePath()
        g.stroke()
        g.setLineDash([])
        if (mode === 'analysis' || tool === null) {
          g.fillStyle = '#fff'
          for (const p of marks.mouth ?? []) {
            const q = S(p)
            g.beginPath()
            g.arc(q.x, q.y, 3.2, 0, Math.PI * 2)
            g.fill()
          }
        }
      }
    }
    // marcas
    if (mode === 'analysis') {
      for (const d of MARK_DEFS) {
        const p = getMark(marks, d.key)
        if (!p) continue
        const q = S(p)
        g.strokeStyle = d.color
        g.lineWidth = 1.6
        g.beginPath()
        g.arc(q.x, q.y, 6, 0, Math.PI * 2)
        g.moveTo(q.x - 11, q.y)
        g.lineTo(q.x + 11, q.y)
        g.moveTo(q.x, q.y - 11)
        g.lineTo(q.x, q.y + 11)
        g.stroke()
        g.fillStyle = d.color
        g.font = '600 10px system-ui'
        g.textAlign = 'left'
        g.fillText(d.short, q.x + 9, q.y - 8)
      }
      if (marks.calibA && marks.calibB) line(marks.calibA, marks.calibB, '#34d399', 1.5)
    }
    // âncora + alças do dente
    if (mode === 'design') {
      const q = S(a0)
      g.fillStyle = '#3dd9c5'
      g.strokeStyle = '#04211d'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(q.x, q.y - 8)
      g.lineTo(q.x + 8, q.y)
      g.lineTo(q.x, q.y + 8)
      g.lineTo(q.x - 8, q.y)
      g.closePath()
      g.fill()
      g.stroke()
      if (selected && eng.layout?.byFdi.has(selected)) {
        const h = toothHandles(selected)
        if (h) {
          g.strokeStyle = '#3dd9c5'
          g.lineWidth = 1.2
          g.setLineDash([4, 3])
          const bb = h.box
          const s0 = S({ x: bb.x0, y: bb.y0 })
          const s1 = S({ x: bb.x1, y: bb.y1 })
          g.strokeRect(s0.x, s0.y, s1.x - s0.x, s1.y - s0.y)
          g.setLineDash([])
          for (const hp of h.points) {
            const sp = S(hp.p)
            g.fillStyle = hp.kind === 'rot' ? '#fbbf24' : '#3dd9c5'
            g.beginPath()
            if (hp.kind === 'rot') g.arc(sp.x, sp.y, 6, 0, Math.PI * 2)
            else g.rect(sp.x - 5, sp.y - 5, 10, 10)
            g.fill()
          }
        }
      }
    }
  }, [bmp, project, variant, mode, showTeeth, compare, split, guides, selected, pid, tool, wizardIndex])

  // alças do dente selecionado (coordenadas de imagem)
  const toothHandles = useCallback((fdi: number) => {
    const eng = getEngine()
    const o = eng.outlinePx(fdi)
    if (!o.length) return null
    const k = 1 / lastScale.current
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of o) {
      x0 = Math.min(x0, p.x * k); x1 = Math.max(x1, p.x * k)
      y0 = Math.min(y0, p.y * k); y1 = Math.max(y1, p.y * k)
    }
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    return {
      box: { x0, y0, x1, y1 },
      points: [
        { kind: 'wL' as const, p: { x: x0, y: cy } },
        { kind: 'wR' as const, p: { x: x1, y: cy } },
        { kind: 'top' as const, p: { x: cx, y: y0 } },
        { kind: 'bottom' as const, p: { x: cx, y: y1 } },
        { kind: 'rot' as const, p: { x: cx, y: y0 - 22 / view.current.zoom } },
      ],
    }
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(draw)
  }, [draw])

  // ---- efeitos -------------------------------------------------------------------------------------------------
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const first = view.current.w === 100
      view.current.w = r.width
      view.current.h = r.height
      if (first) {
        if (mode === 'design' || mode === 'present') fitMouth()
        else fit()
      }
      schedule()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit, fitMouth, mode, schedule])

  useEffect(() => {
    if (mode === 'design' || mode === 'present') fitMouth()
    else fit()
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bmp, zoomReset, mode])

  useEffect(() => {
    renderComp()
    schedule()
    force((n) => n + 1)
  }, [renderComp, rev, photoRev, schedule])

  useEffect(() => {
    schedule()
  }, [schedule, draw])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) spaceDown.current = true
    }
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [])

  // ---- interação -----------------------------------------------------------------------------------------------
  const hitMark = (p: Pt): Exclude<MarkTool, null> | null => {
    const r = HIT / view.current.zoom
    let best: Exclude<MarkTool, null> | null = null
    let bd = r
    for (const d of MARK_DEFS) {
      const m = getMark(project.marks, d.key)
      if (!m) continue
      const dd = Math.hypot(m.x - p.x, m.y - p.y)
      if (dd < bd) {
        bd = dd
        best = d.key
      }
    }
    return best
  }
  const hitMouth = (p: Pt): number => {
    const r = HIT / view.current.zoom
    const m = project.marks.mouth ?? []
    let bi = -1
    let bd = r
    m.forEach((q, i) => {
      const dd = Math.hypot(q.x - p.x, q.y - p.y)
      if (dd < bd) {
        bd = dd
        bi = i
      }
    })
    return bi
  }

  const mirrorOf = (fdi: number) => makeFdi(fdiArch(fdi), (fdiSide(fdi) * -1) as -1 | 1, fdiIndex(fdi))

  const applyCfg = (fdi: number, fn: (c: Variant['teeth'][number]) => void, key: string, mirror: (c: Variant['teeth'][number]) => void = fn) => {
    mutateVariant((v) => {
      fn(v.teeth[fdi])
      if (getState().symmetric) {
        const m = mirrorOf(fdi)
        if (v.teeth[m] && v.teeth[m].status === v.teeth[fdi].status) mirror(v.teeth[m])
      }
    }, key)
  }

  const onDown = (e: React.PointerEvent) => {
    const c = cv.current!
    c.setPointerCapture(e.pointerId)
    const rect = c.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const p = toImage(sx, sy)
    if (!bmp) return
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      drag.current = { kind: 'pan', sx, sy, ox: view.current.ox, oy: view.current.oy }
      return
    }
    // colocação de marcas
    if (tool && mode === 'analysis') {
      placeMark(tool, p)
      return
    }
    if (compare === 'split' && showTeeth) {
      const x = toScreen({ x: bmp.width * split, y: 0 }).x
      if (Math.abs(sx - x) < 16) {
        drag.current = { kind: 'split' }
        return
      }
    }
    if (mode === 'analysis') {
      const mk = hitMark(p)
      if (mk) {
        drag.current = { kind: 'mark', key: mk }
        return
      }
      const mi = hitMouth(p)
      if (mi >= 0) {
        drag.current = { kind: 'mouth', i: mi }
        return
      }
    }
    if (mode === 'design') {
      const T = archToImage(project, variant, bmp.width, bmp.height)
      const as = toScreen(T.anchor)
      if (Math.hypot(as.x - sx, as.y - sy) < 14) {
        drag.current = { kind: 'anchor', start: p, a0: { ...T.anchor } }
        return
      }
      if (selected) {
        const h = toothHandles(selected)
        const cfg = variant.teeth[selected]
        const pl = getEngine().layout?.byFdi.get(selected)
        if (h && cfg && pl) {
          for (const hp of h.points) {
            const sp = toScreen(hp.p)
            if (Math.hypot(sp.x - sx, sp.y - sy) < 10) {
              const cx = (h.box.x0 + h.box.x1) / 2
              const cy = (h.box.y0 + h.box.y1) / 2
              if (hp.kind === 'wL' || hp.kind === 'wR') {
                const half0 = Math.max(1, (h.box.x1 - h.box.x0) / 2)
                drag.current = { kind: 'width', fdi: selected, w0: cfg.w, half0, cx }
              } else if (hp.kind === 'top' || hp.kind === 'bottom') {
                drag.current = { kind: 'height', fdi: selected, end: hp.kind, h0: cfg.h, H0: pl.spec.H, dy0: cfg.dy }
              } else {
                drag.current = { kind: 'rot', fdi: selected, a0: Math.atan2(p.y - cy, p.x - cx), tip0: cfg.tip, cx, cy }
              }
              return
            }
          }
        }
      }
      // seleção / arrastar dente
      const eng = getEngine()
      const k = lastScale.current
      const hit = eng.pick(p.x * k, p.y * k)
      if (hit) {
        select(hit)
        drag.current = { kind: 'move', fdi: hit, start: p, cfg: { dx: variant.teeth[hit].dx, dy: variant.teeth[hit].dy } }
        return
      }
      select(null)
    }
    drag.current = { kind: 'pan', sx, sy, ox: view.current.ox, oy: view.current.oy }
  }

  const onMove = (e: React.PointerEvent) => {
    const c = cv.current!
    const rect = c.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const d = drag.current
    if (!d) {
      // cursor
      let cur = 'grab'
      if (tool) cur = 'crosshair'
      else if (bmp) {
        const p = toImage(sx, sy)
        if (mode === 'analysis' && (hitMark(p) || hitMouth(p) >= 0)) cur = 'move'
        if (mode === 'design') {
          const k = lastScale.current
          if (getEngine().pick(p.x * k, p.y * k)) cur = 'pointer'
        }
      }
      c.style.cursor = cur
      return
    }
    const p = toImage(sx, sy)
    if (d.kind === 'pan') {
      view.current.ox = d.ox + (sx - d.sx)
      view.current.oy = d.oy + (sy - d.sy)
      schedule()
      return
    }
    if (!bmp) return
    const T = archToImage(project, variant, bmp.width, bmp.height)
    if (d.kind === 'split') {
      setState({ split: clamp(p.x / bmp.width, 0.02, 0.98) })
    } else if (d.kind === 'mark') {
      mutate((pr) => setMark(pr.marks, d.key, p), 'mark-' + d.key)
    } else if (d.kind === 'mouth') {
      mutate((pr) => {
        if (pr.marks.mouth) pr.marks.mouth[d.i] = p
      }, 'mouth-' + d.i)
    } else if (d.kind === 'anchor') {
      mutateVariant((v) => {
        v.anchor = { x: d.a0.x + (p.x - d.start.x), y: d.a0.y + (p.y - d.start.y) }
      }, 'anchor')
    } else if (d.kind === 'move') {
      const pl = getEngine().layout?.byFdi.get(d.fdi)
      if (!pl) return
      const A = T.toArch(p.x, p.y)
      const B = T.toArch(d.start.x, d.start.y)
      const e0 = pl.matrix.elements[0]
      const ex = Math.abs(e0) < 0.35 ? 0.35 * (e0 < 0 ? -1 : 1) : e0
      const ndx = d.cfg.dx + (A.x - B.x) / ex
      const ndy = d.cfg.dy + (A.y - B.y)
      applyCfg(d.fdi, (cfg) => {
        cfg.dx = ndx
        cfg.dy = ndy
      }, 'move-' + d.fdi)
    } else if (d.kind === 'width') {
      const half = Math.abs(p.x - d.cx)
      const ratio = clamp(half / d.half0, 0.4, 2)
      applyCfg(d.fdi, (cfg) => {
        cfg.w = clamp(d.w0 * ratio, 0.5, 1.8)
      }, 'w-' + d.fdi)
    } else if (d.kind === 'height') {
      const pl = getEngine().layout?.byFdi.get(d.fdi)
      if (!pl) return
      const A = T.toArch(p.x, p.y)
      const edgeY = pl.position.y - pl.cfg.dy + d.dy0
      const upper = pl.arch === 'upper'
      const cervEnd = upper ? 'top' : 'bottom'
      if (d.end === cervEnd) {
        const H = upper ? A.y - edgeY : edgeY - A.y
        applyCfg(d.fdi, (cfg) => {
          cfg.h = clamp(d.h0 * (H / d.H0), 0.4, 1.8)
        }, 'h-' + d.fdi)
      } else {
        const dyN = A.y - edgeY
        const newH = upper ? d.H0 - dyN : d.H0 + dyN
        applyCfg(d.fdi, (cfg) => {
          cfg.dy = d.dy0 + dyN
          cfg.h = clamp(d.h0 * (newH / d.H0), 0.4, 1.8)
        }, 'e-' + d.fdi)
      }
    } else if (d.kind === 'rot') {
      const ang = Math.atan2(p.y - d.cy, p.x - d.cx)
      let da = ((ang - d.a0) * 180) / Math.PI
      if (da > 180) da -= 360
      if (da < -180) da += 360
      const side = fdiSide(d.fdi)
      const pl = getEngine().layout?.byFdi.get(d.fdi)
      const sgn = side * (pl?.arch === 'lower' ? -1 : 1)
      applyCfg(d.fdi, (cfg) => {
        cfg.tip = clamp(d.tip0 + da * sgn, -25, 25)
      }, 'rot-' + d.fdi, (cfg) => {
        cfg.tip = clamp(d.tip0 + da * sgn, -25, 25)
      })
    }
  }

  const onUp = () => {
    drag.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    const c = cv.current!
    const rect = c.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const v = view.current
    const k = Math.exp(-e.deltaY * 0.0015)
    const nz = clamp(v.zoom * k, 0.05, 12)
    const ip = toImage(sx, sy)
    v.zoom = nz
    v.ox = sx - ip.x * nz
    v.oy = sy - ip.y * nz
    schedule()
  }

  const dbl = () => {
    fit()
    schedule()
  }
  void dbl

  const eng = getEngine()
  void eng
  const wizHint = useMemo(() => {
    if (tool && mode === 'analysis') return MARK_DEFS.find((d) => d.key === tool)?.hint
    return null
  }, [tool, mode])

  if (!bmp) {
    return (
      <div className="empty">
        <div>
          <h2>Nenhuma foto base</h2>
          <p>Adicione uma foto de sorriso (frontal) em “Fotos” ou abra o caso de demonstração.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stagewrap" ref={wrap}>
      <canvas
        ref={cv}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        onDoubleClick={dbl}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="stagebar">
        <button className="btn sm" onClick={dbl} title="Foto inteira (duplo clique)">Foto</button>
        <button className="btn sm" onClick={() => { fitMouth(); schedule() }} title="Aproximar no sorriso">Sorriso</button>
        <button className="btn sm" onClick={() => { const v = view.current; v.zoom = 1; v.ox = (v.w - bmp.width) / 2; v.oy = (v.h - bmp.height) / 2; schedule() }} title="Zoom 100%">100%</button>
        {mode !== 'photos' && (
          <div className="seg">
            {(['after', 'before', 'split'] as const).map((c) => (
              <button key={c} className={compare === c ? 'on' : ''} onClick={() => setState({ compare: c })}>
                {c === 'after' ? 'Depois' : c === 'before' ? 'Antes' : 'Antes/Depois'}
              </button>
            ))}
          </div>
        )}
      </div>
      {wizHint && (
        <div className="stagehint">
          <b>{wizardIndex >= 0 ? `Passo ${wizardIndex + 1}/${WIZARD_ORDER.length}: ` : ''}</b>
          {wizHint}
        </div>
      )}
      {mode === 'design' && !wizHint && (
        <div className="stagehint" style={{ opacity: 0.85 }}>
          Clique num dente para selecionar · arraste para mover · alças: <b>largura</b>, <b>comprimento</b>, <b>angulação</b> · losango = mover todo o desenho · roda do mouse = zoom
        </div>
      )}
    </div>
  )
}

function drawLabel(g: CanvasRenderingContext2D, v: { w: number; h: number }, compare: string) {
  g.fillStyle = 'rgba(0,0,0,.55)'
  g.fillRect(v.w - 90, 10, 80, 24)
  g.fillStyle = '#fff'
  g.font = '700 11px system-ui'
  g.textAlign = 'center'
  g.fillText(compare === 'before' ? 'ANTES' : compare === 'after' ? 'DEPOIS' : 'COMPARAR', v.w - 50, 26)
}

export { defaultAnchor, facialMidlineX }
