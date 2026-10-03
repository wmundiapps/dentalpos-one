import * as THREE from 'three'
import type { DesignParams, Marks, Project, Pt, Variant } from './types'
import { DEG, angleDeg, clamp, dist, fitParabola } from './math'
import { TIP_LO, TIP_UP, TORQUE_LO, TORQUE_UP, type Layout } from './designEngine'
import { defaultAnchor, facialMidlineX, mouthPolygon, pupilRoll, pxPerMm } from '../render/overlay'
import { makeFdi } from './toothSpecs'

export type Level = 'ok' | 'warn' | 'bad' | 'info'

export interface AnalysisItem {
  id: string
  group: 'facial' | 'dentolabial' | 'dental' | 'gengival' | 'oclusao' | 'chaves'
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

function lipYForGum(layout: Layout, T: ReturnType<typeof archToImage>, m: Marks): number {
  const c = layout.byFdi.get(21) ?? layout.byFdi.get(11)
  if (!c || !m.upMid) return 0
  const z = T.toImg(0, c.zenithY)
  return (m.upMid.y - z.y) / T.s
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
        add({ id: 'corridor', group: 'dentolabial', label: 'Corredor bucal', value: `${f1(cor)} %`, target: '6 – 16 %', level: levelBand(cor, [6, 16], [2, 24]), tip: 'O fundo escuro entre dentes e bochecha não deve aparecer muito: inclua mais dentes posteriores ou alargue o arco. Inexistente deixa o sorriso "falso".' })
      }
    }
  }

  if (m.upMid && m.lowMid) {
    const edge = T.toImg(0, layout.byFdi.get(21)?.edgeY ?? 0)
    const H = layout.byFdi.get(21)?.spec.H ?? 10.5
    const lipY = m.upMid.y
    const visible = (edge.y - lipY) / s
    const pct = clamp((visible / H) * 100, 0, 200)
    add({ id: 'display', group: 'dentolabial', label: 'Exposição do incisivo central ao sorrir', value: `${f1(visible)} mm (${f1(pct)} %) · linha do sorriso ${pct < 75 ? 'baixa' : (lipYForGum(layout, T, m) > 2 ? 'alta' : 'média')}`, target: '75 – 100 % do comprimento', level: levelBand(pct, [75, 100], [55, 110]), tip: 'Linha do sorriso média: 75–100% dos incisivos visíveis, com até 1 mm de gengiva.' })
    const zen = T.toImg(0, (layout.byFdi.get(21)?.edgeY ?? 0) + H)
    const gum = (lipY - zen.y) / s
    add({ id: 'gum', group: 'gengival', label: 'Exposição gengival (zênite do central)', value: `${f1(Math.max(0, gum))} mm`, target: '0,2 – 1,5 mm (gengiva levemente visível)', level: gum >= 0.2 && gum <= 1.5 ? 'ok' : gum > 1.5 && gum <= 3 ? 'warn' : gum < 0.2 ? 'warn' : 'bad', tip: 'Linha do sorriso ideal: a gengiva aparece levemente. Acima de 3 mm pode exigir aumento de coroa clínica/toxina; sem gengiva = linha baixa.' })

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
        add({ id: 'lipGap', group: 'dentolabial', label: 'Distância bordos incisais → lábio inferior (centro)', value: `${f1(gapAt(0))} mm`, target: '0 – 1,2 mm (tocam levemente)', level: gapAt(0) >= -0.8 && gapAt(0) <= 1.2 ? 'ok' : gapAt(0) <= 2.5 ? 'warn' : 'bad', tip: 'Incisivos e caninos devem tocar levemente o lábio inferior. Se os dentes inferiores aparecem no sorriso, uma distância maior é esperada (ajuste a altura incisal/comprimento).' })
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
  }
  // zênites: central = canino; lateral = pré-molar; molares seguem os pré-molares
  {
    const U = (n: number) => layout.byFdi.get(makeFdi('upper', 1, n))
    const z1 = U(1)?.zenithY
    const z2 = U(2)?.zenithY
    const z3 = U(3)?.zenithY
    const z4 = U(4)?.zenithY
    const z6 = U(6)?.zenithY
    if (z1 !== undefined && z2 !== undefined && z3 !== undefined && U(2)?.designed) {
      const dcc = Math.abs(z1 - z3)
      const dlat = z1 - z2
      const dlp = z4 !== undefined && U(4)?.designed ? Math.abs(z2 - z4) : 0
      const okAll = dcc <= 0.4 && dlat >= 0.3 && dlat <= 1.0 && dlp <= 0.4
      add({ id: 'zenith', group: 'gengival', label: 'Zênites: central = canino · lateral = pré-molar', value: `central–canino ${f1(dcc)} mm · lateral ${dlat >= 0 ? '+' : ''}${f1(dlat)} mm${z4 !== undefined && U(4)?.designed ? ` · lateral–PM ${f1(dlp)} mm` : ''}`, target: 'central = canino · lateral 0,5 mm coronal = pré-molar', level: okAll ? 'ok' : dcc <= 0.8 && dlat >= 0 && dlat <= 1.6 ? 'warn' : 'bad', tip: 'Contorno gengival: centrais e caninos na mesma altura; laterais e pré-molares na mesma altura (≈0,5 mm mais coronal).' })
      if (z6 !== undefined && z4 !== undefined && U(6)?.designed) {
        const dm = z4 - z6
        add({ id: 'zenithM', group: 'gengival', label: 'Zênite dos molares segue o dos pré-molares', value: `${dm >= 0 ? '+' : ''}${f1(dm)} mm`, target: '0 – 1 mm mais coronal', level: dm >= -0.1 && dm <= 1.1 ? 'ok' : 'warn', tip: 'Molares acompanham a cervical dos pré-molares (X−0,5 / X−1).' })
      }
    }
  }
  const sug = biometricSuggestion(project)
  const ref = sug.fromFace ?? sug.fromNose
  if (ref) {
    const d = p.centralWidth - ref
    add({ id: 'bio', group: 'dental', label: 'Largura do central × biometria facial', value: `${f1(p.centralWidth)} mm (sugerido ${f1(ref)} mm)`, target: '± 0,6 mm', level: levelBand(Math.abs(d), [0, 0.6], [0, 1.2]), tip: sug.label })
  }

  // ---- eixo do canino × pupila ----------------------------------------------------------------------------------
  if (m.pupilR && m.pupilL) {
    const tc = layout.byFdi.get(makeFdi('upper', 1, 3))
    if (tc?.designed) {
      const pupil = m.pupilL.x > m.pupilR.x ? m.pupilL : m.pupilR // lado do dente 23 (esquerda da imagem→direita)
      const P = T.toArch(pupil.x, pupil.y)
      const edge = tc.position
      const cerv = new THREE.Vector3(0, -tc.spec.H, 0).applyMatrix4(tc.matrix)
      const axis = Math.atan2(cerv.x - edge.x, cerv.y - edge.y)
      const toP = Math.atan2(P.x - edge.x, P.y - edge.y)
      const d = ((axis - toP) * 180) / Math.PI
      void 0
      add({ id: 'canineAxis', group: 'dental', label: 'Eixo do canino superior → pupila', value: `${f1(Math.abs(d))}° de desvio (eixo ${f1((axis * 180) / Math.PI)}°)`, target: '≤ 6°', level: levelBand(Math.abs(d), [0, 6], [0, 10]), tip: 'A localização/angulação do canino tem como referência a pupila do paciente: o longo eixo do canino aponta para ela.' })
    }
  }

  // ---- forma do rosto × forma dos dentes -------------------------------------------------------------------------------
  if (project.face) {
    const want: Record<string, string[]> = { square: ['square', 'rectangular'], round: ['round', 'ovoid'], oval: ['ovoid', 'natural'], triangular: ['triangular', 'ovoid'] }
    const sh = p.shape
    add({ id: 'faceShape', group: 'dental', label: `Rosto ${project.face.label.toLowerCase()} × dentes ${sh}`, value: `L/A ${f2(project.face.lengthWidth)} · mand./zig. ${f2(project.face.jawCheek)}`, target: 'rosto quadrado → dentes quadrados; arredondado → arredondados', level: want[project.face.shape].includes(sh) ? 'ok' : 'warn', tip: 'A forma do dente deve harmonizar com a do rosto (Lombardi/Frush & Fisher).' })
  }

  // ---- seis chaves de Andrews + curvas -------------------------------------------------------------------------------
  {
    const designedUp = layout.upper.filter((t) => t.designed)
    if (p.lowerEnabled && layout.classI) {
      const ok = layout.classI.molar <= 1.0 && layout.classI.canine <= 1.0
      add({ id: 'key1', group: 'chaves', label: 'Chave 1 — Relação molar e de canino (classe I)', value: `molar ${f1(layout.classI.molar)} mm · canino ${f1(layout.classI.canine)} mm de desvio`, target: 'MV do 1º molar sup. no sulco do inferior; canino sup. na embrasura', level: ok ? 'ok' : 'warn', tip: 'Cúspide mésio-vestibular do 1º molar superior ocluindo no sulco entre as cúspides MV e média do inferior.' })
    } else {
      add({ id: 'key1', group: 'chaves', label: 'Chave 1 — Relação molar e de canino (classe I)', value: p.lowerEnabled ? 'inclua o 1º molar (≥ 6 dentes)' : 'ative a arcada inferior', target: 'classe I', level: 'info', tip: 'Ative a arcada inferior e “Alinhar classe I” em Oclusão.' })
    }
    const tipOf = (t: (typeof layout.all)[number]) => (t.arch === 'upper' ? TIP_UP : TIP_LO)[t.n - 1] * p.tipScale + t.cfg.tip
    const tipBad = layout.all.filter((t) => t.designed && tipOf(t) <= 0.2)
    add({ id: 'key2', group: 'chaves', label: 'Chave 2 — Angulação das coroas (positiva)', value: tipBad.length ? `${tipBad.length} dente(s) sem angulação positiva` : 'todas positivas', target: 'ângulo coronário positivo (cervical distal)', level: tipBad.length ? 'warn' : 'ok', tip: 'Todas as coroas com angulação mesio-distal positiva (central ≈ 3°, lateral ≈ 5°, canino ≈ 8°).' })
    const torque = (t: (typeof layout.all)[number]) => (t.arch === 'upper' ? TORQUE_UP : TORQUE_LO)[t.n - 1] * (t.n >= 4 ? p.wilson * p.torqueScale : p.torqueScale) + t.cfg.torque
    const tq = (arch: 'upper' | 'lower', n: number) => {
      const t = layout.byFdi.get(makeFdi(arch, 1, n))
      return t ? torque(t) : null
    }
    const seqU = [4, 5, 6, 7].map((n) => tq('upper', n)).filter((x): x is number => x !== null)
    const prog = (a: number[]) => a.every((v, i) => i === 0 || v <= a[i - 1] + 0.01)
    const antU = [1, 2].map((n) => tq('upper', n)).filter((x): x is number => x !== null)
    const lowAnt = [1, 2].map((n) => tq('lower', n)).filter((x): x is number => x !== null)
    const seqL = [4, 5, 6, 7].map((n) => tq('lower', n)).filter((x): x is number => x !== null)
    const k3 = antU.every((v) => v > 0) && seqU.every((v) => v < 0) && prog(seqU) && (!lowAnt.length || lowAnt.every((v) => Math.abs(v) <= 4)) && prog(seqL)
    add({ id: 'key3', group: 'chaves', label: 'Chave 3 — Inclinação (torque) e curva de Wilson', value: `sup. ${antU.map((v) => f1(v) + '°').join('/')} → ${seqU.map((v) => f1(v) + '°').join('/')} · inf. ${seqL.map((v) => f1(v) + '°').join('/')}`, target: 'anteriores sup. p/ vestibular; PM/molares p/ palatina/lingual, progressivo', level: k3 ? 'ok' : 'warn', tip: 'Superiores anteriores levemente vestibularizados; pré-molares e molares inclinados para palatina progressivamente; inferiores com inclinação lingual progressiva (curva de Wilson).' })
    const rots = designedUp.filter((t) => Math.abs(t.cfg.rot) > 3)
    add({ id: 'key4', group: 'chaves', label: 'Chave 4 — Sem rotações', value: rots.length ? `${rots.length} dente(s) rotacionado(s)` : 'sem rotações (além do off-set artístico)', target: '|rotação| ≤ 3°', level: rots.length ? 'warn' : 'ok', tip: 'Dentes sem rotação indesejada; o “toe-in” artístico dos molares é intencional.' })
    let maxGap = 0
    for (const arch of [layout.upper, layout.lower]) {
      for (const side of [-1, 1] as const) {
        const row = arch.filter((t) => t.side === side && t.designed).sort((a, b) => a.n - b.n)
        for (let i = 1; i < row.length; i++) if (row[i].n === row[i - 1].n + 1) maxGap = Math.max(maxGap, Math.abs(row[i].cfg.dx - row[i - 1].cfg.dx))
      }
    }
    add({ id: 'key5', group: 'chaves', label: 'Chave 5 — Contatos justos (sem diastemas)', value: `${f2(maxGap)} mm de folga/sobreposição`, target: '≤ 0,3 mm', level: maxGap <= 0.3 ? 'ok' : maxGap <= 0.8 ? 'warn' : 'bad', tip: 'Pontos de contato proximais justos e zênites sem fundo escuro entre os dentes.' })
    add({ id: 'key6', group: 'chaves', label: 'Chave 6 — Curva de Spee plana ou discreta', value: `${f1(p.spee)} mm`, target: '≤ 1,5 mm', level: p.spee <= 1.5 ? 'ok' : p.spee <= 2.5 ? 'warn' : 'bad', tip: 'Curva de Spee de 0 a 1,5 mm.' })
  }

  // ---- plano oclusal (comissura → trágus), foto de perfil -------------------------------------------------------------
  if (m.profComm && m.profTragus) {
    const ang = (Math.atan2(m.profComm.y - m.profTragus.y, Math.abs(m.profTragus.x - m.profComm.x)) * 180) / Math.PI
    add({ id: 'camper', group: 'oclusao', label: 'Plano oclusal (comissura → trágus)', value: `${f1(ang)}° em relação à horizontal`, target: 'o plano oclusal segue esta linha', level: 'info', tip: 'A altura oclusal dos dentes posteriores deve seguir a linha da comissura ao trágus. Use “Aplicar ao plano oclusal” para inclinar o arco no CAD 3D.' })
  }

  // ---- oclusão -----------------------------------------------------------------------------------------------------
  if (p.lowerEnabled) {
    add({ id: 'overbite', group: 'oclusao', label: 'Sobremordida (trespasse vertical)', value: `${f1(p.overbite)} mm`, target: '1 – 2 mm', level: levelBand(p.overbite, [1, 2], [0.5, 3]), tip: 'Trespasse vertical ideal: 1–2 mm.' })
    add({ id: 'overjet', group: 'oclusao', label: 'Sobressaliência (trespasse horizontal)', value: `${f1(p.overjet)} mm`, target: '1 – 2 mm', level: levelBand(p.overjet, [1, 2], [0.5, 3]), tip: 'Trespasse horizontal ideal: 1–2 mm.' })
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
  const k = den > 1e-6 ? clamp(num / den, 0.3, 1.6) : variant.params.smileArc
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

/** Largura (mm) ocupada pelos dentes superiores desenhados e % de corredor bucal. */
export function corridorPercent(project: Project, layout: Layout, sil: SilFn): number | null {
  const m = project.marks
  if (!m.commR || !m.commL) return null
  const s = pxPerMm(project, m)
  const smileW = dist(m.commR, m.commL) / s
  let x0 = Infinity
  let x1 = -Infinity
  for (const t of layout.upper) {
    if (!t.designed) continue
    const sl = sil(t.fdi)
    if (!sl) continue
    for (const q of sl) {
      const X = t.matrix.elements[0] * q.x + t.matrix.elements[4] * q.y + t.matrix.elements[12]
      if (X < x0) x0 = X
      if (X > x1) x1 = X
    }
  }
  if (!Number.isFinite(x0)) return null
  return ((smileW - (x1 - x0)) / smileW) * 100
}

/** Altura incisal que coloca o zênite do central `gumMm` acima da borda do lábio superior (gengiva levemente visível). */
export function incisalOffsetForZenith(project: Project, variant: Variant, layout: Layout, w: number, h: number, gumMm = 0.7): number | null {
  const m = project.marks
  if (!m.upMid) return null
  const c = layout.byFdi.get(21) ?? layout.byFdi.get(11)
  if (!c) return null
  const T = archToImage(project, variant, w, h)
  const wantImgY = m.upMid.y - gumMm * T.s
  const want = T.toArch(T.toImg(0, 0).x, wantImgY)
  return want.y - (c.zenithY - variant.params.incisalOffset)
}
