import * as THREE from 'three'
import type { Project, Variant } from './types'
import { deepClone, clamp } from './math'
import { computeLayout, SMILE_ARC, SPEE_PROFILE, TIP_UP } from './designEngine'
import { archToImage, biometricSuggestion, corridorPercent, fitSmileArc, incisalOffsetForZenith, lowerLipBorder } from './analysis'
import { facialMidlineX } from '../render/overlay'
import { syncStatuses } from './project'
import { silhouetteOf } from '../render/silhouettes'
import { defaultWL } from './toothSpecs'
import { makeFdi } from './toothSpecs'

export interface AutoResult {
  variant: Variant
  notes: string[]
}

/**
 * Desenho automático "natural": aplica as regras clínicas ao caso a partir dos pontos (manuais ou da IA).
 *  - forma do dente pela forma do rosto; proporção áurea; largura do central pela biometria facial;
 *  - plano incisal paralelo à linha bipupilar e linha média coincidente com a facial;
 *  - zênite do central com gengiva levemente visível e bordos tocando levemente o lábio inferior;
 *  - arco do sorriso acompanhando o lábio inferior; curva de Spee/Wilson, off-sets artísticos;
 *  - corredor bucal reduzido (mais dentes/arco); eixo do canino apontando para a pupila.
 */
export function autoDesignVariant(project: Project, variant: Variant, w: number, h: number): AutoResult {
  const v = deepClone(variant)
  const p = v.params
  const m = project.marks
  const notes: string[] = []
  const sil = (layout: ReturnType<typeof computeLayout>) => (fdi: number) => {
    const t = layout.byFdi.get(fdi)
    return t ? silhouetteOf(t.spec) : null
  }

  // 1) forma, proporção, tamanho
  const face = project.face
  if (face) {
    const map = { square: 'square', round: 'round', oval: 'ovoid', triangular: 'triangular' } as const
    p.shape = map[face.shape]
    p.archForm = face.shape === 'square' ? 'square' : face.shape === 'triangular' ? 'tapered' : 'ovoid'
    notes.push(`Rosto ${face.label.toLowerCase()} → dentes ${p.shape}.`)
  }
  p.proportion = 'goldenNat'
  p.wl = +defaultWL(p.shape, p.age, p.sex).toFixed(2)
  const sug = biometricSuggestion(project)
  const ref = sug.fromFace ?? sug.fromNose
  if (ref) {
    p.centralWidth = +clamp(ref, 7.4, 9.8).toFixed(1)
    p.sizeSet = 'custom'
    notes.push(`Largura do central ${p.centralWidth.toFixed(1)} mm pela biometria facial.`)
  }
  p.overbite = 1.5
  p.overjet = 1.5
  p.classI = true
  p.spee = 1
  p.wilson = 1
  p.artistic = 1
  p.fullness = 0.6
  p.zenithShift = 0
  p.heightScale = 1
  p.widthScale = 1
  p.archScale = 1
  p.tipScale = 1
  p.torqueScale = 1
  p.rollOffset = 0
  p.midlineShift = 0
  p.incisalOffset = 0
  v.anchor = null
  for (const k of Object.keys(v.teeth)) {
    const t = v.teeth[+k]
    t.dx = t.dy = t.dz = t.rot = t.tip = t.torque = 0
    t.w = t.h = t.bl = 1
  }
  const layoutOf = () => computeLayout(p, v.teeth)
  const T0 = () => archToImage(project, v, w, h)

  // 2) linha média
  {
    const T = T0()
    const fx = facialMidlineX(m, T.anchor.y)
    if (fx !== null) p.midlineShift = +((fx - T.anchor.x) / T.s).toFixed(2)
  }

  // 3) altura: zênite com gengiva levemente visível; bordos tocando o lábio inferior
  for (let it = 0; it < 3; it++) {
    const lay = layoutOf()
    const off = incisalOffsetForZenith(project, v, lay, w, h, 0.7)
    if (off !== null) p.incisalOffset = +off.toFixed(2)
    if (m.lowMid) {
      const T = T0()
      const lay2 = layoutOf()
      const c = lay2.byFdi.get(21)
      if (!c) break
      const edgeImg = T.toImg(0, c.edgeY).y
      const gap = (m.lowMid.y - edgeImg) / T.s
      if (gap > 1.0) {
        const W = p.centralWidth * p.widthScale
        const Hc = W / p.wl * p.heightScale
        const target = Math.min(Hc + gap - 0.3, W / 0.72)
        p.wl = +clamp((W * p.heightScale) / target, 0.72, 0.95).toFixed(3)
        if (it === 2 && (target < Hc + gap - 0.6)) notes.push(`Os bordos incisais ficam ${(gap - (target - Hc)).toFixed(1)} mm acima do lábio inferior (limite de proporção L/A 72%).`)
      } else break
    }
  }

  // 4) arco do sorriso ao lábio inferior; Spee discreta
  {
    const lay = layoutOf()
    const fit = fitSmileArc(project, v, lay, w, h)
    if (fit) p.smileArc = +fit.smileArc.toFixed(2)
    else if (lowerLipBorder(m).length === 0) notes.push('Sem contorno labial: arco do sorriso mantido no padrão.')
  }
  // ao alterar o arco, os centrais continuam fixos (arco = 0 no central)

  // 5) corredor bucal: mais dentes posteriores e/ou arco um pouco mais largo
  for (const up of [5, 6, 7]) {
    p.upperTo = Math.max(p.upperTo, up)
    syncStatuses(v)
    const lay = layoutOf()
    const cor = corridorPercent(project, lay, sil(lay))
    if (cor === null || cor <= 15) break
  }
  for (let k = 0; k < 4; k++) {
    const lay = layoutOf()
    const cor = corridorPercent(project, lay, sil(lay))
    if (cor === null || cor <= 15) break
    p.archScale = +(p.archScale + 0.02).toFixed(2)
  }
  {
    const lay = layoutOf()
    const cor = corridorPercent(project, lay, sil(lay))
    if (cor !== null) notes.push(`Corredor bucal ${cor.toFixed(0)}%.`)
  }
  void SMILE_ARC
  void SPEE_PROFILE

  // 6) eixo do canino aponta para a pupila
  if (m.pupilR && m.pupilL) {
    const T = T0()
    const lay = layoutOf()
    for (const side of [-1, 1] as const) {
      const t = lay.byFdi.get(makeFdi('upper', side, 3))
      if (!t) continue
      const pup = side > 0 ? (m.pupilL.x > m.pupilR.x ? m.pupilL : m.pupilR) : m.pupilL.x > m.pupilR.x ? m.pupilR : m.pupilL
      const P = T.toArch(pup.x, pup.y)
      const edge = t.position
      const cerv = new THREE.Vector3(0, -t.spec.H, 0).applyMatrix4(t.matrix)
      const axis = Math.atan2(cerv.x - edge.x, cerv.y - edge.y)
      const toPraw = Math.atan2(P.x - edge.x, P.y - edge.y)
      const lim = (12 * Math.PI) / 180 // inclinação fisiológica máxima do eixo do canino
      const toP = Math.sign(toPraw) * Math.min(Math.abs(toPraw), lim)
      const delta = (((toP - axis) * 180) / Math.PI) * side
      const cfg = v.teeth[t.fdi]
      const base = TIP_UP[2] * p.tipScale
      cfg.tip = +clamp(delta, -base, 6).toFixed(1)
    }
  }
  return { variant: v, notes }
}
