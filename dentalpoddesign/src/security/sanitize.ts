import type { Project } from '../core/types'
import { createProject } from '../core/project'
import { defaultParams, defaultLook } from '../core/presets'
import { defaultToothCfg } from '../core/designEngine'
import type { SecurityConfig } from './config'
import { SecurityError, sniffImage } from './files'

/**
 * Importação segura de arquivos .dpd (JSON): rejeita chaves de poluição de protótipo, impõe limites,
 * valida tipos e reconstrói o projeto a partir de valores permitidos (nada é "espalhado" cegamente).
 */

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (k, v) => {
    if (FORBIDDEN.has(k)) throw new SecurityError('Arquivo rejeitado (chave proibida).', 'proto')
    return v
  })
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, d = '', max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : d)
const fin = (v: unknown, d: number, lo = -1e5, hi = 1e5) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const id = (v: unknown, d: string) => (typeof v === 'string' && /^[A-Za-z0-9_\-.]{1,80}$/.test(v) ? v : d)

/** Copia só as chaves conhecidas de `base`, validando o tipo (número finito, booleano, string curta). */
function pickTyped<T extends object>(base: T, src: unknown, enums: Partial<Record<keyof T, string[]>> = {}): T {
  const b = base as Record<string, unknown>
  const out: Record<string, unknown> = { ...b }
  if (!isObj(src)) return out as T
  for (const k of Object.keys(b)) {
    const d = b[k]
    const v = src[k]
    if (typeof d === 'number') out[k] = fin(v, d, -1e4, 1e4)
    else if (typeof d === 'boolean') out[k] = typeof v === 'boolean' ? v : d
    else if (typeof d === 'string') {
      const allowed = (enums as Record<string, string[] | undefined>)[k]
      const s = str(v, d, 40)
      out[k] = allowed ? (allowed.includes(s) ? s : d) : s
    }
  }
  return out as T
}

const STATUS = ['natural', 'veneer', 'crown', 'pontic', 'implant', 'denture', 'missing', 'extraction']
const SHAPES = ['ovoid', 'square', 'triangular', 'rectangular', 'round', 'natural']
const KINDS = ['smile', 'face', 'rest', 'retracted', 'profile', 'occlusal', 'other']

function pt(v: unknown) {
  return isObj(v) && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y) && Math.abs(v.x) < 1e5 && Math.abs(v.y) < 1e5 ? { x: v.x, y: v.y } : undefined
}

export function sanitizeProject(raw: unknown): Project {
  if (!isObj(raw)) throw new SecurityError('Projeto inválido.', 'schema')
  const base = createProject('x')
  const p: Project = { ...base, variants: [], photos: [], models: [] }
  p.id = id(raw.id, base.id)
  p.name = str(raw.name, 'Caso importado')
  p.notes = str(raw.notes, '', 5000)
  p.demo = raw.demo === true
  if (isObj(raw.patient)) {
    p.patient = { name: str(raw.patient.name), hostId: raw.patient.hostId ? str(raw.patient.hostId, '', 80) : undefined, notes: raw.patient.notes ? str(raw.patient.notes, '', 2000) : undefined, age: typeof raw.patient.age === 'number' ? fin(raw.patient.age, 0, 0, 130) : undefined, sex: raw.patient.sex === 'F' || raw.patient.sex === 'M' ? raw.patient.sex : undefined }
  }
  const photos = Array.isArray(raw.photos) ? raw.photos.slice(0, 40) : []
  for (const ph of photos) {
    if (!isObj(ph)) continue
    p.photos.push({ id: id(ph.id, 'ph_' + p.photos.length), kind: (KINDS.includes(str(ph.kind, 'other', 20)) ? str(ph.kind, 'other', 20) : 'other') as never, name: str(ph.name, 'foto'), width: fin(ph.width, 0, 0, 20000), height: fin(ph.height, 0, 0, 20000) })
  }
  p.basePhotoId = typeof raw.basePhotoId === 'string' && p.photos.some((x) => x.id === raw.basePhotoId) ? raw.basePhotoId : p.photos[0]?.id ?? null
  if (isObj(raw.marks)) {
    const m: Record<string, unknown> = {}
    for (const k of ['pupilR', 'pupilL', 'midTop', 'midBottom', 'commR', 'commL', 'upMid', 'lowMid', 'alarR', 'alarL', 'zygR', 'zygL', 'calibA', 'calibB', 'profComm', 'profTragus']) {
      const q = pt(raw.marks[k])
      if (q) m[k] = q
    }
    for (const k of ['mouth', 'gumLine', 'lowerLipCurve']) {
      const a = raw.marks[k]
      if (Array.isArray(a)) m[k] = a.slice(0, 64).map(pt).filter(Boolean)
    }
    p.marks = m as Project['marks']
  }
  if (isObj(raw.calib)) p.calib = { method: ['ipd', 'twoPoints', 'manual'].includes(str(raw.calib.method, '', 12)) ? (raw.calib.method as never) : 'ipd', pxPerMm: fin(raw.calib.pxPerMm, 0, 0, 1000), ipdMm: fin(raw.calib.ipdMm, 63, 40, 90), refMm: fin(raw.calib.refMm, 8.5, 1, 300) }
  if (isObj(raw.face)) p.face = { source: raw.face.source === 'ia' ? 'ia' : 'manual', shape: (['square', 'round', 'oval', 'triangular'].includes(str(raw.face.shape, '', 12)) ? raw.face.shape : 'oval') as never, label: str(raw.face.label, 'Oval', 40), lengthWidth: fin(raw.face.lengthWidth, 1.3, 0, 5), jawCheek: fin(raw.face.jawCheek, 0.8, 0, 5), smile: fin(raw.face.smile, 0, 0, 1) }
  const variants = Array.isArray(raw.variants) ? raw.variants.slice(0, 20) : []
  for (const v of variants) {
    if (!isObj(v)) continue
    const params = pickTyped(defaultParams(), v.params, {
      mode: ['veneers', 'crowns', 'partial', 'complete', 'custom'],
      shape: SHAPES,
      sizeSet: ['XS', 'S', 'M', 'L', 'XL', 'custom'],
      proportion: ['natural', 'golden', 'goldenNat', 'red', 'preston', 'chu'],
      archForm: ['tapered', 'ovoid', 'square'],
    })
    params.upperTo = Math.round(Math.min(8, Math.max(3, params.upperTo)))
    params.lowerTo = Math.round(Math.min(8, Math.max(3, params.lowerTo)))
    const teeth: Record<number, ReturnType<typeof defaultToothCfg>> = {}
    for (const arch of [1, 2, 3, 4]) {
      for (let n = 1; n <= 8; n++) {
        const f = arch * 10 + n
        const src = isObj(v.teeth) ? (v.teeth as Record<string, unknown>)[String(f)] : undefined
        const d = defaultToothCfg('natural')
        const t = pickTyped(d, src)
        const status = isObj(src) ? str(src.status, 'natural', 12) : 'natural'
        t.status = (STATUS.includes(status) ? status : 'natural') as never
        if (isObj(src) && typeof src.shade === 'string' && /^[A-D0-9.BL]{2,5}$/.test(src.shade)) t.shade = src.shade
        if (isObj(src) && SHAPES.includes(str(src.shape, '', 12))) t.shape = src.shape as never
        teeth[f] = t
      }
    }
    p.variants.push({ id: id(v.id, 'var_' + p.variants.length), name: str(v.name, 'Proposta'), params, teeth, look: pickTyped(defaultLook(), v.look), anchor: pt(v.anchor) ?? null })
  }
  if (!p.variants.length) p.variants = base.variants
  p.activeVariant = p.variants.some((v) => v.id === raw.activeVariant) ? (raw.activeVariant as string) : p.variants[0].id
  const models = Array.isArray(raw.models) ? raw.models.slice(0, 10) : []
  for (const m of models) {
    if (!isObj(m)) continue
    p.models.push({ id: id(m.id, 'mdl_' + p.models.length), name: str(m.name, 'modelo'), arch: ['upper', 'lower', 'bite'].includes(str(m.arch, '', 6)) ? (m.arch as never) : 'upper', triangles: fin(m.triangles, 0, 0, 1e8), tx: fin(m.tx, 0, -500, 500), ty: fin(m.ty, 0, -500, 500), tz: fin(m.tz, 0, -500, 500), rx: fin(m.rx, 0, -360, 360), ry: fin(m.ry, 0, -360, 360), rz: fin(m.rz, 0, -360, 360), scale: fin(m.scale, 1, 0.1, 10), opacity: fin(m.opacity, 0.85, 0, 1), visible: m.visible !== false })
  }
  if (isObj(raw.export)) p.export = pickTyped(p.export, raw.export, { format: ['stl', 'obj', 'ply', '3mf'], quality: ['draft', 'standard', 'high'], product: ['wax', 'veneerShell', 'hollowCrown', 'solid'], orientation: ['clinical', 'print'] }) as never
  if (isObj(raw.denture)) p.denture = pickTyped(p.denture, raw.denture, { palatal: ['plate', 'strap', 'none'], lowerConnector: ['lingualBar', 'horseshoe', 'none'] }) as never
  if (typeof p.denture.baseColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p.denture.baseColor)) p.denture.baseColor = '#d9788a'
  p.createdAt = fin(raw.createdAt, Date.now(), 0, 4e12)
  p.updatedAt = Date.now()
  return p
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

/** Converte um data-URL de imagem em Blob verificando a assinatura real do arquivo. */
export function imageFromDataUrl(url: unknown, cfg: SecurityConfig): Blob | null {
  if (typeof url !== 'string' || url.length > cfg.maxPhotoMB * 1.4 * 1024 * 1024) return null
  const m = DATA_URL.exec(url)
  if (!m) return null
  const bin = atob(m[2])
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return sniffImage(u) ? new Blob([u], { type: m[1] }) : null
}
