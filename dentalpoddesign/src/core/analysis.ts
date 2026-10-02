import type { DesignParams, Marks, Project, Pt, Variant } from './types'
import { DEG, angleDeg, clamp, dist, fitParabola } from './math'
import type { Layout } from './designEngine'
import { defaultAnchor, facialMidlineX, mouthPolygon, pupilRoll, pxPerMm } from '../render/overlay'
import { makeFdi } from './toothSpecs'

export type Level = 'ok' | 'warn' | 'bad' | 'info'

export interface AnalysisItem {
  id: string
  group: 'facial' | 'dentolabial' | 'dental' | 'gengival' | 'oclusao'
  label: string
  value: string
  target: string
  level: Level
  tip: string
}

export interface AnalysisResult {
  items: AnalysisItem[]
  score: number | null
  ready: boolean
  missing: string[]
}

export type SilFn = (fdi: number) => Pt[] | null

const f1 = (v: number) => v.toFixed(1).replace('.', ',')
const f2 = (v: number) => v.toFixed(2).replace('.', ',')

/** Converte coordenadas do arco (mm, Y para cima) em pixels da foto. */
export function archToImage(project: Project, variant: Variant, w: number, h: number) {
  const marks = project.marks
  const s = pxPerMm(project, marks)
  const a = variant.anchor ?? defaultAnchor(marks, w, h)
  const r = (pupilRoll(marks) + variant.params.rollOffset) * DEG
  const c = Math.cos(r)
  const sn = Math.sin(r)
  const shift = variant.params.midlineShift
  return {
    s,
    anchor: a,
    roll: r / DEG,
    toImg: (X: number, Y: number): Pt => {
      const Xp = X * c + Y * sn + shift
      const Yp = -X * sn + Y * c
      return { x: a.x + s * Xp, y: a.y - s * Yp }
    },
    toArch: (u: number, v: number): Pt => {
      const Xp = (u - a.x) / s - shift
      const Yp = -(v - a.y) / s
      return { x: Xp * c - Yp * sn, y: Xp * sn + Yp * c }
    },
  }
}

export function lowerLipBorder(marks: Marks): Pt[] {
  if (marks.lowerLipCurve && marks.lowerLipCurve.length >= 3) return marks.lowerLipCurve
  const poly = mouthPolygon(marks, 8)
  if (!poly.length || !marks.upMid || !marks.lowMid) return []
  const ymid = (marks.upMid.y + marks.lowMid.y) / 2
  const xs = poly.map((p) => p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  return poly.filter((p) => p.y >= ymid - 4 && p.x > x0 + (x1 - x0) * 0.06 && p.x < x1 - (x1 - x0) * 0.06).sort((a, b) => a.x - b.x)
}

export function upperLipBorder(marks: Marks): Pt[] {
  const poly = mouthPolygon(marks, 8)
  if (!poly.length || !marks.upMid || !marks.lowMid) return []
  const ymid = (marks.upMid.y + marks.lowMid.y) / 2
  const xs = poly.map((p) => p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  return poly.filter((p) => p.y <= ymid + 4 && p.x > x0 + (x1 - x0) * 0.04 && p.x < x1 - (x1 - x0) * 0.04).sort((a, b) => a.x - b.x)
}

export function biometricSuggestion(project: Project): { fromFace: number | null; fromNose: number | null; label: string } {
  const m = project.marks
  const s = pxPerMm(project, m)
  const fromFace = m.zygR && m.zygL ? dist(m.zygR, m.zygL) / s / 16 : null
  const fromNose = m.alarR && m.alarL ? dist(m.alarR, m.alarL) / s / 4 : null
  return { fromFace, fromNose, label: 'Largura bizigomática ÷ 16 (Gerber) · largura interalar ÷ 4 (Lombardi)' }
}

export function analyze(project: Project, variant: Variant, layout: Layout, sil: SilFn, photoW: number, photoH: number): AnalysisResult {
  const m = project.marks
  const p = variant.params
  const items: AnalysisItem[] = []
  const missing: string[] = []
  if (!m.pupilR || !m.pupilL) missing.push('pupilas')
  if (!m.midTop || !m.midBottom) missing.push('linha média facial')
  if (!m.commR || !m.commL) missing.push('comissuras')
  if (!m.mouth || m.mouth.length < 4) missing.push('contorno dos lábios')
  const T = archToImage(project, variant, photoW, photoH)
  const s = T.s

  const add = (i: AnalysisItem) => items.push(i)
  const levelBand = (v: number, ok: [number, number], warn: [number, number]): Level =>
    v >= ok[0] && v <= ok[1] ? 'ok' : v >= warn[0] && v <= warn[1] ? 'warn' : 'bad'

  // ---- facial ---------------------------------------------------------------------------------------------------
  if (m.pupilR && m.pupilL) {
    const a = pupilRoll(m)
    add({ id: 'pupil', group: 'facial', label: 'Linha bipupilar (inclinação)', value: `${f1(a)}°`, target: 'referência horizontal', level: 'info', tip: 'A linha entre as pupilas é a referência primária do plano incisal.' })
    if (m.commR && m.commL) {
      const l = m.commR.x < m.commL.x ? [m.commR, m.commL] : [m.commL, m.commR]
      const ac = angleDeg(l[0], l[1])
      const d = Math.abs(ac - a)
      add({ id: 'comm', group: 'facial', label: 'Linha comissural × bipupilar', value: `${f1(d)}°`, target: '≤ 1,5°', level: levelBand(d, [0, 1.5], [0, 3]), tip: 'Assimetrias comissurais explicam compensações do plano incisal.' })
    }
  }
  if (m.midTop && m.midBottom && m.pupilR && m.pupilL) {
    const mid = angleDeg(m.midTop, m.midBottom) - 90
    const tilt = Math.abs(mid - (pupilRoll(m)))
    add({ id: 'facialMid', group: 'facial', label: 'Linha média facial × perpendicular à bipupilar', value: `${f1(tilt)}°`, target: '≤ 2°', level: levelBand(tilt, [0, 2], [0, 4]), tip: 'A linha média facial deve ser perpendicular à linha bipupilar; fotos inclinadas distorcem a análise.' })
  }

  // ---- dentolabial ------------------------------------------------------------------------------------------------
  const anchor = T.anchor
  const faceX = facialMidlineX(m, anchor.y)
  if (faceX !== null) {
    const dentalMidX = T.toImg(0, 0).x
    const d = (dentalMidX - faceX) / s
    add({ id: 'midline', group: 'dentolabial', label: 'Linha média dental × facial', value: `${f1(d)} mm`, target: '≤ 1 mm', level: levelBand(Math.abs(d), [0, 1], [0, 2]), tip: 'Desvios até 2 mm são pouco percebidos; acima disso, corrigir a posição da linha média.' })
  }
  add({ id: 'cant', group: 'dentolabial', label: 'Plano incisal × bipupilar', value: `${f1(p.rollOffset)}°`, target: '≤ 1°', level: levelBand(Math.abs(p.rollOffset), [0, 1], [0, 2.5]), tip: 'O plano incisal deve ser paralelo à linha bipupilar.' })

  if (m.commR && m.commL) {
    const smileW = dist(m.commR, m.commL) / s
    add({ id: 'smileW', group: 'dentolabial', label: 'Largura do sorriso (comissura a comissura)', value: `${f1(smileW)} mm`, target: 'informativo', level: 'info', tip: 'Base para calcular o corredor bucal.' })
    const up = layout.upper.filter((t) => t.designed)
    if (up.length) {
      let x0 = Infinity
      let x1 = -Infinity
      for (const t of up) {
        const sl = sil(t.fdi)
        if (!sl) continue
        for (const q of sl) {
          const X = t.matrix.elements[0] * q.x + t.matrix.elements[4] * q.y + t.matrix.elements[12]
          if (X < x0) x0 = X
          if (X > x1) x1 = X
        }
      }
      if (Number.isFinite(x0)) {
        const tw = x1 - x0
        const cor = ((smileW - tw) / smileW) * 100
        add({ id: 'corridor', group: 'dentolabial', label: 'Corredor bucal', value: `${f1(cor)} %`, target: '8 – 20 %', level: levelBand(cor, [8, 20], [2, 28]), tip: 'Corredor muito grande deixa o sorriso estreito; inexistente deixa-o "falso". Ajuste a largura do arco.' })
      }
    }
  }

  if (m.upMid && m.lowMid) {
    const edge = T.toImg(0, layout.byFdi.get(21)?.edgeY ?? 0)
    const H = layout.byFdi.get(21)?.spec.H ?? 10.5
    const lipY = m.upMid.y
    const visible = (edge.y - lipY) / s
    const pct = clamp((visible / H) * 100, 0, 200)
    add({ id: 'display', group: 'dentolabial', label: 'Exposição do incisivo central ao sorrir', value: `${f1(visible)} mm (${f1(pct)} %)`, target: '75 – 100 % do comprimento', level: levelBand(pct, [75, 100], [55, 110]), tip: 'Linha do sorriso média: 75–100% dos incisivos visíveis, com até 1 mm de gengiva.' })
    const zen = T.toImg(0, (layout.byFdi.get(21)?.edgeY ?? 0) + H)
    const gum = (lipY - zen.y) / s
    add({ id: 'gum', group: 'gengival', label: 'Exposição gengival (zênite do central)', value: `${f1(Math.max(0, gum))} mm`, target: '≤ 2 mm', level: gum <= 0 ? 'ok' : levelBand(gum, [0, 2], [0, 3.5]), tip: 'Sorriso gengival acima de 3 mm pode exigir aumento de coroa clínica ou toxina botulínica.' })

    // arco do sorriso
    const border = lowerLipBorder(m)
    if (border.length >= 4) {
      const edges: Pt[] = []
      for (const t of layout.upper) {
        if (!t.designed || t.n > 5) continue
        const e = T.toImg(0, 0)
        void e
        const pos = t.position
        edges.push(T.toImg(pos.x, pos.y))
      }
      if (edges.length >= 4) {
        const pe = fitParabola(edges.map((q) => ({ x: q.x - anchor.x, y: q.y })))
        const pl = fitParabola(border.map((q) => ({ x: q.x - anchor.x, y: q.y })))
        // y de imagem: parábola de borda convexa p/ baixo (centro mais baixo) → a negativo
        const dA = (pe.a - pl.a) * 1e5
        const half = Math.max(...edges.map((q) => Math.abs(q.x - anchor.x)))
        const gapAt = (x: number) => (pl.a * x * x + pl.b * x + pl.c - (pe.a * x * x + pe.b * x + pe.c)) / s
        const gaps = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((k) => gapAt(k * half))
        const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
        const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - meanGap) ** 2, 0) / gaps.length)
        let kind = 'consonante'
        if (sd > 1.1) kind = pe.a > 0 ? 'reverso' : 'plano / divergente'
        else if (sd > 0.55) kind = 'parcialmente consonante'
        const level: Level = sd <= 0.55 ? 'ok' : sd <= 1.1 ? 'warn' : 'bad'
        add({ id: 'arc', group: 'dentolabial', label: 'Arco do sorriso × lábio inferior', value: `${kind} · variação ${f1(sd)} mm`, target: 'consonante (paralelo ao lábio)', level, tip: 'Os bordos incisais devem acompanhar a curvatura do lábio inferior. Use "Ajustar arco ao lábio" no Desenho.' })
        add({ id: 'lipGap', group: 'dentolabial', label: 'Distância bordos incisais → lábio inferior (centro)', value: `${f1(gapAt(0))} mm`, target: 'informativo', level: 'info', tip: 'Idealmente os bordos incisais tocam levemente o lábio inferior; se os dentes inferiores aparecem no sorriso, uma distância maior é esperada.' })
        void dA
      }
    }
  }

  // ---- dental ----------------------------------------------------------------------------------------------------
  const c21 = layout.byFdi.get(21) ?? layout.byFdi.get(11)
  if (c21) {
    const wl = (c21.spec.W / c21.spec.H) * 100
    add({ id: 'wl', group: 'dental', label: 'Relação largura/altura do central', value: `${f1(wl)} %`, target: '75 – 85 %', level: levelBand(wl, [75, 85], [70, 92]), tip: 'Centrais mais largos (>85%) parecem curtos; mais estreitos (<75%) parecem alongados.' })
  }
  const apparent = (fdi: number): number | null => {
    const sl = sil(fdi)
    const t = layout.byFdi.get(fdi)
    if (!sl || !t) return null
    let a = Infinity
    let b = -Infinity
    for (const q of sl) {
      const X = t.matrix.elements[0] * q.x + t.matrix.elements[4] * q.y + t.matrix.elements[12]
      a = Math.min(a, X)
      b = Math.max(b, X)
    }
    return b - a
  }
  const wc = apparent(21)
  const wl2 = apparent(22)
  const wca = apparent(23)
  if (wc && wl2 && wca && layout.byFdi.get(22)?.designed) {
    const r2 = (wl2 / wc) * 100
    const r3 = (wca / wc) * 100
    add({ id: 'prop', group: 'dental', label: 'Proporção aparente central : lateral : canino', value: `100 : ${f1(r2)} : ${f1(r3)} %`, target: 'lateral 62–78 % · canino 38–62 %', level: r2 >= 62 && r2 <= 78 && r3 >= 38 && r3 <= 66 ? 'ok' : r2 >= 56 && r2 <= 84 ? 'warn' : 'bad', tip: 'Áurea 100:62:38 · RED 100:70:49 · Preston 100:66:55.' })
  }
  // simetria
  const sym: number[] = []
  for (let n = 1; n <= 3; n++) {
    const a = apparent(makeFdi('upper', -1, n))
    const b = apparent(makeFdi('upper', 1, n))
    if (a && b && layout.byFdi.get(makeFdi('upper', -1, n))?.designed && layout.byFdi.get(makeFdi('upper', 1, n))?.designed) sym.push(Math.abs(a - b))
  }
  if (sym.length) {
    const mx = Math.max(...sym)
    add({ id: 'sym', group: 'dental', label: 'Simetria de largura (direita × esquerda)', value: `${f2(mx)} mm`, target: '≤ 0,3 mm', level: levelBand(mx, [0, 0.3], [0, 0.7]), tip: 'Diferenças >0,5 mm entre homólogos são percebidas.' })
  }
  // alturas incisais
  const e = (n: number, side: -1 | 1) => layout.byFdi.get(makeFdi('upper', side, n))
  const c1 = e(1, 1)
  const c2 = e(2, 1)
  const c3 = e(3, 1)
  if (c1 && c2 && c3 && c2.designed) {
    const d2 = c2.edgeY - c1.edgeY
    const d3 = c3.edgeY - c1.edgeY
    add({ id: 'edges', group: 'dental', label: 'Bordos: lateral e canino em relação ao central', value: `lateral +${f1(d2)} mm · canino ${d3 >= 0 ? '+' : ''}${f1(d3)} mm`, target: 'lateral 0,3–1,2 mm mais curto · canino ≈ central', level: d2 >= 0.3 && d2 <= 1.2 && Math.abs(d3) <= 0.9 ? 'ok' : d2 >= 0 && d2 <= 1.8 ? 'warn' : 'bad', tip: 'Laterais ligeiramente mais curtos criam o desenho "gaivota" desejável no arco do sorriso.' })
    const z = (t: typeof c1) => t.edgeY + t.spec.H
    const dz = z(c1) - z(c2)
    const dzc = Math.abs(z(c1) - z(c3))
    add({ id: 'zenith', group: 'gengival', label: 'Zênites gengivais (lateral × central/canino)', value: `lateral ${dz >= 0 ? '+' : ''}${f1(dz)} mm · canino-central ${f1(dzc)} mm`, target: 'lateral 0,5–1,5 mm coronal · canino = central', level: dz >= 0.4 && dz <= 1.6 && dzc <= 0.6 ? 'ok' : dz >= 0 && dz <= 2.4 ? 'warn' : 'bad', tip: 'Zênites do central e canino na mesma linha; o do lateral 0,5–1 mm mais incisal.' })
  }
  const sug = biometricSuggestion(project)
  const ref = sug.fromFace ?? sug.fromNose
  if (ref) {
    const d = p.centralWidth - ref
    add({ id: 'bio', group: 'dental', label: 'Largura do central × biometria facial', value: `${f1(p.centralWidth)} mm (sugerido ${f1(ref)} mm)`, target: '± 0,6 mm', level: levelBand(Math.abs(d), [0, 0.6], [0, 1.2]), tip: sug.label })
  }

  // ---- oclusão -----------------------------------------------------------------------------------------------------
  if (p.lowerEnabled) {
    add({ id: 'overbite', group: 'oclusao', label: 'Sobremordida (trespasse vertical)', value: `${f1(p.overbite)} mm`, target: '1 – 3 mm', level: levelBand(p.overbite, [1, 3], [0, 4.5]), tip: 'Trespasse vertical normal: 1–3 mm.' })
    add({ id: 'overjet', group: 'oclusao', label: 'Sobressaliência (trespasse horizontal)', value: `${f1(p.overjet)} mm`, target: '1 – 3 mm', level: levelBand(p.overjet, [1, 3], [0, 4.5]), tip: 'Trespasse horizontal normal: 1–3 mm.' })
  }
  add({
    id: 'calib',
    group: 'facial',
    label: 'Calibração da foto',
    value: project.calib.method === 'ipd' ? `por distância interpupilar (${f1(project.calib.ipdMm)} mm) — estimada` : project.calib.method === 'twoPoints' ? 'por medida de referência' : 'manual',
    target: 'medida real para fabricação',
    level: project.calib.method === 'ipd' ? 'warn' : 'ok',
    tip: 'A distância interpupilar varia ±5%. Para impressão/fresagem, calibre com uma medida real (régua, largura do central).',
  })

  const scored = items.filter((i) => i.level !== 'info')
  const score = scored.length ? Math.round((scored.reduce((a, i) => a + (i.level === 'ok' ? 1 : i.level === 'warn' ? 0.55 : 0.15), 0) / scored.length) * 100) : null
  return { items, score, ready: missing.length === 0, missing }
}

/** Ajusta o fator de arco do sorriso para acompanhar a curvatura do lábio inferior (mínimos quadrados). */
export function fitSmileArc(project: Project, variant: Variant, layout: Layout, w: number, h: number): { smileArc: number } | null {
  const m = project.marks
  const border = lowerLipBorder(m)
  if (border.length < 4) return null
  const T = archToImage(project, variant, w, h)
  const pts = border.map((q) => T.toArch(q.x, q.y))
  const fit = fitParabola(pts.map((q) => ({ x: q.x, y: q.y })))
  const lipY = (x: number) => fit.a * x * x + fit.b * x + fit.c
  const OFFS = [0, 0.6, 0.4, 1.3, 2.3]
  let num = 0
  let den = 0
  for (const t of layout.upper) {
    if (t.n > 5 || !t.designed) continue
    const off = t.n === 2 ? 0.6 : OFFS[t.n - 1]
    const dy = lipY(t.position.x) - lipY(0)
    num += dy * off
    den += off * off
  }
  const k = den > 1e-6 ? clamp(num / den, 0.2, 2.5) : variant.params.smileArc
  return { smileArc: k }
}

/** Altura incisal para expor `display` (0–1) do comprimento do central abaixo do lábio superior. */
export function incisalOffsetForDisplay(project: Project, variant: Variant, layout: Layout, w: number, h: number, display = 0.92): number | null {
  const m = project.marks
  if (!m.upMid) return null
  const c = layout.byFdi.get(21) ?? layout.byFdi.get(11)
  if (!c) return null
  const T = archToImage(project, variant, w, h)
  // posição desejada (px) do bordo incisal do central
  const wantY = m.upMid.y + display * c.spec.H * T.s
  const wantArch = T.toArch(T.toImg(0, 0).x, wantY)
  return wantArch.y - (c.edgeY - variant.params.incisalOffset)
}

export type { DesignParams }
