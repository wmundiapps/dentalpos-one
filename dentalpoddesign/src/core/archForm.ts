import type { ArchFormId, ArchId } from './types'

/**
 * Curva do arco dentário no plano oclusal (x lateral, z anterior), passando pelo centro da borda incisal /
 * mesa oclusal de cada dente.
 *
 * Superior: quarto de superelipse (n define cônico/ovoide/quadrado) que, após o 1º molar, **arredonda levemente
 * para dentro** (convergência posterior discreta).
 * Inferior: anterior arredondado (elipse) e posterior **retilíneo** (reta tangente, sem lingualizar o arco nos molares).
 */
export interface ArchCurve {
  /** posição e tangente em arco s (mm) a partir da linha média, lado +x */
  at(s: number): { x: number; z: number; tx: number; tz: number }
  /** arco s correspondente a um x (lado +x, trecho anterior monotônico) */
  sForX(x: number): number
  readonly a: number
  readonly D: number
  readonly n: number
}

const FORM_N: Record<ArchId, Record<ArchFormId, number>> = {
  upper: { tapered: 1.85, ovoid: 2.15, square: 2.9 },
  lower: { tapered: 1.8, ovoid: 2.05, square: 2.6 },
}

export function makeArch(arch: ArchId, form: ArchFormId, widthScale = 1, depthScale = 1): ArchCurve {
  const a = (arch === 'upper' ? 25 : 22.2) * widthScale
  const D = (arch === 'upper' ? 28 : 25) * depthScale
  const n = FORM_N[arch][form]
  const e = 2 / n
  const X: number[] = []
  const Z: number[] = []
  const pt = (th: number) => {
    const s = Math.sin(th)
    const c = Math.cos(th)
    const sx = Math.pow(Math.abs(s), e)
    const cz = Math.sign(c) * Math.pow(Math.abs(c), e)
    return [a * sx, -D * (1 - cz)] as const
  }
  const half = Math.PI / 2
  if (arch === 'upper') {
    const thMax = half + 0.72 // arredondamento posterior leve
    const N = 3000
    for (let i = 0; i <= N; i++) {
      const [x, z] = pt((thMax * i) / N)
      X.push(x)
      Z.push(z)
    }
  } else {
    const th0 = half - 0.18 // acima disso o arco segue reto
    const N = 2400
    for (let i = 0; i <= N; i++) {
      const [x, z] = pt((th0 * i) / N)
      X.push(x)
      Z.push(z)
    }
    const k = X.length
    const tx = X[k - 1] - X[k - 21]
    const tz = Z[k - 1] - Z[k - 21]
    const l = Math.hypot(tx, tz) || 1
    for (let i = 1; i <= 800; i++) {
      X.push(X[k - 1] + (tx / l) * i * 0.06)
      Z.push(Z[k - 1] + (tz / l) * i * 0.06)
    }
  }
  const N = X.length - 1
  const S = new Float64Array(N + 1)
  for (let i = 1; i <= N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1])
  // fim do trecho em que x cresce (para sForX)
  let mono = N
  for (let i = 1; i <= N; i++)
    if (X[i] < X[i - 1] - 1e-9) {
      mono = i - 1
      break
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
    n,
    at(s) {
      const i = Math.min(N - 1, idxForS(Math.max(0, s)))
      const f = S[i + 1] > S[i] ? (s - S[i]) / (S[i + 1] - S[i]) : 0
      const x = X[i] + (X[i + 1] - X[i]) * f
      const z = Z[i] + (Z[i + 1] - Z[i]) * f
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
      let lo = 0
      let hi = mono
      if (x >= X[hi]) return S[hi]
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1
        if (X[m] <= x) lo = m
        else hi = m
      }
      const fr = (x - X[lo]) / (X[hi] - X[lo] || 1)
      return S[lo] + (S[hi] - S[lo]) * fr
    },
  }
}
