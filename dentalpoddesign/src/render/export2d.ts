import type { Project, Variant } from '../core/types'
import { getEngine } from './engine'
import { getPhotoBitmap } from '../store/store'

export function renderVariant(project: Project, variant: Variant, scale: number, teeth = true): HTMLCanvasElement | null {
  const b = getPhotoBitmap(project.basePhotoId)
  if (!b) return null
  const c = document.createElement('canvas')
  getEngine().composite(c, b, project, variant, { scale, showTeeth: teeth })
  return c
}

export const canvasBlob = (c: HTMLCanvasElement, type = 'image/png', q = 0.92) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('falha ao exportar imagem'))), type, q))

/** Colagem antes/depois lado a lado com legenda. */
export function beforeAfterCanvas(project: Project, variant: Variant, scale: number): HTMLCanvasElement | null {
  const b = getPhotoBitmap(project.basePhotoId)
  const after = renderVariant(project, variant, scale)
  if (!b || !after) return null
  const w = after.width
  const h = after.height
  const c = document.createElement('canvas')
  c.width = w * 2 + 12
  c.height = h + 40
  const g = c.getContext('2d')!
  g.fillStyle = '#0b1118'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(b, 0, 0, w, h)
  g.drawImage(after, w + 12, 0)
  g.fillStyle = '#e6edf6'
  g.font = `600 ${Math.max(14, Math.round(w / 55))}px system-ui`
  g.textAlign = 'center'
  g.fillText('ANTES', w / 2, h + 26)
  g.fillText(`DEPOIS — ${variant.name}`, w + 12 + w / 2, h + 26)
  return c
}
