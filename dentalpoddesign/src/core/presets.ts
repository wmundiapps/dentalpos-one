import type { DesignParams, LookParams } from './types'

export interface Preset {
  id: string
  name: string
  desc: string
  params: Partial<DesignParams>
}

export const defaultParams = (): DesignParams => ({
  mode: 'veneers',
  shape: 'natural',
  sizeSet: 'M',
  centralWidth: 8.6,
  wl: 0.8,
  proportion: 'natural',
  redPct: 0.7,
  archForm: 'ovoid',
  archScale: 1,
  archDepth: 1,
  smileArc: 1,
  sex: 0,
  age: 0.15,
  personality: 0,
  shade: 'A1',
  lowerShade: 'A2',
  translucency: 0.55,
  mamelons: 0.4,
  texture: 0.5,
  gloss: 0.55,
  upperTo: 5,
  lowerEnabled: false,
  lowerTo: 5,
  overbite: 2,
  overjet: 2.5,
  rollOffset: 0,
  yaw: 0,
  pitch: 0,
  midlineShift: 0,
  cameraDistance: 600,
  incisalOffset: 0,
  tipScale: 1,
  torqueScale: 1,
  contactTightness: 0,
})

export const defaultLook = (): LookParams => ({
  exposure: 1,
  mouthShadow: 0.5,
  feather: 1.2,
  opacity: 1,
  outline: false,
  showTeeth: true,
  eraseOld: true,
})

export const PRESETS: Preset[] = [
  {
    id: 'natural-jovem',
    name: 'Natural jovem',
    desc: 'Ovoide suave, mamelões visíveis, translucidez alta — resultado discreto.',
    params: { shape: 'ovoid', sizeSet: 'M', centralWidth: 8.6, wl: 0.82, proportion: 'natural', sex: -0.2, age: 0.05, personality: -0.1, shade: 'A1', translucency: 0.7, mamelons: 0.7, smileArc: 1.1 },
  },
  {
    id: 'natural-adulto',
    name: 'Natural adulto',
    desc: 'Equilíbrio anatômico; ligeiro desgaste incisal, cor A2.',
    params: { shape: 'natural', sizeSet: 'M', centralWidth: 8.6, wl: 0.8, proportion: 'natural', sex: 0, age: 0.4, personality: 0, shade: 'A2', translucency: 0.5, mamelons: 0.3 },
  },
  {
    id: 'maduro',
    name: 'Maduro / desgaste',
    desc: 'Dentes mais curtos e quadrados, bordas planas, cor mais saturada.',
    params: { shape: 'square', sizeSet: 'M', centralWidth: 8.8, wl: 0.88, sex: 0.2, age: 0.85, personality: 0, shade: 'A3', translucency: 0.3, mamelons: 0 },
  },
  {
    id: 'hollywood',
    name: 'Hollywood',
    desc: 'Dentes grandes e muito claros (BL2), forma retangular elegante.',
    params: { shape: 'rectangular', sizeSet: 'XL', centralWidth: 9.7, wl: 0.76, proportion: 'red', redPct: 0.72, sex: 0, age: 0, personality: 0.2, shade: 'BL2', translucency: 0.35, mamelons: 0.1, smileArc: 1.2 },
  },
  {
    id: 'feminino-suave',
    name: 'Feminino suave',
    desc: 'Ângulos arredondados, laterais mais curtos, proporção áurea.',
    params: { shape: 'round', sizeSet: 'S', centralWidth: 8.1, wl: 0.84, proportion: 'golden', sex: -0.8, age: 0.05, personality: -0.7, shade: 'B1', translucency: 0.6, mamelons: 0.5, smileArc: 1.25 },
  },
  {
    id: 'masculino-vigoroso',
    name: 'Masculino vigoroso',
    desc: 'Formas quadradas, laterais próximos ao central, caninos marcados.',
    params: { shape: 'square', sizeSet: 'L', centralWidth: 9.2, wl: 0.8, proportion: 'natural', sex: 0.9, age: 0.25, personality: 0.8, shade: 'A2', translucency: 0.4, mamelons: 0.2, smileArc: 0.8 },
  },
  {
    id: 'elegante',
    name: 'Elegante alongado',
    desc: 'Retangulares e longos; Preston.',
    params: { shape: 'rectangular', sizeSet: 'L', centralWidth: 9.0, wl: 0.74, proportion: 'preston', sex: -0.3, age: 0.1, personality: 0.1, shade: 'B1', translucency: 0.5, mamelons: 0.3 },
  },
  {
    id: 'dinamico',
    name: 'Dinâmico (SPA)',
    desc: 'Triangulares com caninos agudos — sorriso expressivo.',
    params: { shape: 'triangular', sizeSet: 'M', centralWidth: 8.5, wl: 0.78, proportion: 'chu', sex: 0.1, age: 0.2, personality: 0.7, shade: 'A1', translucency: 0.6, mamelons: 0.5, smileArc: 1.3 },
  },
]
