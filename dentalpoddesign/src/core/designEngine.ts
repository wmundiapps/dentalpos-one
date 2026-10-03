import * as THREE from 'three'
import type { ArchId, DesignParams, ShapeId, ToothCfg, ToothStatus } from './types'
import { DESIGNED_STATUS } from './types'
import { DEG, clamp } from './math'
import { makeArch, type ArchCurve } from './archForm'
import { PROPORTIONS, SHAPE_ADJ, archFdiList, baseDim, fdiArch, fdiIndex, fdiSide, makeFdi, toothClass } from './toothSpecs'
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

// ---------------------------------------------------------------------------------------------------------------
// Regras clínicas (Andrews — seis chaves; DSD; estética dental)
// ---------------------------------------------------------------------------------------------------------------

/** Arco do sorriso (mm, + = cranial) relativo aos incisivos centrais; × smileArc. Laterais ligeiramente mais curtos. */
export const SMILE_ARC = [0, 0.6, 0.4, 0.7, 1.1, 1.6, 2.1, 2.6]
/** Curva de Spee — perfil sagital (fração da profundidade); × spee (mm). */
export const SPEE_PROFILE = [0, 0, 0, 0.18, 0.5, 0.85, 1.1, 1.2]
/**
 * Linha dos zênites superiores (mm, em relação ao zênite do central): centrais = caninos (X+0,5),
 * laterais = pré-molares (X), 1º molar X−0,5, 2º molar X−1.
 */
export const ZENITH_UP = [0, -0.5, 0, -0.5, -0.5, -1.0, -1.5, -1.5]
/** Inferiores (altura da coroa): incisivos = pré-molares = X; caninos X+0,5; molares X−0,5. */
export const ZENITH_LO = [0, 0, 0.5, 0, 0, -0.5, -0.5, -0.5]
const OVERBITE_FADE = [1, 1, 0.85, 0.45, 0.15, 0, 0, 0]
/** Angulação mesio-distal (graus). */
export const TIP_UP = [2.5, 5, 8, 2, 2, 4, 4, 4]
export const TIP_LO = [2, 2, 5, 2, 2, 2, 2, 2]
/** Inclinação vestíbulo-lingual: anteriores superiores levemente para vestibular; PM/molares para palatina, progressivo. */
export const TORQUE_UP = [9, 6, 2, -3, -5, -8, -10, -10]
/** Inferiores: anteriores paralelos à base; PM e molares com inclinação lingual progressiva. */
export const TORQUE_LO = [-1, -1, -3, -8, -11, -15, -18, -18]
/** Posições artísticas (mm vestibular): in-set lateral, off-set canino e molares. */
const ARTISTIC_Z_UP = [0, -0.45, 0.35, 0, 0, 0.3, 0.3, 0.2]
const ARTISTIC_Z_LO = [0, 0, 0.25, 0, 0, 0.2, 0.2, 0.15]
/** Rotação artística (graus, "toe-in" dos molares). */
const ARTISTIC_ROT_UP = [0, 0, 0, 0, 0, 5, 5, 4]
const ARTISTIC_ROT_LO = [0, 0, 0, 0, 0, 3, 3, 2]
/** Queda nominal das cristas marginais (mm abaixo das cúspides). */
const RIDGE_NOMINAL = [0, 0, 0, 1.15, 1.15, 0.8, 0.7, 0.6]

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
  /** altura do zênite (cervical) em Y do arco (mm) */
  zenithY: number
}

export interface Layout {
  upper: ToothPlacement[]
  lower: ToothPlacement[]
  archUpper: ArchCurve
  archLower: ArchCurve
  all: ToothPlacement[]
  byFdi: Map<number, ToothPlacement>
  /** resíduos da classe I (mm): posição do canino superior vs. embrasura e do sulco molar (por lado) */
  classI: { canine: number; molar: number; applied: boolean } | null
}

interface SideWidths {
  widthArc: number[]
  s0: number[]
  s1: number[]
}

function cumulate(widths: number[]): SideWidths {
  const s0: number[] = []
  const s1: number[] = []
  let s = 0
  for (const w of widths) {
    s0.push(s)
    s += w
    s1.push(s)
  }
  return { widthArc: widths, s0, s1 }
}

function archWidths(
  arch: ArchId,
  upTo: number,
  p: DesignParams,
  cfgOf: (n: number, side: -1 | 1) => ToothCfg,
  side: -1 | 1,
  curve: ArchCurve,
): SideWidths {
  const s = (p.centralWidth * p.widthScale) / baseDim('upper', 1).W
  const prop = PROPORTIONS.find((x) => x.id === p.proportion) ?? PROPORTIONS[0]
  const proportion = p.proportion === 'red' ? ([p.redPct, p.redPct * p.redPct] as [number, number]) : prop.ratios
  const widths: number[] = []
  let sPrev = 0
  let xPrev = 0
  for (let n = 1; n <= upTo; n++) {
    const c = cfgOf(n, side)
    const bd = baseDim(arch, n)
    const scale = n <= 3 ? s : 1 + (s - 1) * 0.5
    let w = bd.W * scale
    if (n === 2) w *= 1 + 0.05 * p.sex
    if (n === 3) w *= 1 + 0.04 * p.sex
    let next: number
    if (arch === 'upper' && proportion && n <= 3) {
      // proporções em largura APARENTE (vista frontal): procura o ponto do arco onde a projeção frontal atinge o alvo
      const ratio = n === 1 ? 1 : n === 2 ? proportion[0] : proportion[1]
      const apparent = p.centralWidth * p.widthScale * ratio * c.w
      const targetX = xPrev + apparent
      next = curve.sForX(targetX)
      xPrev = targetX
    } else {
      w *= c.w
      next = sPrev + w
      xPrev = curve.at(next).x
    }
    widths.push(next - sPrev)
    sPrev = next
  }
  return cumulate(widths)
}

const smileArcOf = (n: number, p: DesignParams) => {
  const lat = clamp(0.6 - 0.25 * p.sex, 0.1, 1.1)
  const base = n === 2 ? lat : SMILE_ARC[n - 1]
  return base * p.smileArc
}

/** Parâmetros anatômicos de uma coroa a partir da biblioteca + forma + regras clínicas + ajustes individuais. */
export function buildSpec(
  fdi: number,
  widthArc: number,
  H: number,
  p: DesignParams,
  cfg: ToothCfg,
  status: ToothStatus,
  cervFade: number,
  ridge: { m: number; d: number },
): CrownSpec {
  const arch = fdiArch(fdi)
  const n = fdiIndex(fdi)
  const cls = toothClass(n)
  const bd = baseDim(arch, n)
  const shape: ShapeId = cfg.shape ?? p.shape
  const adj = SHAPE_ADJ[shape]
  const anterior = n <= 3
  const BL = bd.BL * Math.pow((p.centralWidth * p.widthScale) / 8.6, 0.5) * cfg.bl
  const sex = p.sex
  const pers = p.personality
  // ângulos incisais: MESIAIS mais retos, DISTAIS mais arredondados
  const cornerBase = n === 1 ? [0.06, 0.15] : n === 2 ? [0.1, 0.23] : n === 3 ? [0.1, 0.1] : [0.09, 0.09]
  const cornerAdj = anterior ? adj.corner * (1 - 0.32 * sex) * (1 - 0.55 * p.age) * (1 - 0.22 * pers) : 1
  const cornerM = clamp(cornerBase[0] * cornerAdj, 0.02, 0.4)
  const cornerD = clamp(cornerBase[1] * cornerAdj, 0.02, 0.42)
  const dropBase = n === 1 ? [0.25, 0.7] : n === 2 ? [0.4, 1.05] : [0.2, 0.3]
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
    ridgeM: ridge.m,
    ridgeD: ridge.d,
    fullness: arch === 'upper' && n >= 4 ? p.fullness : arch === 'lower' && n >= 4 ? p.fullness * 0.35 : 0,
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
  const archLower = makeArch('lower', p.archForm, p.archScale, p.archDepth * 0.92)
  const cfgOf = (fdi: number) => teeth[fdi] ?? defaultToothCfg()
  const sides = [-1, 1] as const

  // ---- 1) larguras (arco) ---------------------------------------------------------------------------------------
  const wUp: Record<number, SideWidths> = {}
  for (const sd of sides) wUp[sd] = archWidths('upper', p.upperTo, p, (n, s) => cfgOf(makeFdi('upper', s, n)), sd, archUpper)
  const wLo: Record<number, SideWidths> = {}
  let classI: Layout['classI'] = null
  if (p.lowerEnabled) {
    for (const sd of sides) wLo[sd] = archWidths('lower', p.lowerTo, p, (n, s) => cfgOf(makeFdi('lower', s, n)), sd, archLower)
    if (p.classI && p.upperTo >= 6 && p.lowerTo >= 6) {
      // relação de CHAVE 1 (Andrews): canino superior na embrasura inferior; cúspide MV do 1º molar superior no sulco do inferior
      let resC = 0
      let resM = 0
      for (const sd of sides) {
        const u = wUp[sd]
        const l = wLo[sd]
        const w = l.widthArc.slice()
        const uCanineTip = (u.s0[2] + u.s1[2]) / 2
        const lAnt = w[0] + w[1] + w[2]
        const f1 = clamp((uCanineTip - 0.2) / lAnt, 0.93, 1.1)
        w[0] *= f1
        w[1] *= f1
        w[2] *= f1
        const lCanineEnd = w[0] + w[1] + w[2]
        const uMB = u.s0[5] + 0.28 * (u.s1[5] - u.s0[5])
        const lPM = w[3] + w[4]
        const lM1 = w[5]
        const f2 = clamp((uMB - 0.36 * lM1 - lCanineEnd) / lPM, 0.9, 1.1)
        w[3] *= f2
        w[4] *= f2
        wLo[sd] = cumulate(w)
        resC += Math.abs(uCanineTip - wLo[sd].s1[2])
        resM += Math.abs(uMB - (wLo[sd].s0[5] + 0.36 * w[5]))
      }
      classI = { canine: resC / 2, molar: resM / 2, applied: true }
    }
  }

  // ---- 2) alturas: zênites e cúspides ----------------------------------------------------------------------------
  const wearMm = (n: number) => (n <= 3 ? (n === 2 ? 0.9 : 1.1) * p.age : 0.3 * p.age)
  const Hc = ((p.centralWidth * p.widthScale) / p.wl) * p.heightScale - wearMm(1)
  const Zc = Hc + p.zenithShift
  const lowerScale = Hc / baseDim('upper', 1).H
  const Xl = baseDim('lower', 1).H * lowerScale

  const edgeUp = (n: number) => p.incisalOffset + smileArcOf(n, p) + SPEE_PROFILE[n - 1] * p.spee
  const edgeLo = (n: number) => edgeUp(n) + p.overbite * OVERBITE_FADE[n - 1]
  const heightUp = (n: number) => Math.max(5, Zc + ZENITH_UP[n - 1] - smileArcOf(n, p) - SPEE_PROFILE[n - 1] * p.spee - (n > 1 ? wearMm(n) - wearMm(1) : 0))
  const heightLo = (n: number) => Math.max(5, Xl + ZENITH_LO[n - 1] - (n <= 3 ? wearMm(n) * 0.5 : 0))

  // ---- 3) cristas marginais: seguem a altura do dente vizinho -----------------------------------------------------
  const ridgesFor = (arch: ArchId, upTo: number) => {
    const out: Record<number, { m: number; d: number }> = {}
    const dirSign = arch === 'upper' ? 1 : -1 // queda em direção ao cervical
    const edge = (n: number) => (arch === 'upper' ? edgeUp(n) : edgeLo(n))
    const yR = (n: number) => edge(n) + dirSign * RIDGE_NOMINAL[n - 1]
    for (let n = 4; n <= upTo; n++) out[n] = { m: RIDGE_NOMINAL[n - 1], d: RIDGE_NOMINAL[n - 1] }
    for (let n = 4; n < upTo; n++) {
      const R = (yR(n) + yR(n + 1)) / 2
      out[n].d = clamp(Math.abs(R - edge(n)), 0.3, 2.2)
      out[n + 1].m = clamp(Math.abs(R - edge(n + 1)), 0.3, 2.2)
    }
    return out
  }
  const ridgeUp = ridgesFor('upper', p.upperTo)
  const ridgeLo = ridgesFor('lower', p.lowerTo)

  // ---- 4) colocação ----------------------------------------------------------------------------------------------
  const place = (arch: ArchId, upTo: number, curve: ArchCurve, widths: Record<number, SideWidths>): ToothPlacement[] => {
    const out: ToothPlacement[] = []
    const upper = arch === 'upper'
    for (const side of sides) {
      for (let n = 1; n <= upTo; n++) {
        const fdi = makeFdi(arch, side, n)
        const cfg = cfgOf(fdi)
        const wArc = widths[side].widthArc[n - 1]
        const sMid = (widths[side].s0[n - 1] + widths[side].s1[n - 1]) / 2
        const c = curve.at(sMid)
        const baseEdge = upper ? edgeUp(n) : edgeLo(n)
        const Hbase = upper ? heightUp(n) : heightLo(n)
        const H = Math.max(5, Hbase * cfg.h)
        const rd = (upper ? ridgeUp : ridgeLo)[n] ?? { m: 0, d: 0 }
        const spec = buildSpec(fdi, wArc, H, p, cfg, cfg.status, cervFade, rd)

        const tipBase = (upper ? TIP_UP : TIP_LO)[n - 1] * p.tipScale
        // Wilson: torque posterior progressivo (anteriores seguem torqueScale)
        const tq = (upper ? TORQUE_UP : TORQUE_LO)[n - 1]
        const torqueBase = n >= 4 ? tq * p.wilson * p.torqueScale : tq * p.torqueScale
        const artZ = (upper ? ARTISTIC_Z_UP : ARTISTIC_Z_LO)[n - 1] * p.artistic
        const artRot = (upper ? ARTISTIC_ROT_UP : ARTISTIC_ROT_LO)[n - 1] * p.artistic * side

        const edgeY = baseEdge + cfg.dy
        const zShift = arch === 'lower' ? -(p.overjet + 1.0) * OVERBITE_FADE[n - 1] : 0
        const ys = upper ? -1 : 1
        const xAxis = new THREE.Vector3(side === 1 ? c.tx : -c.tx, 0, c.tz)
        const zAxis = side === 1 ? new THREE.Vector3(-c.tz, 0, c.tx) : new THREE.Vector3(c.tz, 0, c.tx)
        const yAxis = new THREE.Vector3(0, ys, 0)
        const pos = new THREE.Vector3(side * c.x, edgeY, c.z + zShift)
        pos.addScaledVector(xAxis, cfg.dx)
        pos.addScaledVector(zAxis, cfg.dz + artZ)
        const frame = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(pos)
        const local = new THREE.Matrix4()
          .multiply(new THREE.Matrix4().makeRotationY((cfg.rot + artRot) * DEG))
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
          zenithY: upper ? edgeY + H : edgeY - H,
        })
      }
    }
    return out
  }

  const upper = place('upper', p.upperTo, archUpper, wUp)
  const lower = p.lowerEnabled ? place('lower', p.lowerTo, archLower, wLo) : []
  const all = [...upper, ...lower]
  const byFdi = new Map<number, ToothPlacement>()
  for (const t of all) byFdi.set(t.fdi, t)
  return { upper, lower, archUpper, archLower, all, byFdi, classI }
}

/** Ordem esquerda→direita da imagem para listas de UI. */
export const orderedFdi = (arch: ArchId, upTo: number) => archFdiList(arch, upTo)

export { fdiSide }
