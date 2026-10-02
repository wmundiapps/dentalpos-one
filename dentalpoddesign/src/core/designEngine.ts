import * as THREE from 'three'
import type { ArchId, DesignParams, ShapeId, ToothCfg, ToothStatus } from './types'
import { DESIGNED_STATUS } from './types'
import { DEG, clamp } from './math'
import { makeArch, type ArchCurve } from './archForm'
import {
  PROPORTIONS,
  SHAPE_ADJ,
  archFdiList,
  baseDim,
  fdiArch,
  fdiIndex,
  fdiSide,
  makeFdi,
  toothClass,
} from './toothSpecs'
import { crownColors } from './shades'
import type { CrownSpec } from '../geometry/toothMesh'

export const defaultToothCfg = (status: ToothStatus = 'natural'): ToothCfg => ({
  status,
  dx: 0,
  dy: 0,
  dz: 0,
  w: 1,
  h: 1,
  bl: 1,
  tip: 0,
  torque: 0,
  rot: 0,
})

export const isDesigned = (s: ToothStatus) => DESIGNED_STATUS.includes(s)

/** Deslocamento incisal/oclusal (mm, + = cranial) relativo ao plano dos incisivos centrais (arco do sorriso). */
const EDGE_OFFSET = [0, 0.6, 0.4, 1.3, 2.3, 3.5, 4.8, 6.2]
const OVERBITE_FADE = [1, 1, 0.85, 0.45, 0.15, 0, 0, 0]
const TIP_UP = [2.5, 5, 8, 2, 2, 4, 4, 4]
const TIP_LO = [2, 2, 5, 2, 2, 2, 2, 2]
const TORQUE_UP = [9, 6, 2, -4, -5, -8, -9, -9]
const TORQUE_LO = [-1, -2, -5, -8, -10, -12, -14, -14]

export interface ToothPlacement {
  fdi: number
  arch: ArchId
  n: number
  side: -1 | 1
  cfg: ToothCfg
  designed: boolean
  widthArc: number
  spec: CrownSpec
  /** Local → espaço do arco (mm). */
  matrix: THREE.Matrix4
  position: THREE.Vector3
  edgeY: number
  /** arco (mm) do centro do dente sobre a curva do arco, lado positivo */
  sMid: number
}

export interface Layout {
  upper: ToothPlacement[]
  lower: ToothPlacement[]
  archUpper: ArchCurve
  archLower: ArchCurve
  all: ToothPlacement[]
  byFdi: Map<number, ToothPlacement>
}

function archWidths(
  arch: ArchId,
  upTo: number,
  p: DesignParams,
  cfgOf: (n: number, side: -1 | 1) => ToothCfg,
  side: -1 | 1,
  curve: ArchCurve,
): { widthArc: number[]; s0: number[]; s1: number[] } {
  const s = p.centralWidth / baseDim('upper', 1).W
  const widths: number[] = []
  const s0: number[] = []
  const s1: number[] = []
  const prop = PROPORTIONS.find((x) => x.id === p.proportion) ?? PROPORTIONS[0]
  const proportion = p.proportion === 'red' ? ([p.redPct, p.redPct * p.redPct] as [number, number]) : prop.ratios
  let sPrev = 0
  let xPrev = 0
  for (let n = 1; n <= upTo; n++) {
    const c = cfgOf(n, side)
    const bd = baseDim(arch, n)
    const scale = n <= 3 ? s : 1 + (s - 1) * 0.5
    let w = bd.W * scale
    // masculino: laterais e caninos mais largos; feminino: mais estreitos
    if (n === 2) w *= 1 + 0.05 * p.sex
    if (n === 3) w *= 1 + 0.04 * p.sex
    let next: number
    if (arch === 'upper' && proportion && n <= 3) {
      const ratio = n === 1 ? 1 : n === 2 ? proportion[0] : proportion[1]
      const apparent = p.centralWidth * ratio * c.w
      const targetX = xPrev + apparent
      next = curve.sForX(targetX)
      xPrev = targetX
    } else {
      w *= c.w
      next = sPrev + w
      const pos = curve.at(next)
      xPrev = pos.x
    }
    widths.push(next - sPrev)
    s0.push(sPrev)
    s1.push(next)
    sPrev = next
  }
  return { widthArc: widths, s0, s1 }
}

/** Parâmetros anatômicos de uma coroa a partir da biblioteca + forma + personalidade + ajustes individuais. */
export function buildSpec(
  fdi: number,
  widthArc: number,
  p: DesignParams,
  cfg: ToothCfg,
  status: ToothStatus,
  cervFade: number,
): CrownSpec {
  const arch = fdiArch(fdi)
  const n = fdiIndex(fdi)
  const cls = toothClass(n)
  const bd = baseDim(arch, n)
  const shape: ShapeId = cfg.shape ?? p.shape
  const adj = SHAPE_ADJ[shape]
  const anterior = n <= 3
  const lengthScaleAnt = p.centralWidth / p.wl / baseDim('upper', 1).H
  const lengthScale = anterior ? lengthScaleAnt : 1 + (lengthScaleAnt - 1) * 0.35
  const archFactor = arch === 'lower' ? 1 : 1
  const ageWearMm = anterior ? (n === 2 ? 0.9 : 1.1) * p.age : 0.3 * p.age
  let H = bd.H * lengthScale * archFactor * cfg.h - ageWearMm
  H = Math.max(5, H)
  const BL = bd.BL * Math.pow(p.centralWidth / 8.6, 0.5) * cfg.bl
  const sex = p.sex
  const pers = p.personality
  const cornerBase =
    n === 1 ? [0.09, 0.14] : n === 2 ? [0.13, 0.22] : n === 3 ? [0.1, 0.1] : [0.09, 0.09]
  const cornerAdj = anterior ? adj.corner * (1 - 0.32 * sex) * (1 - 0.55 * p.age) * (1 - 0.22 * pers) : 1
  const cornerM = clamp(cornerBase[0] * cornerAdj, 0.02, 0.4)
  const cornerD = clamp(cornerBase[1] * cornerAdj, 0.02, 0.42)
  const dropBase = n === 1 ? [0.35, 0.65] : n === 2 ? [0.5, 1.0] : [0.2, 0.3]
  const dropM = Math.min(0.2 * H, dropBase[0] * (anterior ? adj.corner * (1 - 0.3 * sex) : 1))
  const dropD = Math.min(0.22 * H, dropBase[1] * (anterior ? adj.corner * (1 - 0.3 * sex) : 1))
  const slope = n === 1 ? 0.25 : n === 2 ? 0.5 : 0
  const edgeSlope = slope * (1 - 0.3 * sex)
  const cervRatio = clamp(bd.cerv * (anterior ? adj.cerv : 1), 0.5, 0.95)
  const tcShift = anterior ? adj.tcShift : 0
  const labialN = shape === 'square' ? 2.9 : shape === 'round' || shape === 'ovoid' ? 2.25 : 2.5
  const wear = clamp(p.age * (anterior ? 0.85 : 0.5), 0, 1)
  const cuspDrop = n === 3 ? clamp((1.8 + 2.6 * adj.canineTip) * (1 + 0.1 * sex) * (1 + 0.1 * pers), 1.4, 4.2) : 0
  const spec: CrownSpec = {
    fdi,
    n,
    arch,
    cls,
    W: Math.max(3, widthArc - 0.04),
    H,
    BL,
    cerv: cervRatio,
    tcM: clamp(bd.tcM + tcShift, 0.5, 0.96),
    tcD: clamp(bd.tcD + tcShift, 0.5, 0.96),
    cornerM,
    cornerD,
    edgeDropM: dropM,
    edgeDropD: dropD,
    edgeSlope,
    cuspX: -0.12,
    cuspDrop,
    cervCurveM: bd.cervCurve * 1.08,
    cervCurveD: bd.cervCurve * 0.92,
    labialN,
    lingualN: 2.2,
    fossa: n === 1 ? 1.1 * adj.fossa : n === 2 ? 0.95 * adj.fossa : n === 3 ? 0.8 * adj.fossa : 0,
    ridge: n === 3 ? 0.7 : n === 1 ? 0.12 : n === 2 ? 0.1 : 0,
    mamelon: anterior ? 0.26 * p.mamelons * (1 - p.age) : 0,
    wear,
    seed: fdi * 7 + 3,
    dome: status === 'pontic' ? 2.0 : 0,
    cervFade,
    colors: crownColors(cfg.shade ?? (arch === 'upper' ? p.shade : p.lowerShade), p.translucency, p.mamelons, p.age),
  }
  return spec
}

export interface LayoutOptions {
  cervFade?: number
}

export function computeLayout(p: DesignParams, teeth: Record<number, ToothCfg>, opt: LayoutOptions = {}): Layout {
  const cervFade = opt.cervFade ?? 0.16
  const archUpper = makeArch('upper', p.archForm, p.archScale, p.archDepth)
  const archLower = makeArch('lower', p.archForm, p.archScale * 0.93, p.archDepth * 0.92)
  const cfgOf = (fdi: number) => teeth[fdi] ?? defaultToothCfg()

  const place = (arch: ArchId, upTo: number, curve: ArchCurve): ToothPlacement[] => {
    const out: ToothPlacement[] = []
    for (const side of [-1, 1] as const) {
      const widths = archWidths(arch, upTo, p, (n, sd) => cfgOf(makeFdi(arch, sd, n)), side, curve)
      for (let n = 1; n <= upTo; n++) {
        const fdi = makeFdi(arch, side, n)
        const cfg = cfgOf(fdi)
        const wArc = widths.widthArc[n - 1]
        const sMid = (widths.s0[n - 1] + widths.s1[n - 1]) / 2
        const c = curve.at(sMid)
        const spec = buildSpec(fdi, wArc, p, cfg, cfg.status, cervFade)

        // altura do ponto de origem (borda incisal / centro da mesa oclusal)
        const tipBase = (arch === 'upper' ? TIP_UP : TIP_LO)[n - 1] * p.tipScale
        const torqueBase = (arch === 'upper' ? TORQUE_UP : TORQUE_LO)[n - 1] * p.torqueScale
        let edgeY = 0
        const arcK = p.smileArc
        const latOff = n === 2 ? clamp(0.6 - 0.25 * p.sex + 0.2 * (1 - p.age) * 0, 0.1, 1.1) : EDGE_OFFSET[n - 1]
        const upperEdge = p.incisalOffset + latOff * arcK
        if (arch === 'upper') edgeY = upperEdge
        else {
          const f = OVERBITE_FADE[n - 1]
          edgeY = p.incisalOffset + EDGE_OFFSET[n - 1] * arcK * 0.9 + p.overbite * f
        }
        edgeY += cfg.dy
        const zShift = arch === 'lower' ? -p.overjet * OVERBITE_FADE[n - 1] : 0

        const ys = arch === 'upper' ? -1 : 1
        const xAxis = new THREE.Vector3(side === 1 ? c.tx : -c.tx, 0, c.tz)
        const zAxis = side === 1 ? new THREE.Vector3(-c.tz, 0, c.tx) : new THREE.Vector3(c.tz, 0, c.tx)
        const yAxis = new THREE.Vector3(0, ys, 0)
        const pos = new THREE.Vector3(side * c.x, edgeY, c.z + zShift)
        pos.addScaledVector(xAxis, cfg.dx)
        pos.addScaledVector(zAxis, cfg.dz)
        const frame = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(pos)
        const local = new THREE.Matrix4()
          .multiply(new THREE.Matrix4().makeRotationY(cfg.rot * DEG))
          .multiply(new THREE.Matrix4().makeRotationX((torqueBase + cfg.torque) * DEG))
          .multiply(new THREE.Matrix4().makeRotationZ((tipBase + cfg.tip) * DEG))
        const matrix = frame.multiply(local)
        out.push({
          fdi,
          arch,
          n,
          side,
          cfg,
          designed: isDesigned(cfg.status),
          widthArc: wArc,
          spec,
          matrix,
          position: pos,
          edgeY,
          sMid,
        })
      }
    }
    return out
  }

  const upper = place('upper', p.upperTo, archUpper)
  const lower = p.lowerEnabled ? place('lower', p.lowerTo, archLower) : []
  const all = [...upper, ...lower]
  const byFdi = new Map<number, ToothPlacement>()
  for (const t of all) byFdi.set(t.fdi, t)
  return { upper, lower, archUpper, archLower, all, byFdi }
}

/** Ordem esquerda→direita da imagem para listas de UI. */
export const orderedFdi = (arch: ArchId, upTo: number) => archFdiList(arch, upTo)

export { fdiSide }
