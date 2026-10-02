import type { ArchFormId, ArchId } from './types'

/**
 * Curva do arco dentário no plano oclusal (x lateral, z anterior).
 * z(x) = -D · (|x|/a)^p — p controla a forma (cônico < ovoide < quadrado).
 * A curva passa pelo centro da borda incisal / mesa oclusal de cada dente.
 */
export interface ArchCurve {
  /** posição e tangente em arco s (mm) a partir da linha média, lado +x */
  at(s: number): { x: number; z: number; tx: number; tz: number }
  /** arco s correspondente a um x (lado +x) */
  sForX(x: number): number
  readonly a: number
  readonly D: number
  readonly p: number
}

const FORM_P: Record<ArchFormId, number> = { tapered: 2.35, ovoid: 3.0, square: 4.0 }

export function makeArch(arch: ArchId, form: ArchFormId, widthScale = 1, depthScale = 1): ArchCurve {
  const a = (arch === 'upper' ? 25 : 22.5) * widthScale
  const D = (arch === 'upper' ? 28 : 25) * depthScale
  const p = FORM_P[form]
  const xMax = a * 1.6
  const N = 3200
  const X = new Float64Array(N + 1)
  const Z = new Float64Array(N + 1)
  const S = new Float64Array(N + 1)
  for (let i = 0; i <= N; i++) {
    const x = (xMax * i) / N
    X[i] = x
    Z[i] = -D * Math.pow(x / a, p)
    if (i > 0) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1])
  }
  const idxForS = (s: number) => {
    let lo = 0
    let hi = N
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (S[m] <= s) lo = m
      else hi = m
    }
    return lo
  }
  return {
    a,
    D,
    p,
    at(s) {
      const i = idxForS(Math.max(0, s))
      const f = S[i + 1] > S[i] ? (s - S[i]) / (S[i + 1] - S[i]) : 0
      const j = Math.min(N, i + 1)
      const x = X[i] + (X[j] - X[i]) * f
      const z = Z[i] + (Z[j] - Z[i]) * f
      // tangente por diferença finita local
      const i0 = Math.max(0, i - 2)
      const i1 = Math.min(N, i + 3)
      let tx = X[i1] - X[i0]
      let tz = Z[i1] - Z[i0]
      const l = Math.hypot(tx, tz) || 1
      tx /= l
      tz /= l
      return { x, z, tx, tz }
    },
    sForX(x) {
      if (x <= 0) return 0
      const f = Math.min(1, x / xMax)
      const i = Math.min(N - 1, Math.floor(f * N))
      const fr = (x - X[i]) / (X[i + 1] - X[i])
      return S[i] + (S[i + 1] - S[i]) * fr
    },
  }
}
