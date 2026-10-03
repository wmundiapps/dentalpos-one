import { computeLayout } from '../core/designEngine'
import { activeVariant } from '../core/project'
import { PRESETS } from '../core/presets'
import { applyMode, newVariant, teethForMode } from '../core/project'
import { fitSmileArc } from '../core/analysis'
import { autoDesignVariant } from '../core/autoDesign'
import { pxPerMm } from '../render/overlay'
import { deepClone, uid } from '../core/math'
import { getPhotoBitmap, getState, mutate, mutateVariant, setState, toast } from '../store/store'

export function currentPhotoSize() {
  const s = getState()
  const b = getPhotoBitmap(s.project.basePhotoId)
  return b ? { w: b.width, h: b.height } : null
}

/** Ajusta o arco do sorriso e o nível do plano incisal ao lábio inferior. */
export function fitArcToLip(silent = false) {
  const s = getState()
  const sz = currentPhotoSize()
  if (!sz) return false
  const p = s.project
  const v = activeVariant(p)
  const layout = computeLayout(v.params, v.teeth)
  const fit = fitSmileArc(p, v, layout, sz.w, sz.h)
  if (!fit) {
    if (!silent) toast('Marque o contorno interno dos lábios (Análise) para ajustar o arco.', 'err')
    return false
  }
  mutateVariant((vv) => {
    vv.params.smileArc = +fit.smileArc.toFixed(2)
  })
  if (!silent) toast('Arco do sorriso ajustado ao lábio inferior.', 'ok')
  return true
}

/** IA: detecta pupilas, linha média, lábios, asas nasais e zigomas na foto base (100% local). */
export async function detectAndApply(silent = false): Promise<boolean> {
  const s = getState()
  const bmp = getPhotoBitmap(s.project.basePhotoId)
  if (!bmp) {
    toast('Adicione uma foto base primeiro.', 'err')
    return false
  }
  setState({ busy: 'IA: detectando pontos faciais…' })
  try {
    const { detectFace } = await import('../ai/faceLandmarks')
    const r = await detectFace(bmp)
    if (!r) {
      toast('Rosto não detectado. Use uma foto frontal nítida com os olhos visíveis ou marque manualmente.', 'err')
      return false
    }
    mutate((p) => {
      p.marks = { ...p.marks, ...r.marks }
      p.face = { source: 'ia', shape: r.metrics.shape, label: r.metrics.shapeLabel, lengthWidth: +r.metrics.lengthWidth.toFixed(3), jawCheek: +r.metrics.jawCheek.toFixed(3), smile: +r.metrics.smile.toFixed(2) }
      for (const v of p.variants) v.anchor = null
    })
    if (!silent) toast(`IA: pontos marcados · rosto ${r.metrics.shapeLabel.toLowerCase()}${r.metrics.smile < 0.35 ? ' · atenção: a foto parece sem sorriso aberto' : ''}.`, r.metrics.smile < 0.35 ? 'info' : 'ok')
    return true
  } catch (e) {
    console.error(e)
    toast('Não foi possível carregar a IA neste navegador. Use a análise guiada manual.', 'err')
    return false
  } finally {
    setState({ busy: null })
  }
}

/** Média de cor (hex) de um trecho da foto. */
function samplePhoto(bmp: ImageBitmap, x: number, y: number, r = 5): [number, number, number] | null {
  try {
    const c = document.createElement('canvas')
    const d = r * 2 + 1
    c.width = d
    c.height = d
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(bmp, x - r, y - r, d, d, 0, 0, d, d)
    const px = g.getImageData(0, 0, d, d).data
    let R = 0, G = 0, B = 0
    for (let i = 0; i < px.length; i += 4) {
      R += px[i]; G += px[i + 1]; B += px[i + 2]
    }
    const n = px.length / 4
    return [R / n, G / n, B / n]
  } catch {
    return null
  }
}

/** Desenho automático natural: IA (se faltarem pontos) + regras clínicas (ver core/autoDesign.ts). */
export async function autoDesign() {
  const sz = currentPhotoSize()
  if (!sz) return toast('Adicione uma foto base primeiro.', 'err')
  let p = getState().project
  if (!(p.marks.pupilR && p.marks.pupilL && p.marks.mouth && p.marks.mouth.length >= 4 && p.marks.upMid && p.marks.lowMid)) {
    if (!(await detectAndApply(true))) return
    p = getState().project
  }
  const v = activeVariant(p)
  const r = autoDesignVariant(p, v, sz.w, sz.h)
  // cor da gengiva virtual: mistura do lábio superior da foto com rosa gengival (acompanha a pele/iluminação)
  const bmp = getPhotoBitmap(p.basePhotoId)
  if (bmp && p.marks.upMid) {
    const lip = samplePhoto(bmp, p.marks.upMid.x, p.marks.upMid.y - 8)
    if (lip) {
      const pink = [201, 98, 111]
      const hex = '#' + [0, 1, 2].map((i) => Math.round(Math.min(255, (lip[i] * 0.45 + pink[i] * 0.55) * 0.92)).toString(16).padStart(2, '0')).join('')
      r.variant.look.gumColor = hex
    }
  }
  mutate((pr) => {
    const i = pr.variants.findIndex((x) => x.id === v.id)
    pr.variants[i] = { ...r.variant, id: v.id, name: v.name }
  })
  toast('Desenho automático aplicado. ' + r.notes.slice(0, 2).join(' '), 'ok')
}

export function generateProposals() {
  mutate((p) => {
    const base = activeVariant(p)
    const picks = [PRESETS[0], PRESETS[3], PRESETS[4]]
    const letters = ['B', 'C', 'D']
    picks.forEach((pr, i) => {
      const v = deepClone(base)
      v.id = uid('var')
      v.name = `${letters[i]} · ${pr.name}`
      Object.assign(v.params, pr.params)
      v.params.upperTo = base.params.upperTo
      v.params.mode = base.params.mode
      v.params.rollOffset = base.params.rollOffset
      v.params.midlineShift = base.params.midlineShift
      v.params.cameraDistance = base.params.cameraDistance
      v.params.incisalOffset = base.params.incisalOffset
      p.variants.push(v)
    })
  })
  toast('3 propostas geradas (Natural jovem, Hollywood, Feminino suave).', 'ok')
}

export function applyPreset(id: string) {
  const pr = PRESETS.find((x) => x.id === id)
  if (!pr) return
  mutateVariant((v) => {
    Object.assign(v.params, pr.params)
  })
}

export function resetTooth(fdi: number) {
  mutateVariant((v) => {
    const st = v.teeth[fdi].status
    v.teeth[fdi] = { ...teethForMode(v.params)[fdi], status: st }
  })
}

export function setStatusMany(fdis: number[], status: import('../core/types').ToothStatus) {
  mutateVariant((v) => {
    for (const f of fdis) if (v.teeth[f]) v.teeth[f].status = status
    v.params.mode = 'custom'
  })
}

export function ipdPxPerMm() {
  const p = getState().project
  return pxPerMm(p, p.marks)
}

export { applyMode, newVariant }
