import * as THREE from 'three'
import type { DenturePlan } from '../core/types'
import { clamp, lerp, smoothstep } from '../core/math'
import type { Layout, ToothPlacement } from '../core/designEngine'
import type { ArchCurve } from '../core/archForm'
import { MeshBuilder, orientMesh, type Mesh } from './mesh'
import { QUALITY, crownGrid } from './toothMesh'

export interface NamedMesh {
  name: string
  kind: 'tooth' | 'base' | 'clasp' | 'connector' | 'shell' | 'model'
  fdi?: number
  mesh: Mesh
  color: string
}

// ---------------------------------------------------------------------------------------------------------------
// Laje genérica (superfícies A e B + bordas arredondadas) — sempre fechada (watertight).
// ---------------------------------------------------------------------------------------------------------------
interface SlabSpec {
  nI: number
  nR: number
  wrap: boolean
  collapse0: boolean
  A: (i: number, r: number) => [number, number, number]
  B: (i: number, r: number) => [number, number, number]
  roll?: number // mm de abaulamento da borda externa
}

function slab(sp: SlabSpec): Mesh {
  const mb = new MeshBuilder()
  const { nI, nR, wrap, collapse0 } = sp
  const idxA: number[][] = []
  const idxB: number[][] = []
  let aC = -1
  let bC = -1
  for (let i = 0; i < nI; i++) {
    const ra: number[] = []
    const rb: number[] = []
    for (let r = 0; r <= nR; r++) {
      if (collapse0 && r === 0) {
        if (aC < 0) {
          const p = sp.A(0, 0)
          const q = sp.B(0, 0)
          aC = mb.v(p[0], p[1], p[2])
          bC = mb.v(q[0], q[1], q[2])
        }
        ra.push(aC)
        rb.push(bC)
      } else {
        const p = sp.A(i, r)
        const q = sp.B(i, r)
        ra.push(mb.v(p[0], p[1], p[2]))
        rb.push(mb.v(q[0], q[1], q[2]))
      }
    }
    idxA.push(ra)
    idxB.push(rb)
  }
  const iMax = wrap ? nI : nI - 1
  for (let i = 0; i < iMax; i++) {
    const i1 = (i + 1) % nI
    for (let r = 0; r < nR; r++) {
      const a00 = idxA[i][r], a10 = idxA[i1][r], a11 = idxA[i1][r + 1], a01 = idxA[i][r + 1]
      const b00 = idxB[i][r], b10 = idxB[i1][r], b11 = idxB[i1][r + 1], b01 = idxB[i][r + 1]
      if (a00 !== a10) mb.tri(a00, a10, a11)
      mb.tri(a00, a11, a01)
      if (b00 !== b10) mb.tri(b00, b11, b10)
      mb.tri(b00, b01, b11)
    }
  }
  // fitas de borda -------------------------------------------------------------------------------------------
  const ribbon = (aList: number[], bList: number[], rows: number[][], reverse: boolean) => {
    // aList/bList: vértices ao longo da borda; rows: linhas intermediárias (de A para B)
    const chain: number[][] = [aList, ...rows, bList]
    for (let c = 0; c < chain.length - 1; c++) {
      const U = chain[c]
      const V = chain[c + 1]
      for (let k = 0; k < U.length - 1; k++) {
        if (!reverse) {
          mb.tri(U[k], U[k + 1], V[k + 1])
          mb.tri(U[k], V[k + 1], V[k])
        } else {
          mb.tri(U[k + 1], U[k], V[k])
          mb.tri(U[k + 1], V[k], V[k + 1])
        }
      }
    }
  }
  const mkRows = (aList: number[], bList: number[], outDirs: Array<[number, number]> | null) => {
    const rows: number[][] = []
    const n = sp.roll && outDirs ? 3 : 0
    for (let f = 1; f <= n; f++) {
      const t = f / (n + 1)
      const row: number[] = []
      for (let k = 0; k < aList.length; k++) {
        if (wrap && k === aList.length - 1) {
          row.push(row[0])
          continue
        }
        const pa = [mb.pos[aList[k] * 3], mb.pos[aList[k] * 3 + 1], mb.pos[aList[k] * 3 + 2]]
        const pb = [mb.pos[bList[k] * 3], mb.pos[bList[k] * 3 + 1], mb.pos[bList[k] * 3 + 2]]
        const bulge = (sp.roll as number) * Math.sin(Math.PI * t)
        const d = outDirs![k]
        row.push(mb.v(lerp(pa[0], pb[0], t) + d[0] * bulge, lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t) + d[1] * bulge))
      }
      rows.push(row)
    }
    return rows
  }
  // borda externa r = nR: A percorrida em +i
  {
    const aL: number[] = []
    const bL: number[] = []
    const dirs: Array<[number, number]> = []
    const count = wrap ? nI + 1 : nI
    for (let k = 0; k < count; k++) {
      const i = k % nI
      aL.push(idxA[i][nR])
      bL.push(idxB[i][nR])
      const p = sp.A(i, nR)
      const q = sp.A(i, nR - 1)
      const dx = p[0] - q[0]
      const dz = p[2] - q[2]
      const l = Math.hypot(dx, dz) || 1
      dirs.push([dx / l, dz / l])
    }
    // quando wrap, o último vértice repete o primeiro (mesmo índice) — fita fecha o laço
    ribbon(aL, bL, mkRows(aL, bL, dirs), false)
  }
  if (!collapse0) {
    const aL: number[] = []
    const bL: number[] = []
    const count = wrap ? nI + 1 : nI
    for (let k = 0; k < count; k++) {
      const i = k % nI
      aL.push(idxA[i][0])
      bL.push(idxB[i][0])
    }
    const dirs: Array<[number, number]> = aL.map((_, k) => {
      const i = k % nI
      const p = sp.A(i, 0)
      const q = sp.A(i, 1)
      const dx = p[0] - q[0]
      const dz = p[2] - q[2]
      const l = Math.hypot(dx, dz) || 1
      return [dx / l, dz / l]
    })
    ribbon(aL, bL, mkRows(aL, bL, dirs), true)
  }
  if (!wrap) {
    const aL0: number[] = []
    const bL0: number[] = []
    const aL1: number[] = []
    const bL1: number[] = []
    for (let r = 0; r <= nR; r++) {
      aL0.push(idxA[0][r])
      bL0.push(idxB[0][r])
      aL1.push(idxA[nI - 1][r])
      bL1.push(idxB[nI - 1][r])
    }
    ribbon(aL0, bL0, [], false)
    ribbon(aL1, bL1, [], true)
  }
  return orientMesh(mb.build())
}

// ---------------------------------------------------------------------------------------------------------------
// Estações ao longo do arco
// ---------------------------------------------------------------------------------------------------------------
interface NeckInfo {
  s: number // arco assinado do centro
  w: number
  yN: number
  back: number // deslocamento do centro do colo em relação à curva (ao longo da normal)
  blNeck: number
  designed: boolean // dente de prótese removível
  natural: boolean
}

interface Station {
  s: number
  x: number
  z: number
  nx: number
  nz: number
  yN: number
  back: number
  blNeck: number
  designed: boolean
  pap: number
}

function neckZ(pl: ToothPlacement) {
  const c = pl.spec.cls
  return c === 'incisor' || c === 'canine' ? -0.12 * pl.spec.BL : -0.02 * pl.spec.BL
}

function neckInfos(layout: Layout, arch: 'upper' | 'lower', curve: ArchCurve): NeckInfo[] {
  const list = arch === 'upper' ? layout.upper : layout.lower
  const out: NeckInfo[] = []
  for (const t of list) {
    const v = new THREE.Vector3(0, -t.spec.H, neckZ(t)).applyMatrix4(t.matrix)
    const c = curve.at(t.sMid)
    const nrm = t.side > 0 ? [-c.tz, c.tx] : [c.tz, c.tx]
    const back = (v.x - t.side * c.x) * nrm[0] + (v.z - c.z) * nrm[1]
    out.push({
      s: t.side * t.sMid,
      w: t.widthArc,
      yN: v.y,
      back,
      blNeck: t.spec.BL * 0.72,
      designed: t.cfg.status === 'denture',
      natural: t.cfg.status === 'natural',
    })
  }
  return out.sort((a, b) => a.s - b.s)
}

function interp(infos: NeckInfo[], s: number, key: 'yN' | 'back' | 'blNeck'): number {
  if (!infos.length) return 0
  if (s <= infos[0].s) return infos[0][key]
  if (s >= infos[infos.length - 1].s) return infos[infos.length - 1][key]
  for (let i = 0; i < infos.length - 1; i++) {
    if (s >= infos[i].s && s <= infos[i + 1].s) {
      const t = (s - infos[i].s) / (infos[i + 1].s - infos[i].s || 1)
      return lerp(infos[i][key], infos[i + 1][key], t)
    }
  }
  return infos[0][key]
}

function toothAt(infos: NeckInfo[], s: number): NeckInfo | null {
  for (const n of infos) if (Math.abs(s - n.s) <= n.w / 2 + 1e-6) return n
  return null
}

function stationsAlong(infos: NeckInfo[], curve: ArchCurve, sA: number, sB: number, n: number): Station[] {
  const out: Station[] = []
  for (let k = 0; k < n; k++) {
    const s = lerp(sA, sB, n === 1 ? 0 : k / (n - 1))
    const side = s < 0 ? -1 : 1
    const c = curve.at(Math.abs(s))
    const nx = side > 0 ? -c.tz : c.tz
    const nz = c.tx
    const th = toothAt(infos, s)
    let pap = 0
    if (th) {
      const f = (s - (th.s - th.w / 2)) / th.w
      pap = 0.5 + 0.5 * Math.cos(2 * Math.PI * f)
    }
    out.push({
      s,
      x: side * c.x,
      z: c.z,
      nx,
      nz,
      yN: interp(infos, s, 'yN'),
      back: interp(infos, s, 'back'),
      blNeck: interp(infos, s, 'blNeck'),
      designed: th ? th.designed : infos.some((i) => i.designed && Math.abs(i.s - s) < i.w),
      pap,
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Faixa (sela / barra / ferradura)
// ---------------------------------------------------------------------------------------------------------------
interface StripOpts {
  dirY: 1 | -1
  offIn: number // mm a partir do centro do colo (negativo = lingual)
  offOut: number
  baseT: number
  flangeOut: number // espessura nas bordas (altura do flange)
  flangeIn: number
  yShift: number // deslocamento do plano de assentamento em relação ao colo (mm)
  festoon: number
  nR?: number
  neckOut?: boolean // borda labial rente à face vestibular do dente (colar gengival)
  lean?: number // inclinação (mm) da face externa do flange com a altura
}

function stripSlab(st: Station[], o: StripOpts): Mesh {
  const nR = o.nR ?? 12
  const lean = o.lean ?? 0
  const point = (i: number, r: number) => {
    const s = st[i]
    const rho = r / nR
    const offOut = o.neckOut ? s.blNeck / 2 + 0.5 : o.offOut
    const off = lerp(o.offIn, offOut, rho)
    const pap = o.festoon * s.pap * smoothstep(0.7, 1, rho)
    const yA = s.yN - o.dirY * (1.8 - o.yShift) - o.dirY * pap
    const eOut = smoothstep(0.72, 1, rho)
    const eIn = smoothstep(0.28, 0, rho)
    const thick = o.baseT + (o.flangeOut - o.baseT) * eOut + (o.flangeIn - o.baseT) * eIn
    const offB = off + lean * eOut - lean * 0.6 * eIn
    return {
      xA: s.x + s.nx * (s.back + off),
      zA: s.z + s.nz * (s.back + off),
      xB: s.x + s.nx * (s.back + offB),
      zB: s.z + s.nz * (s.back + offB),
      yA,
      yB: yA + o.dirY * Math.max(0.8, thick),
    }
  }
  return slab({
    nI: st.length,
    nR,
    wrap: false,
    collapse0: false,
    A: (i, r) => {
      const p = point(i, r)
      return [p.xA, p.yA, p.zA]
    },
    B: (i, r) => {
      const p = point(i, r)
      return [p.xB, p.yB, p.zB]
    },
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Placa palatina (superior completa / parcial com placa): laje polar fechada
// ---------------------------------------------------------------------------------------------------------------
function palatePlate(infos: NeckInfo[], curve: ArchCurve, plan: DenturePlan, S: number): Mesh {
  const nFront = 72
  const stFront = stationsAlong(infos, curve, -S, S, nFront)
  // contorno externo
  interface B {
    x: number
    z: number
    yN: number
    pap: number
    fl: number
  }
  const loop: B[] = []
  const labial = 0.5 // mm além da face vestibular no colo
  for (const s of stFront) {
    const off = s.designed ? s.blNeck / 2 + labial + 0.6 : -(s.blNeck / 2 + 1.0)
    loop.push({ x: s.x + s.nx * (s.back + off), z: s.z + s.nz * (s.back + off), yN: s.yN, pap: s.pap, fl: s.designed ? plan.flangeHeight : 3.2 })
  }
  // suaviza os offsets (média móvel) para transições graduais entre sela e dente natural
  const sm = loop.map((b) => ({ ...b }))
  for (let k = 0; k < loop.length; k++) {
    let ax = 0, az = 0, af = 0, c = 0
    for (let d = -2; d <= 2; d++) {
      const q = loop[clamp(k + d, 0, loop.length - 1)]
      ax += q.x; az += q.z; af += q.fl; c++
    }
    sm[k].x = ax / c
    sm[k].z = az / c
    sm[k].fl = af / c
  }
  const first = sm[0]
  const last = sm[sm.length - 1]
  const K = 16
  const closure: B[] = []
  for (let k = 1; k < K; k++) {
    const t = k / K
    closure.push({
      x: lerp(last.x, first.x, t),
      z: lerp(last.z, first.z, t) - 6 * Math.sin(Math.PI * t) - 1.5,
      yN: lerp(last.yN, first.yN, t),
      pap: 0,
      fl: 3.2,
    })
  }
  const ring: B[] = [...sm, ...closure]
  let cxm = 0, czm = 0
  for (const b of ring) {
    cxm += b.x
    czm += b.z
  }
  const C = { x: cxm / ring.length, z: czm / ring.length }
  const nI = ring.length
  const nR = 16
  const V = 9
  let ax = 0, az = 0
  for (const b of ring) {
    ax = Math.max(ax, Math.abs(b.x - C.x))
    az = Math.max(az, Math.abs(b.z - C.z))
  }
  const point = (i: number, r: number) => {
    const b = ring[i]
    const rho = r / nR
    const x = C.x + (b.x - C.x) * rho
    const z = C.z + (b.z - C.z) * rho
    const pap = plan.festoon * b.pap * smoothstep(0.85, 1, rho)
    const yN = b.yN - 1.8 - pap
    // cúpula suave em função da posição (elipse do contorno), sem vinco radial
    const u = Math.min(1, Math.hypot((x - C.x) / (ax || 1), (z - C.z) / (az || 1)))
    const vault = V * (1 - Math.pow(u, 2.2)) * (1 - smoothstep(0.82, 1, rho))
    const yA = yN + vault
    const thick = plan.baseThickness + (b.fl - plan.baseThickness) * smoothstep(0.76, 1, rho)
    // flange inclinada para fora com a altura
    const dx = b.x - C.x
    const dz = b.z - C.z
    const dl = Math.hypot(dx, dz) || 1
    const lean = (b.fl > 5 ? 2.6 : 0.6) * smoothstep(0.76, 1, rho)
    return { x, z, xB: x + (dx / dl) * lean, zB: z + (dz / dl) * lean, yA, yB: yA + Math.max(0.8, thick) }
  }
  return slab({
    nI,
    nR,
    wrap: true,
    collapse0: true,
    roll: 0.9,
    A: (i, r) => {
      const p = point(i, r)
      return [p.x, p.yA, p.z]
    },
    B: (i, r) => {
      const p = point(i, r)
      return [p.xB, p.yB, p.zB]
    },
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Tubo (grampos)
// ---------------------------------------------------------------------------------------------------------------
function tube(path: THREE.Vector3[], radii: number[], sides = 10): Mesh {
  const mb = new MeshBuilder()
  const n = path.length
  const rings: number[][] = []
  const tang = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(n - 1, i + 1)]
    return b.clone().sub(a).normalize()
  })
  let nrm = new THREE.Vector3(0, 1, 0)
  if (Math.abs(tang[0].dot(nrm)) > 0.9) nrm = new THREE.Vector3(1, 0, 0)
  nrm = nrm.sub(tang[0].clone().multiplyScalar(nrm.dot(tang[0]))).normalize()
  for (let i = 0; i < n; i++) {
    nrm = nrm.sub(tang[i].clone().multiplyScalar(nrm.dot(tang[i]))).normalize()
    const bin = new THREE.Vector3().crossVectors(tang[i], nrm).normalize()
    const ring: number[] = []
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2
      const p = path[i].clone().addScaledVector(nrm, Math.cos(a) * radii[i]).addScaledVector(bin, Math.sin(a) * radii[i])
      ring.push(mb.v(p.x, p.y, p.z))
    }
    rings.push(ring)
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides
      mb.tri(rings[i][k], rings[i][k1], rings[i + 1][k1])
      mb.tri(rings[i][k], rings[i + 1][k1], rings[i + 1][k])
    }
  }
  const c0 = mb.v(path[0].x, path[0].y, path[0].z)
  const c1 = mb.v(path[n - 1].x, path[n - 1].y, path[n - 1].z)
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides
    mb.tri(c0, rings[0][k1], rings[0][k])
    mb.tri(c1, rings[n - 1][k], rings[n - 1][k1])
  }
  return orientMesh(mb.build())
}

function claspFor(t: ToothPlacement, saddleDistal: boolean, wire = 0.65): Mesh {
  const q = QUALITY.draft
  const grid = crownGrid(t.spec, q)
  const nPhi = grid.nPhi
  const rowAt = (frac: number) => grid.rows[grid.bodyStart + Math.round(frac * (q.nBody))]
  const toArch = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz).applyMatrix4(t.matrix)
  const mid = rowAt(0.3)
  const low = rowAt(0.05)
  const stepDeg = 360 / nPhi
  // colunas ao redor da face vestibular: φ = 90° é vestibular; distal = 0°
  const startDeg = saddleDistal ? 0 : 180
  const dir = saddleDistal ? 1 : -1
  const pts: THREE.Vector3[] = []
  const rowPoint = (row: typeof mid, deg: number, out: number) => {
    const i = ((Math.round(deg / stepDeg) % nPhi) + nPhi) % nPhi
    const cx = row.center[0]
    const cz = row.center[2]
    let dx = row.pts[i * 3] - cx
    let dz = row.pts[i * 3 + 2] - cz
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    return toArch(row.pts[i * 3] + dx * out, row.pts[i * 3 + 1], row.pts[i * 3 + 2] + dz * out)
  }
  pts.push(rowPoint(low, startDeg, 0.1))
  pts.push(rowPoint(rowAt(0.16), startDeg, wire * 0.9))
  const span = 120
  const nArc = 14
  for (let k = 0; k <= nArc; k++) pts.push(rowPoint(mid, startDeg + dir * (span * k) / nArc, wire * 0.85))
  const radii = pts.map((_, i) => lerp(wire * 1.0, wire * 0.55, smoothstep(2, pts.length - 1, i)))
  return tube(pts, radii, 10)
}

// ---------------------------------------------------------------------------------------------------------------
// Dentadura (bases + conectores + grampos)
// ---------------------------------------------------------------------------------------------------------------
export function buildDenture(layout: Layout, plan: DenturePlan): NamedMesh[] {
  const out: NamedMesh[] = []
  for (const arch of ['upper', 'lower'] as const) {
    const list = arch === 'upper' ? layout.upper : layout.lower
    if (!list.length) continue
    const curve = arch === 'upper' ? layout.archUpper : layout.archLower
    const designed = list.filter((t) => t.cfg.status === 'denture')
    if (!designed.length) continue
    const infos = neckInfos(layout, arch, curve)
    const maxS = Math.max(...infos.map((i) => Math.abs(i.s) + i.w / 2))
    const dirY: 1 | -1 = arch === 'upper' ? 1 : -1
    const complete = list.every((t) => t.cfg.status === 'denture')
    const label = arch === 'upper' ? 'superior' : 'inferior'

    if (complete) {
      if (arch === 'upper') {
        out.push({ name: `base-${label}`, kind: 'base', mesh: palatePlate(infos, curve, plan, maxS), color: plan.baseColor })
      } else {
        const st = stationsAlong(infos, curve, -maxS, maxS, 72)
        out.push({
          name: `base-${label}`,
          kind: 'base',
          mesh: stripSlab(st, { dirY, offIn: -9.5, offOut: 5.2, neckOut: true, lean: 3.0, baseT: plan.baseThickness + 2.2, flangeOut: plan.flangeHeight * 0.85, flangeIn: plan.flangeHeight * 1.1, yShift: 0, festoon: plan.festoon }),
          color: plan.baseColor,
        })
      }
      continue
    }

    // parcial: grupos contíguos de dentes de prótese
    const ordered = [...list].sort((a, b) => a.side * a.sMid - b.side * b.sMid)
    const groups: ToothPlacement[][] = []
    let cur: ToothPlacement[] = []
    for (const t of ordered) {
      if (t.cfg.status === 'denture') cur.push(t)
      else if (cur.length) {
        groups.push(cur)
        cur = []
      }
    }
    if (cur.length) groups.push(cur)
    let gi = 0
    for (const g of groups) {
      gi++
      const sA = Math.min(...g.map((t) => t.side * t.sMid - t.widthArc / 2)) - 0.8
      const sB = Math.max(...g.map((t) => t.side * t.sMid + t.widthArc / 2)) + 0.8
      const n = Math.max(8, Math.round((sB - sA) * 2.2))
      const st = stationsAlong(infos, curve, sA, sB, n)
      const lingual = arch === 'upper' ? -(plan.palatal === 'plate' ? 3 : 8.5) : -8.5
      out.push({
        name: `sela-${label}-${gi}`,
        kind: 'base',
        mesh: stripSlab(st, { dirY, offIn: lingual, offOut: 5.0, neckOut: true, lean: 2.8, baseT: plan.baseThickness + 0.6, flangeOut: plan.flangeHeight * 0.8, flangeIn: plan.flangeHeight * 0.55, yShift: 0, festoon: plan.festoon }),
        color: plan.baseColor,
      })
      if (plan.clasps) {
        const first = g[0]
        const lastT = g[g.length - 1]
        const ia = ordered.indexOf(first)
        const ib = ordered.indexOf(lastT)
        const before = ordered[ia - 1]
        const after = ordered[ib + 1]
        // abutment antes da sela: sela fica em direção a +s
        if (before && before.cfg.status === 'natural' && before.n >= 2) out.push({ name: `grampo-${before.fdi}`, kind: 'clasp', fdi: before.fdi, mesh: claspFor(before, before.side > 0 ? true : false), color: '#b8bcc4' })
        if (after && after.cfg.status === 'natural' && after.n >= 2) out.push({ name: `grampo-${after.fdi}`, kind: 'clasp', fdi: after.fdi, mesh: claspFor(after, after.side > 0 ? false : true), color: '#b8bcc4' })
      }
    }
    // conectores
    if (arch === 'upper' && plan.palatal === 'plate' && designed.length) {
      out.push({ name: 'placa-palatina', kind: 'connector', mesh: palatePlate(infos, curve, plan, maxS), color: plan.baseColor })
    }
    if (arch === 'upper' && plan.palatal === 'strap' && groups.length) {
      const z0 = layout.archUpper.at(layout.archUpper.sForX(16)).z
      const x0 = layout.archUpper.at(layout.archUpper.sForX(16)).x
      const yN = interp(infos, 0, 'yN')
      const stations: Station[] = []
      const N = 24
      for (let k = 0; k < N; k++) {
        const x = lerp(-x0, x0, k / (N - 1))
        stations.push({ s: 0, x, z: z0, nx: 0, nz: 1, yN: yN + 4.2, back: 0, blNeck: 6, designed: false, pap: 0 })
      }
      out.push({ name: 'barra-palatina', kind: 'connector', mesh: stripSlab(stations, { dirY: 1, offIn: -4.5, offOut: 4.5, baseT: 2.4, flangeOut: 2.8, flangeIn: 2.8, yShift: 0, festoon: 0, nR: 6 }), color: plan.baseColor })
    }
    if (arch === 'lower' && plan.lowerConnector !== 'none' && groups.length) {
      const st = stationsAlong(infos, curve, -maxS * 0.85, maxS * 0.85, 60)
      if (plan.lowerConnector === 'horseshoe') {
        out.push({ name: 'conector-ferradura', kind: 'connector', mesh: stripSlab(st, { dirY, offIn: -11, offOut: -2.8, baseT: 3, flangeOut: 4, flangeIn: plan.flangeHeight, yShift: 0, festoon: 0 }), color: plan.baseColor })
      } else {
        out.push({ name: 'barra-lingual', kind: 'connector', mesh: stripSlab(st, { dirY, offIn: -9.2, offOut: -3.6, baseT: 2.6, flangeOut: 3.4, flangeIn: 3.6, yShift: -2.6, festoon: 0, nR: 5 }), color: plan.baseColor })
      }
    }
  }
  return out
}

/** Conectores de ponte fixa entre unidades vizinhas (coroas / pônticos / implantes). */
export function bridgeConnectors(layout: Layout, thickness = 4): NamedMesh[] {
  const out: NamedMesh[] = []
  for (const list of [layout.upper, layout.lower]) {
    const ordered = [...list].sort((a, b) => a.side * a.sMid - b.side * b.sMid)
    const isFixed = (t: ToothPlacement) => t.cfg.status === 'pontic' || t.cfg.status === 'crown' || t.cfg.status === 'implant'
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]
      const b = ordered[i + 1]
      if (!isFixed(a) || !isFixed(b)) continue
      if (a.cfg.status !== 'pontic' && b.cfg.status !== 'pontic') continue
      const pa = new THREE.Vector3(0, -a.spec.H * 0.38, -0.6).applyMatrix4(a.matrix)
      const pb = new THREE.Vector3(0, -b.spec.H * 0.38, -0.6).applyMatrix4(b.matrix)
      const c = pa.clone().add(pb).multiplyScalar(0.5)
      const dirv = pb.clone().sub(pa)
      const len = dirv.length()
      const mb = new MeshBuilder()
      const ring = 12
      const rows = [-0.5, 0.5]
      const verts: number[][] = []
      const along = dirv.clone().normalize()
      let up = new THREE.Vector3(0, 1, 0)
      up = up.sub(along.clone().multiplyScalar(up.dot(along))).normalize()
      const side = new THREE.Vector3().crossVectors(along, up).normalize()
      for (const r of rows) {
        const row: number[] = []
        for (let k = 0; k < ring; k++) {
          const ang = (k / ring) * Math.PI * 2
          const p = c.clone().addScaledVector(along, r * (len + 1.2)).addScaledVector(up, Math.cos(ang) * thickness * 0.5 * 1.15).addScaledVector(side, Math.sin(ang) * thickness * 0.5)
          row.push(mb.v(p.x, p.y, p.z))
        }
        verts.push(row)
      }
      for (let k = 0; k < ring; k++) {
        const k1 = (k + 1) % ring
        mb.tri(verts[0][k], verts[0][k1], verts[1][k1])
        mb.tri(verts[0][k], verts[1][k1], verts[1][k])
      }
      const c0 = mb.v(...(c.clone().addScaledVector(along, -0.5 * (len + 1.2)).toArray() as [number, number, number]))
      const c1 = mb.v(...(c.clone().addScaledVector(along, 0.5 * (len + 1.2)).toArray() as [number, number, number]))
      for (let k = 0; k < ring; k++) {
        const k1 = (k + 1) % ring
        mb.tri(c0, verts[0][k1], verts[0][k])
        mb.tri(c1, verts[1][k], verts[1][k1])
      }
      out.push({ name: `conector-${a.fdi}-${b.fdi}`, kind: 'connector', mesh: orientMesh(mb.build()), color: '#e8dcc0' })
    }
  }
  return out
}
