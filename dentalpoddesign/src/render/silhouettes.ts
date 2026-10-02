import type { Pt } from '../core/types'
import { QUALITY, buildCrown, frontalSilhouette, type CrownSpec } from '../geometry/toothMesh'

const cache = new Map<string, Pt[]>()

/** Silhueta frontal local (mm) do dente, com cache por especificação. */
export function silhouetteOf(spec: CrownSpec): Pt[] {
  const k = JSON.stringify({ ...spec, colors: undefined })
  let s = cache.get(k)
  if (!s) {
    const { mesh } = buildCrown(spec, QUALITY.preview)
    s = frontalSilhouette(mesh).map(([x, y]) => ({ x, y }))
    cache.set(k, s)
    if (cache.size > 600) cache.delete(cache.keys().next().value as string)
  }
  return s
}
