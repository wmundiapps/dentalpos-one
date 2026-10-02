import { computeLayout } from '../core/designEngine'
import { activeVariant } from '../core/project'
import { PRESETS } from '../core/presets'
import { applyMode, newVariant, teethForMode } from '../core/project'
import { archToImage, biometricSuggestion, fitSmileArc, incisalOffsetForDisplay } from '../core/analysis'
import { facialMidlineX, pxPerMm } from '../render/overlay'
import { deepClone, uid } from '../core/math'
import { getPhotoBitmap, getState, mutate, mutateVariant, toast } from '../store/store'

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

/** Desenho automático: linha média, plano incisal, tamanho por biometria e arco do sorriso. */
export function autoDesign() {
  const s = getState()
  const sz = currentPhotoSize()
  if (!sz) return toast('Adicione uma foto base primeiro.', 'err')
  const p = s.project
  if (!p.marks.pupilR || !p.marks.pupilL) return toast('Faça a análise facial (pupilas, linha média, lábios) antes do desenho automático.', 'err')
  const sug = biometricSuggestion(p)
  mutate((pr) => {
    const v = activeVariant(pr)
    v.anchor = null
    v.params.rollOffset = 0
    v.params.incisalOffset = 0
    v.params.midlineShift = 0
    const T = archToImage(pr, v, sz.w, sz.h)
    const fx = facialMidlineX(pr.marks, T.anchor.y)
    if (fx !== null) v.params.midlineShift = +((fx - T.anchor.x) / T.s).toFixed(2)
    const ref = sug.fromFace ?? sug.fromNose
    if (ref) {
      const w = Math.min(10, Math.max(7.2, ref))
      v.params.centralWidth = +w.toFixed(1)
      v.params.sizeSet = 'custom'
    }
  })
  {
    const v2 = activeVariant(getState().project)
    const layout = computeLayout(v2.params, v2.teeth)
    const off = incisalOffsetForDisplay(getState().project, v2, layout, sz.w, sz.h, 0.92)
    if (off !== null) mutateVariant((vv) => { vv.params.incisalOffset = +off.toFixed(2) })
  }
  fitArcToLip(true)
  toast('Desenho automático aplicado: linha média, plano incisal, largura e arco do sorriso.', 'ok')
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
