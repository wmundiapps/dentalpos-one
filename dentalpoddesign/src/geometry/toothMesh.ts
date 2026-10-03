import type { ArchId } from '../core/types'
import type { ToothClass } from '../core/toothSpecs'
import { clamp, gauss, lerp, rng, smoothstep, spow, table } from '../core/math'
import { MeshBuilder, computeNormals, orientMesh, type Mesh } from './mesh'

/**
 * Gerador paramétrico de coroas dentárias.
 *
 * Sistema local do dente:  +X = distal, +Y = para a incisal/oclusal (origem na borda incisal / centro da mesa
 * oclusal), +Z = vestibular. A coroa ocupa Y ∈ [-H, 0].
 *
 * A superfície é gerada por anéis (cortes axiais) de super-elipses cujas dimensões vêm de curvas de perfil
 * anatômicas (convexidade vestibular, cíngulo, fossa lingual, contatos proximais, ângulos incisais, cúspide do
 * canino, mesa oclusal com cúspides/sulcos dos pré-molares e molares). Isso garante malhas fechadas
 * (watertight), com topologia idêntica entre dentes — o que simplifica cascas, coroas ocas e booleanas.
 */

export type RGB = [number, number, number]

export interface CrownColors {
  body: RGB // lineares
  cervical: RGB
  incisal: RGB
  translucency: number // 0–1
  mamelons: number // 0–1
}

export interface CrownSpec {
  fdi: number
  n: number
  arch: ArchId
  cls: ToothClass
  W: number
  H: number
  BL: number
  cerv: number
  tcM: number
  tcD: number
  cornerM: number
  cornerD: number
  edgeDropM: number
  edgeDropD: number
  edgeSlope: number
  cuspX: number
  cuspDrop: number
  cervCurveM: number
  cervCurveD: number
  labialN: number
  lingualN: number
  fossa: number
  ridge: number // crista vestibular (canino)
  ridgeM: number // queda da crista marginal mesial (mm abaixo das cúspides)
  ridgeD: number // queda da crista marginal distal
  fullness: number // 0–1: equador vestibular mais volumoso (posteriores superiores)
  mamelon: number // mm
  wear: number // 0–1
  seed: number
  dome: number // mm — extensão cervical arredondada (pôntico)
  cervFade: number // 0–0.4 fração de altura com fade de alfa (sobreposição em foto)
  colors?: CrownColors
}

export interface BuildOpts {
  nPhi: number
  nBody: number
  nCapTop: number
  nCapCerv: number
}

export const QUALITY: Record<'draft' | 'standard' | 'high' | 'preview', BuildOpts> = {
  preview: { nPhi: 48, nBody: 24, nCapTop: 4, nCapCerv: 3 },
  draft: { nPhi: 48, nBody: 28, nCapTop: 4, nCapCerv: 3 },
  standard: { nPhi: 72, nBody: 40, nCapTop: 6, nCapCerv: 4 },
  high: { nPhi: 120, nBody: 64, nCapTop: 10, nCapCerv: 6 },
}

// ---------------------------------------------------------------------------------------------------------------
// Perfis laterais (fração de BL). t: 0 cervical … 1 incisal/oclusal.
// ---------------------------------------------------------------------------------------------------------------
type Tab = ReadonlyArray<readonly [number, number]>

interface Profile {
  lab: Tab
  ling: Tab
}

const PROFILES: Record<ToothClass, Profile> = {
  incisor: {
    lab: [[0, -0.1], [0.1, -0.015], [0.22, 0], [0.5, -0.035], [0.75, -0.09], [0.92, -0.2], [1, -0.26]],
    ling: [[0, -0.82], [0.18, -1.0], [0.4, -0.82], [0.65, -0.63], [0.85, -0.5], [0.95, -0.44], [1, -0.42]],
  },
  canine: {
    lab: [[0, -0.1], [0.12, -0.01], [0.25, 0], [0.55, -0.03], [0.8, -0.1], [1, -0.3]],
    ling: [[0, -0.8], [0.2, -1.0], [0.5, -0.86], [0.8, -0.62], [1, -0.45]],
  },
  premolar: {
    lab: [[0, -0.12], [0.2, 0], [0.55, -0.04], [0.85, -0.14], [1, -0.2]],
    ling: [[0, -0.88], [0.25, -1.0], [0.55, -0.97], [0.85, -0.84], [1, -0.76]],
  },
  molar: {
    lab: [[0, -0.1], [0.2, 0], [0.55, -0.03], [0.85, -0.09], [1, -0.15]],
    ling: [[0, -0.9], [0.25, -1.0], [0.55, -0.98], [0.85, -0.9], [1, -0.86]],
  },
}

const smooth01 = (v: number) => v * v * (3 - 2 * v)

function widthFactor(t: number, cerv: number, tc: number, corner: number): number {
  if (t <= tc) {
    const u = t / tc
    return cerv + (1 - cerv) * Math.sin((u * Math.PI) / 2)
  }
  const u = (t - tc) / (1 - tc)
  return 1 - corner * Math.pow(u, 2.1)
}

function softAbs(d: number): number {
  return Math.sqrt(d * d + 0.045) - Math.sqrt(0.045)
}

// ---------------------------------------------------------------------------------------------------------------
// Função de superfície oclusal/incisal: devolve a queda (mm, ≥ 0) em relação ao topo.
// ---------------------------------------------------------------------------------------------------------------
function topDrop(s: CrownSpec, xn: number, zr: number): number {
  const w = s.wear
  if (s.cls === 'incisor' || s.cls === 'canine') {
    let d: number
    if (s.cls === 'canine') {
      const dx = xn - s.cuspX
      const norm = softAbs(1 + Math.abs(s.cuspX)) || 1
      const arm = dx < 0 ? 0.85 : 1.0
      d = (s.cuspDrop * arm * softAbs(dx)) / norm
      // desgaste arredonda a ponta
      d *= 1 - 0.55 * w
    } else {
      const side = xn < 0 ? s.edgeDropM : s.edgeDropD
      d = side * Math.pow(Math.abs(xn), 4) + (s.edgeSlope * (xn + 1)) / 2
      d *= 1 - 0.7 * w
    }
    if (s.mamelon > 0 && s.cls === 'incisor') d += s.mamelon * (0.5 - 0.5 * Math.cos(3 * Math.PI * (xn + 1) * 0.5 * 2)) * (1 - w)
    return d
  }
  const ax = Math.abs(xn)
  const zr2 = clamp(zr, -1.2, 1.2)
  if (s.cls === 'premolar') {
    // cúspide vestibular MAIOR e mais alta; lingual menor e mais baixa
    const lingDrop = s.arch === 'upper' ? 0.7 : s.n === 4 ? 1.9 : 1.1
    const groove = 1.7 * gauss(zr2 - 0.12, 0.2) * (1 - 0.35 * ax * ax)
    const rM = xn < 0 ? s.ridgeM : s.ridgeD
    const marginal = (rM || 1.15) * Math.pow(smooth01(clamp((ax - 0.5) / 0.5, 0, 1)), 1.2)
    const ling = lingDrop * smooth01(clamp((-zr2 + 0.02) / 0.6, 0, 1))
    const rim = 0.7 * Math.pow(smooth01(clamp((Math.abs(zr2) - 0.7) / 0.3, 0, 1)), 2)
    return (groove + marginal + ling + rim) * (1 - 0.5 * w)
  }
  // molares: 4 cúspides + fossa central; vestibulares maiores (σ maior) e mais altas que as linguais/palatinas
  const cusps: Array<[number, number, number, number, number]> = [
    // [x, z, altura, σx, σz]
    [-0.46, 0.52, 1.0, 0.5, 0.48], // mésio-vestibular
    [0.46, 0.52, 0.94, 0.48, 0.46], // disto-vestibular
    [-0.46, -0.5, 0.82, 0.38, 0.36], // mésio-lingual/palatina
    [0.46, -0.5, s.arch === 'upper' ? 0.5 : 0.7, 0.34, 0.32], // disto-lingual/palatina
  ]
  let sum = 0
  for (const [cx, cz, h, sx, sz] of cusps) sum += h * Math.exp(-(((xn - cx) / sx) ** 2 + ((zr2 - cz) / sz) ** 2))
  const bump = 1 - Math.exp(-1.7 * sum)
  const rMol = xn < 0 ? s.ridgeM : s.ridgeD
  const marginal = (rMol || 0.7) * smooth01(clamp((ax - 0.65) / 0.35, 0, 1))
  const rim = 0.8 * Math.pow(smooth01(clamp((Math.abs(zr2) - 0.72) / 0.28, 0, 1)), 2)
  return (2.6 * (1 - bump) + marginal + rim) * (1 - 0.5 * w)
}

function noise2(x: number, y: number, seed: number): number {
  // ruído de valor suave e determinístico
  const h = (ix: number, iy: number) => {
    const r = rng(((ix * 73856093) ^ (iy * 19349663) ^ (seed * 83492791)) >>> 0)
    return r()
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth01(x - x0)
  const fy = smooth01(y - y0)
  const a = h(x0, y0)
  const b = h(x0 + 1, y0)
  const c = h(x0, y0 + 1)
  const d = h(x0 + 1, y0 + 1)
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}

export interface Row {
  pts: Float32Array // nPhi*3
  cols: Float32Array // nPhi*4 (rgba)
  uvs: Float32Array // nPhi*2
  center: [number, number, number]
  t: number
}

export interface CrownGrid {
  nPhi: number
  rows: Row[] // inclui anéis da calota cervical, corpo e calota superior (sem polos)
  bodyStart: number // índice da linha t=0
  bodyEnd: number // índice da linha t=1
  poleBottom: { p: [number, number, number]; c: [number, number, number, number]; uv: [number, number] }
  poleTop: { p: [number, number, number]; c: [number, number, number, number]; uv: [number, number] }
}

const DEFAULT_COLORS: CrownColors = {
  body: [0.78, 0.7, 0.55],
  cervical: [0.7, 0.58, 0.38],
  incisal: [0.7, 0.74, 0.78],
  translucency: 0.5,
  mamelons: 0.4,
}

/** Cria a grade de anéis (posições, cores, uv) do dente. */
export function crownGrid(spec: CrownSpec, opts: BuildOpts = QUALITY.standard): CrownGrid {
  const { nPhi, nBody, nCapTop, nCapCerv } = opts
  const prof = PROFILES[spec.cls]
  const BL = spec.BL
  const wear = spec.wear
  // z do centro do corte no topo → origem
  const zlab1 = BL * prof.lab[prof.lab.length - 1][1]
  const zling1 = BL * prof.ling[prof.ling.length - 1][1] * (1 + 0.15 * wear)
  const zcTop = (zlab1 + zling1) / 2
  const col = spec.colors ?? DEFAULT_COLORS

  const rows: Row[] = []
  const phis = new Float32Array(nPhi)
  const cosv = new Float32Array(nPhi)
  const sinv = new Float32Array(nPhi)
  for (let i = 0; i < nPhi; i++) {
    phis[i] = (2 * Math.PI * i) / nPhi
    cosv[i] = Math.cos(phis[i])
    sinv[i] = Math.sin(phis[i])
  }

  const colorAt = (t: number, xn: number, zn: number): [number, number, number, number] => {
    const { body, cervical, incisal } = col
    const cw = 1 - smoothstep(0.0, 0.5, t)
    let r = lerp(body[0], cervical[0], cw)
    let g = lerp(body[1], cervical[1], cw)
    let b = lerp(body[2], cervical[2], cw)
    // translucidez incisal + proximal
    const ax = Math.abs(xn)
    let tw = smoothstep(0.7, 0.99, t) * col.translucency
    tw += 0.35 * smoothstep(0.62, 1.0, ax) * smoothstep(0.5, 0.95, t) * col.translucency
    tw = clamp(tw, 0, 0.92)
    r = lerp(r, incisal[0], tw)
    g = lerp(g, incisal[1], tw)
    b = lerp(b, incisal[2], tw)
    // mamelões: faixas ligeiramente mais claras/quentes no terço incisal
    if (spec.cls === 'incisor' && col.mamelons > 0) {
      const band = 0.5 + 0.5 * Math.cos(3 * Math.PI * (xn + 1))
      const m = col.mamelons * 0.09 * band * smoothstep(0.5, 0.82, t) * (1 - smoothstep(0.88, 1.0, t))
      r += m
      g += m * 0.94
      b += m * 0.78
    }
    // variação orgânica discreta
    const nz = (noise2(xn * 3.2 + 7, t * 5 + 3, spec.seed) - 0.5) * 0.035 + (noise2(xn * 11, t * 14, spec.seed + 5) - 0.5) * 0.015
    r += nz
    g += nz
    b += nz * 0.9
    // face lingual levemente mais acinzentada/menos saturada
    if (zn < 0) {
      const gray = (r + g + b) / 3
      const k = 0.25 * Math.min(1, -zn)
      r = lerp(r, gray, k)
      g = lerp(g, gray, k)
      b = lerp(b, gray, k)
    }
    const alpha = spec.cervFade > 0 ? smoothstep(0, spec.cervFade, t) : 1
    return [r, g, b, alpha]
  }

  const nExpN = (z: number) => (z >= 0 ? spec.labialN : spec.lingualN)
  const yTopAt = (xn: number, x: number, z: number, aTop: number) => {
    void aTop
    const zr = (z - zcRow(1)) / (BL / 2)
    return -topDrop(spec, xn, zr)
  }

  // funções de perfil
  const zlabN = (t: number) => BL * table(prof.lab, t)
  const zlingN = (t: number) => BL * table(prof.ling, t) * (1 + 0.15 * wear * smoothstep(0.8, 1, t))
  function zcRow(t: number) {
    return (zlabN(t) + zlingN(t)) / 2 - zcTop
  }
  const bRow = (t: number) => Math.max(0.12, (zlabN(t) - zlingN(t)) / 2)
  const fossaWin = (t: number) => smoothstep(0.35, 0.65, t) * (1 - smoothstep(0.86, 1.0, t))

  // ---- corpo ---------------------------------------------------------------------------------------------
  const body: Row[] = []
  for (let j = 0; j <= nBody; j++) {
    const t = j / nBody
    const aM = (spec.W / 2) * widthFactor(t, spec.cerv, spec.tcM, spec.cornerM)
    const aD = (spec.W / 2) * widthFactor(t, spec.cerv, spec.tcD, spec.cornerD)
    const zc = zcRow(t)
    const b = bRow(t)
    const g = smoothstep(0.2, 1, t)
    const pts = new Float32Array(nPhi * 3)
    const cols = new Float32Array(nPhi * 4)
    const uvs = new Float32Array(nPhi * 2)
    for (let i = 0; i < nPhi; i++) {
      const c = cosv[i]
      const s = sinv[i]
      const nexp = nExpN(s)
      const xn = spow(c, 2 / nexp)
      const zn = spow(s, 2 / nexp)
      const a = xn < 0 ? aM : aD
      const x = xn * a
      let z = zc + zn * b
      // fossa lingual (reduz espessura no centro da face lingual)
      if (zn < 0 && (spec.cls === 'incisor' || spec.cls === 'canine')) {
        z += spec.fossa * fossaWin(t) * (1 - xn * xn) * -zn
      }
      // equador vestibular mais volumoso nos posteriores (afasta a bochecha na mastigação)
      if (zn > 0 && spec.fullness > 0) z += spec.fullness * 0.95 * zn * smoothstep(0.08, 0.38, t) * (1 - smoothstep(0.55, 0.95, t))
      // crista vestibular (canino) e convexidade
      if (zn > 0 && spec.ridge > 0) z += spec.ridge * Math.pow(Math.max(0, 1 - xn * xn), 2) * zn * smoothstep(0, 0.35, t) * (1 - smoothstep(0.8, 1, t))
      const zr = (z - zcRow(1)) / (BL / 2)
      const yTop = spec.cls === 'incisor' || spec.cls === 'canine' ? -topDrop(spec, xn, 0) : -topDrop(spec, xn, zr)
      const cc = (xn < 0 ? spec.cervCurveM : spec.cervCurveD) * Math.pow(Math.abs(xn), 1.8) * (1 - t) * (1 - t)
      const y = -spec.H * (1 - t) + g * yTop + cc
      pts[i * 3] = x
      pts[i * 3 + 1] = y
      pts[i * 3 + 2] = z
      const [cr, cg, cb, ca] = colorAt(t, xn, zn)
      cols[i * 4] = cr
      cols[i * 4 + 1] = cg
      cols[i * 4 + 2] = cb
      cols[i * 4 + 3] = ca
      uvs[i * 2] = (xn + 1) / 2
      uvs[i * 2 + 1] = t
    }
    body.push({ pts, cols, uvs, center: [0, -spec.H * (1 - t) + g * 0, zc], t })
  }

  // ---- calota cervical (cúpula do pôntico/plana) ------------------------------------------------------------
  const cervRows: Row[] = []
  const r0 = body[0]
  const c0 = r0.center
  const dome = spec.dome
  for (let k = nCapCerv - 1; k >= 1; k--) {
    const r = k / nCapCerv
    const pts = new Float32Array(nPhi * 3)
    const cols = new Float32Array(nPhi * 4)
    const uvs = new Float32Array(nPhi * 2)
    for (let i = 0; i < nPhi; i++) {
      pts[i * 3] = c0[0] + (r0.pts[i * 3] - c0[0]) * r
      pts[i * 3 + 1] = r0.pts[i * 3 + 1] - dome * Math.sqrt(Math.max(0, 1 - r * r))
      pts[i * 3 + 2] = c0[2] + (r0.pts[i * 3 + 2] - c0[2]) * r
      cols[i * 4] = r0.cols[i * 4]
      cols[i * 4 + 1] = r0.cols[i * 4 + 1]
      cols[i * 4 + 2] = r0.cols[i * 4 + 2]
      cols[i * 4 + 3] = r0.cols[i * 4 + 3]
      uvs[i * 2] = r0.uvs[i * 2]
      uvs[i * 2 + 1] = 0
    }
    cervRows.push({ pts, cols, uvs, center: [c0[0], c0[1] - dome * Math.sqrt(Math.max(0, 1 - r * r)), c0[2]], t: 0 })
  }
  // ordenar do polo (r pequeno) para fora (r grande): k=nCapCerv-1 é r grande → inverter
  cervRows.reverse()

  // ---- calota superior --------------------------------------------------------------------------------------
  const topRows: Row[] = []
  const rt = body[nBody]
  const ctop = rt.center
  for (let k = 1; k < nCapTop; k++) {
    const r = 1 - k / nCapTop
    const pts = new Float32Array(nPhi * 3)
    const cols = new Float32Array(nPhi * 4)
    const uvs = new Float32Array(nPhi * 2)
    for (let i = 0; i < nPhi; i++) {
      const x = ctop[0] + (rt.pts[i * 3] - ctop[0]) * r
      const z = ctop[2] + (rt.pts[i * 3 + 2] - ctop[2]) * r
      const aTop = spec.W / 2
      const xn = clamp(x / ((aTop * (1 - (x < 0 ? spec.cornerM : spec.cornerD))) || 1), -1, 1)
      pts[i * 3] = x
      pts[i * 3 + 2] = z
      pts[i * 3 + 1] = spec.cls === 'incisor' || spec.cls === 'canine' ? -topDrop(spec, xn, 0) : yTopAt(xn, x, z, aTop)
      cols[i * 4] = rt.cols[i * 4]
      cols[i * 4 + 1] = rt.cols[i * 4 + 1]
      cols[i * 4 + 2] = rt.cols[i * 4 + 2]
      cols[i * 4 + 3] = rt.cols[i * 4 + 3]
      uvs[i * 2] = lerp(0.5, rt.uvs[i * 2], r)
      uvs[i * 2 + 1] = 1
    }
    topRows.push({ pts, cols, uvs, center: [ctop[0], 0, ctop[2]], t: 1 })
  }

  const all: Row[] = [...cervRows, ...body, ...topRows]
  let yMeanRow0 = 0
  for (let i = 0; i < nPhi; i++) yMeanRow0 += r0.pts[i * 3 + 1]
  yMeanRow0 /= nPhi
  const poleBottom = {
    p: [c0[0], yMeanRow0 - dome, c0[2]] as [number, number, number],
    c: [r0.cols[0], r0.cols[1], r0.cols[2], r0.cols[3]] as [number, number, number, number],
    uv: [0.5, 0] as [number, number],
  }
  // polo superior: centro da mesa/aresta
  const xnC = 0
  const yC = spec.cls === 'incisor' || spec.cls === 'canine' ? -topDrop(spec, xnC, 0) : -topDrop(spec, 0, 0)
  const poleTop = {
    p: [ctop[0], yC, ctop[2]] as [number, number, number],
    c: [rt.cols[0], rt.cols[1], rt.cols[2], rt.cols[3]] as [number, number, number, number],
    uv: [0.5, 1] as [number, number],
  }
  return { nPhi, rows: all, bodyStart: cervRows.length, bodyEnd: cervRows.length + nBody, poleBottom, poleTop }
}

/** Monta a malha sólida e fechada da coroa. */
export function solidFromGrid(grid: CrownGrid): Mesh {
  const mb = new MeshBuilder()
  const { nPhi, rows } = grid
  const rowIdx: number[][] = []
  const pb = mb.v(grid.poleBottom.p[0], grid.poleBottom.p[1], grid.poleBottom.p[2], grid.poleBottom.c[0], grid.poleBottom.c[1], grid.poleBottom.c[2], grid.poleBottom.uv[0], grid.poleBottom.uv[1])
  const alphas: number[] = [grid.poleBottom.c[3]]
  for (const r of rows) {
    const ids: number[] = []
    for (let i = 0; i < nPhi; i++) {
      ids.push(mb.v(r.pts[i * 3], r.pts[i * 3 + 1], r.pts[i * 3 + 2], r.cols[i * 4], r.cols[i * 4 + 1], r.cols[i * 4 + 2], r.uvs[i * 2], r.uvs[i * 2 + 1]))
      alphas.push(r.cols[i * 4 + 3])
    }
    rowIdx.push(ids)
  }
  const pt = mb.v(grid.poleTop.p[0], grid.poleTop.p[1], grid.poleTop.p[2], grid.poleTop.c[0], grid.poleTop.c[1], grid.poleTop.c[2], grid.poleTop.uv[0], grid.poleTop.uv[1])
  alphas.push(grid.poleTop.c[3])
  // fan inferior
  const first = rowIdx[0]
  for (let i = 0; i < nPhi; i++) mb.tri(pb, first[(i + 1) % nPhi], first[i])
  for (let j = 0; j < rowIdx.length - 1; j++) {
    const A = rowIdx[j]
    const B = rowIdx[j + 1]
    for (let i = 0; i < nPhi; i++) {
      const i1 = (i + 1) % nPhi
      mb.tri(A[i], A[i1], B[i1])
      mb.tri(A[i], B[i1], B[i])
    }
  }
  const last = rowIdx[rowIdx.length - 1]
  for (let i = 0; i < nPhi; i++) mb.tri(last[i], last[(i + 1) % nPhi], pt)
  const mesh = mb.build()
  mesh.alphas = new Float32Array(alphas)
  // orientação: garante volume positivo
  return orient(mesh)
}

export const orient = orientMesh

export function buildCrown(spec: CrownSpec, opts: BuildOpts = QUALITY.standard) {
  const grid = crownGrid(spec, opts)
  const mesh = solidFromGrid(grid)
  mesh.normals = computeNormals(mesh)
  return { mesh, grid }
}

// ---------------------------------------------------------------------------------------------------------------
// Casca de faceta (veneer): remendo vestibular + superfície interna deslocada + fitas de borda.
// ---------------------------------------------------------------------------------------------------------------
export interface ShellOpts {
  thickness: number
  wrapDeg: number // quanto a casca envolve as proximais além do equador (graus)
  incisalWrap: number // 0–1: avança sobre a borda incisal (anteriores)
}

export function veneerShell(grid: CrownGrid, solid: Mesh, spec: CrownSpec, o: ShellOpts): Mesh {
  const { nPhi } = grid
  const normals = solid.normals ?? computeNormals(solid)
  // mapeia (row j, col i) → índice na malha sólida (polo inferior = 0)
  const vIndex = (j: number, i: number) => 1 + j * nPhi + ((i % nPhi) + nPhi) % nPhi
  const step = 360 / nPhi
  const wrapCols = Math.max(0, Math.round(o.wrapDeg / step))
  // vestibular: φ ∈ (0, π) → colunas 0 … nPhi/2. Estendemos wrapCols para cada lado.
  const iStart = -wrapCols
  const iEnd = nPhi / 2 + wrapCols
  const rowsUsed: number[] = []
  const anterior = spec.cls === 'incisor' || spec.cls === 'canine'
  // linhas: a partir de t=0 (bodyStart) até t=1 (bodyEnd) e, se anterior, calota superior parcial
  for (let j = grid.bodyStart; j <= grid.bodyEnd; j++) rowsUsed.push(j)
  if (anterior) {
    const nCap = grid.rows.length - 1 - grid.bodyEnd
    const take = Math.floor(nCap * clamp(o.incisalWrap, 0, 1))
    for (let k = 1; k <= take; k++) rowsUsed.push(grid.bodyEnd + k)
  }
  const mb = new MeshBuilder()
  const cols = iEnd - iStart + 1
  const outer: number[][] = []
  const inner: number[][] = []
  const P = solid.positions
  const th = o.thickness
  for (const j of rowsUsed) {
    const ro: number[] = []
    const ri: number[] = []
    for (let c = 0; c < cols; c++) {
      const vi = vIndex(j, iStart + c)
      const x = P[vi * 3], y = P[vi * 3 + 1], z = P[vi * 3 + 2]
      ro.push(mb.v(x, y, z))
      ri.push(-1)
    }
    outer.push(ro)
    inner.push(ri)
  }
  for (let r = 0; r < rowsUsed.length; r++) {
    const j = rowsUsed[r]
    for (let c = 0; c < cols; c++) {
      const vi = vIndex(j, iStart + c)
      // atenua espessura no bordo cervical (margem fina) e nas laterais
      const fadeC = c === 0 || c === cols - 1 ? 0.55 : 1
      const fadeR = r === 0 ? 0.6 : r === 1 ? 0.85 : 1
      const k = th * Math.min(fadeC, 1) * fadeR
      inner[r][c] = mb.v(P[vi * 3] - normals[vi * 3] * k, P[vi * 3 + 1] - normals[vi * 3 + 1] * k, P[vi * 3 + 2] - normals[vi * 3 + 2] * k)
    }
  }
  const R = rowsUsed.length
  // superfícies (outer: mesma orientação da malha sólida, inner: invertida)
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      mb.tri(outer[r][c], outer[r][c + 1], outer[r + 1][c + 1])
      mb.tri(outer[r][c], outer[r + 1][c + 1], outer[r + 1][c])
      mb.tri(inner[r][c], inner[r + 1][c + 1], inner[r][c + 1])
      mb.tri(inner[r][c], inner[r + 1][c], inner[r + 1][c + 1])
    }
  }
  // fitas de borda: perímetro do remendo
  const ribbon = (a1: number, a2: number, b1: number, b2: number) => {
    // quad (a1,a2 externos; b1,b2 internos) no sentido do perímetro
    mb.tri(a1, a2, b2)
    mb.tri(a1, b2, b1)
  }
  // linha inferior (r=0) percorrida c → c+1
  for (let c = 0; c < cols - 1; c++) ribbon(outer[0][c + 1], outer[0][c], inner[0][c + 1], inner[0][c])
  // linha superior (r=R-1)
  for (let c = 0; c < cols - 1; c++) ribbon(outer[R - 1][c], outer[R - 1][c + 1], inner[R - 1][c], inner[R - 1][c + 1])
  // coluna c=0
  for (let r = 0; r < R - 1; r++) ribbon(outer[r][0], outer[r + 1][0], inner[r][0], inner[r + 1][0])
  // coluna c=cols-1
  for (let r = 0; r < R - 1; r++) ribbon(outer[r + 1][cols - 1], outer[r][cols - 1], inner[r + 1][cols - 1], inner[r][cols - 1])
  return orient(mb.build())
}

// ---------------------------------------------------------------------------------------------------------------
// Coroa oca (casca com cavidade interna e abertura cervical).
// ---------------------------------------------------------------------------------------------------------------
export function hollowCrown(grid: CrownGrid, spec: CrownSpec, thickness: number): Mesh {
  const { nPhi, rows } = grid
  const th = thickness
  const mb = new MeshBuilder()
  const R = rows.length - grid.bodyStart // ignora calota cervical: abertura na linha t=0
  const used = rows.slice(grid.bodyStart)
  const outer: number[][] = []
  const inner: number[][] = []
  for (const r of used) {
    const row: number[] = []
    for (let i = 0; i < nPhi; i++) row.push(mb.v(r.pts[i * 3], r.pts[i * 3 + 1], r.pts[i * 3 + 2]))
    outer.push(row)
  }
  const prof = PROFILES[spec.cls]
  void prof
  const topRowCenter = used[used.length - 1].center
  for (let rIdx = 0; rIdx < used.length; rIdx++) {
    const r = used[rIdx]
    const row: number[] = []
    const cen = r.center
    // extensão radial do anel
    let rad = 0
    for (let i = 0; i < nPhi; i++) rad += Math.hypot(r.pts[i * 3] - cen[0], r.pts[i * 3 + 2] - cen[2])
    rad /= nPhi
    const tt = clamp((r.t - 0.55) / 0.45, 0, 1)
    const isCap = rIdx > grid.bodyEnd - grid.bodyStart
    const kScale = clamp(1 - th / Math.max(rad, th * 1.2), 0.28, 0.97)
    const drop = th * smooth01(tt) * 1.0
    for (let i = 0; i < nPhi; i++) {
      const x = r.pts[i * 3], y = r.pts[i * 3 + 1], z = r.pts[i * 3 + 2]
      const cz = isCap ? topRowCenter[2] : cen[2]
      row.push(mb.v(cen[0] + (x - cen[0]) * kScale, y - drop, cz + (z - cz) * kScale))
    }
    inner.push(row)
  }
  // polo interno superior
  const poleOuter = mb.v(grid.poleTop.p[0], grid.poleTop.p[1], grid.poleTop.p[2])
  const lastInner = inner[inner.length - 1]
  let cx = 0, cy = 0, cz = 0
  for (const id of lastInner) {
    cx += mb.pos[id * 3]; cy += mb.pos[id * 3 + 1]; cz += mb.pos[id * 3 + 2]
  }
  const poleInner = mb.v(cx / nPhi, cy / nPhi, cz / nPhi)
  for (let j = 0; j < R - 1; j++) {
    for (let i = 0; i < nPhi; i++) {
      const i1 = (i + 1) % nPhi
      mb.tri(outer[j][i], outer[j][i1], outer[j + 1][i1])
      mb.tri(outer[j][i], outer[j + 1][i1], outer[j + 1][i])
      mb.tri(inner[j][i], inner[j + 1][i1], inner[j][i1])
      mb.tri(inner[j][i], inner[j + 1][i], inner[j + 1][i1])
    }
  }
  const lo = outer[R - 1]
  for (let i = 0; i < nPhi; i++) {
    mb.tri(lo[i], lo[(i + 1) % nPhi], poleOuter)
    mb.tri(lastInner[i], poleInner, lastInner[(i + 1) % nPhi])
  }
  // anel cervical (anel plano entre outer[0] e inner[0])
  for (let i = 0; i < nPhi; i++) {
    const i1 = (i + 1) % nPhi
    mb.tri(outer[0][i1], outer[0][i], inner[0][i])
    mb.tri(outer[0][i1], inner[0][i], inner[0][i1])
  }
  return orient(mb.build())
}

/** Silhueta frontal (projeção ortográfica XY) por envelope em colunas — usada para contornos e seleção. */
export function frontalSilhouette(m: Mesh, cols = 48): Array<[number, number]> {
  let x0 = Infinity, x1 = -Infinity
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
  }
  const lo = new Float32Array(cols).fill(Infinity)
  const hi = new Float32Array(cols).fill(-Infinity)
  const dx = (x1 - x0) / cols || 1
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]
    const y = m.positions[i + 1]
    const c = Math.min(cols - 1, Math.floor((x - x0) / dx))
    if (y < lo[c]) lo[c] = y
    if (y > hi[c]) hi[c] = y
  }
  const top: Array<[number, number]> = []
  const bot: Array<[number, number]> = []
  for (let c = 0; c < cols; c++) {
    if (!Number.isFinite(lo[c])) continue
    const cx = x0 + (c + 0.5) * dx
    top.push([cx, hi[c]])
    bot.push([cx, lo[c]])
  }
  if (!top.length) return []
  top.unshift([x0, top[0][1]])
  top.push([x1, top[top.length - 1][1]])
  bot.unshift([x0, bot[0][1]])
  bot.push([x1, bot[bot.length - 1][1]])
  return [...top, ...bot.reverse()]
}
