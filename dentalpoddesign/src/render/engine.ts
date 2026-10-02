import { OverlayEngine } from './overlay'

let eng: OverlayEngine | null = null
/** Motor de renderização compartilhado (um único contexto WebGL para o overlay fotográfico). */
export function getEngine(): OverlayEngine {
  if (!eng) eng = new OverlayEngine()
  return eng
}
