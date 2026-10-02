import type { Pt } from './types'

export const DEG = Math.PI / 180
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a || 1e-9), 0, 1)
  return t * t * (3 - 2 * t)
}
export const sgn = (v: number) => (v < 0 ? -1 : 1)
export const spow = (v: number, p: number) => sgn(v) * Math.pow(Math.abs(v), p)
export const gauss = (d: number, s: number) => Math.exp(-(d * d) / (2 * s * s))
export const round = (v: number, d = 2) => {
  const k = Math.pow(10, d)
  return Math.round(v * k) / k
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const angleDeg = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x) / DEG

/** Interpola uma tabela [t, v] por spline cúbica de Hermite (tangentes por diferenças finitas). */
export function table(points: ReadonlyArray<readonly [number, number]>, t: number): number {
  const n = points.length
  if (t <= points[0][0]) return points[0][1]
  if (t >= points[n - 1][0]) return points[n - 1][1]
  let i = 0
  while (i < n - 2 && t > points[i + 1][0]) i++
  const [t0, v0] = points[i]
  const [t1, v1] = points[i + 1]
  const h = t1 - t0
  const u = (t - t0) / h
  const m0 = i > 0 ? (v1 - points[i - 1][1]) / (t1 - points[i - 1][0]) : (v1 - v0) / h
  const m1 = i < n - 2 ? (points[i + 2][1] - v0) / (points[i + 2][0] - t0) : (v1 - v0) / h
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1
  )
}

/** Catmull-Rom fechada → polilinha densa. */
export function closedSpline(pts: Pt[], samplesPerSeg = 12): Pt[] {
  const n = pts.length
  if (n < 3) return pts.slice()
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = k / samplesPerSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return out
}

/** Catmull-Rom aberta → polilinha densa. */
export function openSpline(pts: Pt[], samplesPerSeg = 12): Pt[] {
  const n = pts.length
  if (n < 3) return pts.slice()
  const out: Pt[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = k / samplesPerSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(pts[n - 1])
  return out
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function polygonArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y)
  return Math.abs(a / 2)
}

export function bbox(poly: Pt[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of poly) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }
}

/** Ajuste de parábola y = a x² + b x + c por mínimos quadrados (para arco do sorriso). */
export function fitParabola(pts: Pt[]): { a: number; b: number; c: number } {
  const n = pts.length
  if (n < 3) return { a: 0, b: 0, c: pts[0]?.y ?? 0 }
  let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0
  for (const p of pts) {
    const x = p.x
    sx += x
    sx2 += x * x
    sx3 += x * x * x
    sx4 += x * x * x * x
    sy += p.y
    sxy += x * p.y
    sx2y += x * x * p.y
  }
  // resolve sistema 3x3 por Cramer
  const M = [
    [sx4, sx3, sx2],
    [sx3, sx2, sx],
    [sx2, sx, n],
  ]
  const B = [sx2y, sxy, sy]
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(M)
  if (Math.abs(D) < 1e-9) return { a: 0, b: 0, c: sy / n }
  const rep = (col: number) => M.map((row, i) => row.map((v, j) => (j === col ? B[i] : v)))
  return { a: det(rep(0)) / D, b: det(rep(1)) / D, c: det(rep(2)) / D }
}

let _id = 0
export function uid(prefix = 'id'): string {
  _id++
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${_id}`
}

export function deepClone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T)
}

/** PRNG determinístico (mulberry32) para texturas/demos reproduzíveis. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
