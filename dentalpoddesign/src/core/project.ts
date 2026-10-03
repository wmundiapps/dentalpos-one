import type { DenturePlan, ExportSettings, Project, ToothCfg, ToothStatus, Variant, DesignParams } from './types'
import { defaultLook, defaultParams } from './presets'
import { defaultToothCfg } from './designEngine'
import { makeFdi } from './toothSpecs'
import { uid } from './math'

export const PROJECT_VERSION = 1

export const defaultDenture = (): DenturePlan => ({
  baseThickness: 2.6,
  flangeHeight: 11,
  palatal: 'plate',
  lowerConnector: 'horseshoe',
  clasps: true,
  festoon: 1,
  baseColor: '#d9788a',
})

export const defaultExport = (): ExportSettings => ({
  format: 'stl',
  binary: true,
  quality: 'standard',
  product: 'wax',
  shellThickness: 0.6,
  gap: 0.1,
  includeBase: true,
  splitTeeth: true,
  merge: false,
  orientation: 'print',
  pin: false,
  scaleToModel: false,
})

/** Mapa completo (todos os FDI 1–8 dos dois arcos) com situação conforme o modo. */
export function teethForMode(p: DesignParams): Record<number, ToothCfg> {
  const out: Record<number, ToothCfg> = {}
  for (const arch of ['upper', 'lower'] as const) {
    for (const side of [-1, 1] as const) {
      for (let n = 1; n <= 8; n++) {
        out[makeFdi(arch, side, n)] = defaultToothCfg(statusFor(arch, side, n, p))
      }
    }
  }
  return out
}

function statusFor(arch: 'upper' | 'lower', _side: -1 | 1, n: number, p: DesignParams): ToothStatus {
  if (arch === 'lower') return p.mode === 'complete' && n <= p.lowerTo ? 'denture' : 'natural'
  switch (p.mode) {
    case 'veneers':
      return n <= p.upperTo ? 'veneer' : 'natural'
    case 'crowns':
      return n <= Math.min(p.upperTo, 3) ? 'crown' : 'natural'
    case 'partial':
      return n <= 2 ? 'denture' : 'natural'
    case 'complete':
      return n <= p.upperTo ? 'denture' : 'natural'
    default:
      return 'natural'
  }
}

export function applyMode(variant: Variant, mode: DesignParams['mode']) {
  variant.params.mode = mode
  if (mode === 'veneers') {
    variant.params.upperTo = Math.max(5, Math.min(variant.params.upperTo, 5))
    variant.params.lowerEnabled = false
  }
  if (mode === 'crowns') {
    variant.params.upperTo = Math.max(3, variant.params.upperTo)
    variant.params.lowerEnabled = false
  }
  if (mode === 'partial') {
    variant.params.upperTo = Math.max(7, variant.params.upperTo)
    variant.params.lowerEnabled = false
  }
  if (mode === 'complete') {
    variant.params.upperTo = 7
    variant.params.lowerTo = 7
    variant.params.lowerEnabled = true
  }
  if (mode !== 'custom') variant.teeth = teethForMode(variant.params)
}

export function newVariant(name = 'Proposta A'): Variant {
  const params = defaultParams()
  return {
    id: uid('var'),
    name,
    params,
    teeth: teethForMode(params),
    look: defaultLook(),
    anchor: null,
  }
}

export function createProject(name = 'Novo caso'): Project {
  const v = newVariant('Proposta A')
  const now = Date.now()
  return {
    id: uid('prj'),
    version: PROJECT_VERSION,
    name,
    patient: { name: '' },
    createdAt: now,
    updatedAt: now,
    photos: [],
    basePhotoId: null,
    marks: {},
    calib: { method: 'ipd', pxPerMm: 0, ipdMm: 63, refMm: 8.5 },
    variants: [v],
    activeVariant: v.id,
    models: [],
    export: defaultExport(),
    denture: defaultDenture(),
    notes: '',
  }
}

export function activeVariant(p: Project): Variant {
  return p.variants.find((v) => v.id === p.activeVariant) ?? p.variants[0]
}

/** Atualiza a situação dos dentes conforme o modo (sem apagar ajustes individuais). */
export function syncStatuses(v: Variant) {
  if (v.params.mode === 'custom') return
  const fresh = teethForMode(v.params)
  for (const k of Object.keys(fresh)) if (v.teeth[+k]) v.teeth[+k].status = fresh[+k].status
}
