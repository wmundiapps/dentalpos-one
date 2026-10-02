import type { ArchId, DesignParams, ShapeId, SizeSetId } from './types'
import { clamp } from './math'

export type ToothClass = 'incisor' | 'canine' | 'premolar' | 'molar'

/** Dimensões médias de coroa (mm) — Wheeler / Nelson (valores arredondados de uso corrente). */
export interface BaseDim {
  W: number // mésio-distal no ponto de contato
  H: number // altura da coroa (cervical → incisal/oclusal)
  BL: number // vestíbulo-lingual máximo
  cerv: number // razão largura cervical / largura de contato
  tcM: number // altura relativa do contato mesial (0 cervical … 1 incisal)
  tcD: number
  cervCurve: number // mm de curvatura da junção cemento-esmalte nas proximais
}

const UP: Record<number, BaseDim> = {
  1: { W: 8.6, H: 10.8, BL: 7.0, cerv: 0.8, tcM: 0.9, tcD: 0.8, cervCurve: 3.2 },
  2: { W: 6.6, H: 9.2, BL: 6.0, cerv: 0.74, tcM: 0.84, tcD: 0.72, cervCurve: 2.8 },
  3: { W: 7.6, H: 10.4, BL: 8.0, cerv: 0.7, tcM: 0.82, tcD: 0.66, cervCurve: 2.4 },
  4: { W: 7.0, H: 8.4, BL: 9.0, cerv: 0.78, tcM: 0.6, tcD: 0.6, cervCurve: 1.6 },
  5: { W: 6.8, H: 8.0, BL: 9.0, cerv: 0.8, tcM: 0.6, tcD: 0.6, cervCurve: 1.4 },
  6: { W: 10.0, H: 7.4, BL: 11.0, cerv: 0.8, tcM: 0.62, tcD: 0.62, cervCurve: 1.0 },
  7: { W: 9.2, H: 7.0, BL: 11.0, cerv: 0.78, tcM: 0.62, tcD: 0.62, cervCurve: 0.9 },
  8: { W: 8.6, H: 6.6, BL: 10.0, cerv: 0.75, tcM: 0.62, tcD: 0.62, cervCurve: 0.8 },
}

const LO: Record<number, BaseDim> = {
  1: { W: 5.4, H: 9.0, BL: 6.0, cerv: 0.78, tcM: 0.92, tcD: 0.92, cervCurve: 2.2 },
  2: { W: 5.9, H: 9.4, BL: 6.4, cerv: 0.78, tcM: 0.9, tcD: 0.88, cervCurve: 2.2 },
  3: { W: 6.9, H: 10.8, BL: 7.6, cerv: 0.72, tcM: 0.86, tcD: 0.7, cervCurve: 2.0 },
  4: { W: 7.0, H: 8.4, BL: 7.8, cerv: 0.78, tcM: 0.6, tcD: 0.6, cervCurve: 1.4 },
  5: { W: 7.0, H: 8.0, BL: 8.2, cerv: 0.8, tcM: 0.6, tcD: 0.6, cervCurve: 1.2 },
  6: { W: 11.0, H: 7.4, BL: 10.6, cerv: 0.82, tcM: 0.62, tcD: 0.62, cervCurve: 1.0 },
  7: { W: 10.4, H: 7.0, BL: 10.2, cerv: 0.8, tcM: 0.62, tcD: 0.62, cervCurve: 0.9 },
  8: { W: 10.0, H: 6.8, BL: 9.8, cerv: 0.76, tcM: 0.62, tcD: 0.62, cervCurve: 0.8 },
}

export const baseDim = (arch: ArchId, n: number): BaseDim => (arch === 'upper' ? UP : LO)[clamp(n, 1, 8)]

export const toothClass = (n: number): ToothClass => (n <= 2 ? 'incisor' : n === 3 ? 'canine' : n <= 5 ? 'premolar' : 'molar')

/** Quadrante FDI → lado (−1 = direito do paciente = esquerda da imagem, +1 = esquerdo). */
export const fdiSide = (fdi: number): -1 | 1 => {
  const q = Math.floor(fdi / 10)
  return q === 1 || q === 4 ? -1 : 1
}
export const fdiArch = (fdi: number): ArchId => (Math.floor(fdi / 10) <= 2 ? 'upper' : 'lower')
export const fdiIndex = (fdi: number) => fdi % 10
export const makeFdi = (arch: ArchId, side: -1 | 1, n: number) => {
  const q = arch === 'upper' ? (side === -1 ? 1 : 2) : side === 1 ? 3 : 4
  return q * 10 + n
}

export const toothNames: Record<number, string> = {
  1: 'Incisivo central',
  2: 'Incisivo lateral',
  3: 'Canino',
  4: '1º pré-molar',
  5: '2º pré-molar',
  6: '1º molar',
  7: '2º molar',
  8: '3º molar',
}
export const toothLabel = (fdi: number) => `${fdi} · ${toothNames[fdiIndex(fdi)]}`

/** Todas as FDI de um arco ordenadas da direita do paciente para a esquerda (esq. → dir. da imagem). */
export function archFdiList(arch: ArchId, upTo: number): number[] {
  const out: number[] = []
  for (let n = upTo; n >= 1; n--) out.push(makeFdi(arch, -1, n))
  for (let n = 1; n <= upTo; n++) out.push(makeFdi(arch, 1, n))
  return out
}

export const SIZE_SETS: { id: SizeSetId; label: string; centralWidth: number; hint: string }[] = [
  { id: 'XS', label: 'PP · extra-pequeno', centralWidth: 7.4, hint: 'Arcos curtos, rosto delicado' },
  { id: 'S', label: 'P · pequeno', centralWidth: 8.0, hint: 'Feminino delicado' },
  { id: 'M', label: 'M · médio', centralWidth: 8.6, hint: 'Média anatômica' },
  { id: 'L', label: 'G · grande', centralWidth: 9.2, hint: 'Rosto largo / sorriso amplo' },
  { id: 'XL', label: 'GG · extra-grande', centralWidth: 9.8, hint: 'Efeito "hollywood"' },
]

export const SHAPES: { id: ShapeId; label: string; hint: string; letter: string }[] = [
  { id: 'natural', label: 'Natural', hint: 'Mistura anatômica equilibrada', letter: 'N' },
  { id: 'ovoid', label: 'Ovoide', hint: 'Ângulos arredondados, feminino/suave', letter: 'O' },
  { id: 'square', label: 'Quadrado', hint: 'Faces planas, ângulos marcados', letter: 'S' },
  { id: 'triangular', label: 'Triangular', hint: 'Cervical estreita, proximais divergentes', letter: 'T' },
  { id: 'rectangular', label: 'Retangular', hint: 'Dentes longos, aspecto elegante', letter: 'R' },
  { id: 'round', label: 'Arredondado', hint: 'Bordos suaves, aspecto jovial', letter: 'A' },
]

/** Parâmetros anatômicos que a forma altera (anteriores). */
export interface ShapeAdj {
  cerv: number // multiplicador da razão cervical
  corner: number // multiplicador do arredondamento dos ângulos incisais
  tcShift: number // desloca contatos (+ = para incisal)
  fossa: number
  canineTip: number // 0–1 agudez da cúspide do canino
  wlBias: number // soma ao W/L sugerido
}

export const SHAPE_ADJ: Record<ShapeId, ShapeAdj> = {
  natural: { cerv: 1.0, corner: 1.0, tcShift: 0, fossa: 1, canineTip: 0.55, wlBias: 0 },
  ovoid: { cerv: 0.88, corner: 1.9, tcShift: -0.04, fossa: 0.9, canineTip: 0.35, wlBias: 0.02 },
  square: { cerv: 1.1, corner: 0.35, tcShift: 0.03, fossa: 1.1, canineTip: 0.4, wlBias: 0.04 },
  triangular: { cerv: 0.68, corner: 0.28, tcShift: 0.07, fossa: 1, canineTip: 0.85, wlBias: -0.02 },
  rectangular: { cerv: 1.05, corner: 0.4, tcShift: 0.04, fossa: 1.1, canineTip: 0.5, wlBias: -0.1 },
  round: { cerv: 0.9, corner: 2.4, tcShift: -0.06, fossa: 0.8, canineTip: 0.2, wlBias: 0.05 },
}

/** Razões entre largura (em relação ao central) de cada sistema de proporção; "apparent" = vista frontal. */
export interface ProportionSystem {
  id: string
  label: string
  ratios: [number, number] | null // lateral, canino (aparentes). null → medidas reais anatômicas
  desc: string
}

export const PROPORTIONS: ProportionSystem[] = [
  { id: 'natural', label: 'Natural (Wheeler)', ratios: null, desc: 'Larguras anatômicas reais; recomendação padrão.' },
  { id: 'golden', label: 'Proporção áurea (1 : 0,618 : 0,382)', ratios: [0.618, 0.382], desc: 'Levin — larguras aparentes em vista frontal.' },
  { id: 'red', label: 'Proporção RED (recorrente)', ratios: [0.7, 0.49], desc: 'Ward — cada dente mantém a mesma razão (≈70%) do vizinho anterior.' },
  { id: 'preston', label: 'Preston', ratios: [0.66, 0.55], desc: 'Preston — lateral ≈66% do central; canino ≈84% do lateral.' },
  { id: 'chu', label: 'Porcentagem áurea (Chu)', ratios: [0.6, 0.4], desc: 'Chu — 25% / 15% / 10% da largura intercaninos.' },
]

/** Razão natural (largura real) em relação ao incisivo central. */
export function naturalRatio(arch: ArchId, n: number): number {
  return baseDim(arch, n).W / baseDim(arch, 1).W
}

export function defaultWL(shape: ShapeId, age: number, sex: number): number {
  const base = 0.8 + SHAPE_ADJ[shape].wlBias
  return clamp(base + age * 0.06 - sex * 0.01, 0.62, 0.98)
}

export function paramsForSizeSet(id: SizeSetId, current: DesignParams): Partial<DesignParams> {
  const s = SIZE_SETS.find((x) => x.id === id)
  return s ? { sizeSet: id, centralWidth: s.centralWidth } : { sizeSet: 'custom' }
}

/** Catálogo de moldes (largura × comprimento do central, soma anterior etc.) — para escolha rápida. */
export interface MoldEntry {
  key: string
  shape: ShapeId
  size: SizeSetId
  label: string
  centralW: number
  centralH: number
  anteriorSix: number // soma das larguras reais dos 6 anteriores
}

export function moldCatalog(): MoldEntry[] {
  const out: MoldEntry[] = []
  for (const sh of SHAPES) {
    for (const sz of SIZE_SETS) {
      const wl = clamp(0.8 + SHAPE_ADJ[sh.id].wlBias, 0.7, 0.9)
      const w = sz.centralWidth
      const six = 2 * (w + w * naturalRatio('upper', 2) + w * naturalRatio('upper', 3))
      out.push({
        key: `${sh.id}-${sz.id}`,
        shape: sh.id,
        size: sz.id,
        label: `${sh.label} ${sz.id}`,
        centralW: w,
        centralH: +(w / wl).toFixed(1),
        anteriorSix: +six.toFixed(1),
      })
    }
  }
  return out
}
