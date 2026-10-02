import type { CrownColors, RGB } from '../geometry/toothMesh'
import { clamp, lerp } from './math'

export interface Shade {
  id: string
  name: string
  group: 'bleach' | 'B' | 'A' | 'D' | 'C'
  hex: string
}

/**
 * Referência visual aproximada (sRGB) de escala clássica A–D e clareamento.
 * NÃO substitui a escolha de cor com escala física sob iluminação padronizada.
 */
export const SHADES: Shade[] = [
  { id: 'BL1', name: 'BL1', group: 'bleach', hex: '#F7F3EA' },
  { id: 'BL2', name: 'BL2', group: 'bleach', hex: '#F4EEE0' },
  { id: 'BL3', name: 'BL3', group: 'bleach', hex: '#F1E9D6' },
  { id: 'BL4', name: 'BL4', group: 'bleach', hex: '#EEE3CB' },
  { id: 'B1', name: 'B1', group: 'B', hex: '#F2E8D4' },
  { id: 'A1', name: 'A1', group: 'A', hex: '#EEE0C6' },
  { id: 'B2', name: 'B2', group: 'B', hex: '#EBDBBB' },
  { id: 'D2', name: 'D2', group: 'D', hex: '#E7D9C4' },
  { id: 'A2', name: 'A2', group: 'A', hex: '#E5D2AE' },
  { id: 'C1', name: 'C1', group: 'C', hex: '#E1D4BD' },
  { id: 'C2', name: 'C2', group: 'C', hex: '#D9C8A9' },
  { id: 'D4', name: 'D4', group: 'D', hex: '#DBCCB1' },
  { id: 'A3', name: 'A3', group: 'A', hex: '#DEC59C' },
  { id: 'D3', name: 'D3', group: 'D', hex: '#E1CEAE' },
  { id: 'B3', name: 'B3', group: 'B', hex: '#E2CA9D' },
  { id: 'A3.5', name: 'A3,5', group: 'A', hex: '#D7B98C' },
  { id: 'B4', name: 'B4', group: 'B', hex: '#DDC088' },
  { id: 'C3', name: 'C3', group: 'C', hex: '#CEB896' },
  { id: 'A4', name: 'A4', group: 'A', hex: '#CEAF80' },
  { id: 'C4', name: 'C4', group: 'C', hex: '#C0A782' },
]

export const shadeById = (id: string): Shade => SHADES.find((s) => s.id === id) ?? SHADES[5]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
}
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
export const srgbToLinear = (c: RGB): RGB => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])]
export const linearToSrgb = (c: RGB): RGB =>
  c.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) as RGB

/** Gera as cores de uma coroa (corpo, cervical mais saturado, incisal translúcido-azulado). */
export function crownColors(shadeId: string, translucency: number, mamelons: number, age: number): CrownColors {
  const base = hexToRgb(shadeById(shadeId).hex)
  // envelhecimento: mais escuro/saturado e menos translúcido
  const darken = 1 - 0.05 * age
  const bodyS: RGB = [base[0] * darken, base[1] * darken, base[2] * (darken - 0.03 * age)]
  const cervS: RGB = [
    clamp(bodyS[0] * 0.97, 0, 1),
    clamp(bodyS[1] * 0.89, 0, 1),
    clamp(bodyS[2] * 0.74, 0, 1),
  ]
  const incS: RGB = [lerp(bodyS[0], 0.74, 0.55), lerp(bodyS[1], 0.78, 0.55), lerp(bodyS[2], 0.84, 0.55)]
  return {
    body: srgbToLinear(bodyS),
    cervical: srgbToLinear(cervS),
    incisal: srgbToLinear(incS),
    translucency: clamp(translucency * (1 - 0.4 * age), 0, 1),
    mamelons: clamp(mamelons * (1 - 0.8 * age), 0, 1),
  }
}
