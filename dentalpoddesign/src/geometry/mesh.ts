import * as THREE from 'three'

/** Malha triangular indexada. Unidades em mm. Orientação anti-horária = face externa. */
export interface Mesh {
  positions: Float32Array
  indices: Uint32Array
  normals?: Float32Array
  colors?: Float32Array
  uvs?: Float32Array
  alphas?: Float32Array
}

export class MeshBuilder {
  pos: number[] = []
  idx: number[] = []
  col: number[] = []
  uv: number[] = []
  hasColor = false
  hasUv = false

  get count() {
    return this.pos.length / 3
  }

  v(x: number, y: number, z: number, r?: number, g?: number, b?: number, u?: number, w?: number): number {
    const i = this.pos.length / 3
    this.pos.push(x, y, z)
    if (r !== undefined) {
      this.hasColor = true
      this.col.push(r, g as number, b as number)
    } else if (this.hasColor) this.col.push(1, 1, 1)
    if (u !== undefined) {
      this.hasUv = true
      this.uv.push(u, w as number)
    } else if (this.hasUv) this.uv.push(0, 0)
    return i
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c)
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d)
  }

  build(): Mesh {
    const m: Mesh = { positions: new Float32Array(this.pos), indices: new Uint32Array(this.idx) }
    if (this.hasColor && this.col.length === this.pos.length) m.colors = new Float32Array(this.col)
    if (this.hasUv && this.uv.length === (this.pos.length / 3) * 2) m.uvs = new Float32Array(this.uv)
    return m
  }
}

export function computeNormals(m: Mesh): Float32Array {
  const p = m.positions
  const n = new Float32Array(p.length)
  const ix = m.indices
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3
    const b = ix[t + 1] * 3
    const c = ix[t + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    // normal ponderada pela área (produto vetorial não normalizado)
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l
  }
  return n
}

export function flipWinding(m: Mesh): Mesh {
  const ix = new Uint32Array(m.indices)
  for (let t = 0; t < ix.length; t += 3) {
    const tmp = ix[t + 1]
    ix[t + 1] = ix[t + 2]
    ix[t + 2] = tmp
  }
  return { ...m, indices: ix, normals: undefined }
}

export function transformMesh(m: Mesh, mat: THREE.Matrix4): Mesh {
  const p = new Float32Array(m.positions.length)
  const v = new THREE.Vector3()
  for (let i = 0; i < p.length; i += 3) {
    v.set(m.positions[i], m.positions[i + 1], m.positions[i + 2]).applyMatrix4(mat)
    p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z
  }
  let out: Mesh = { ...m, positions: p, normals: undefined }
  if (mat.determinant() < 0) out = flipWinding(out)
  return out
}

export function mergeMeshes(list: Mesh[]): Mesh {
  let nv = 0
  let ni = 0
  let colors = list.every((m) => m.colors)
  for (const m of list) {
    nv += m.positions.length / 3
    ni += m.indices.length
  }
  const positions = new Float32Array(nv * 3)
  const indices = new Uint32Array(ni)
  const cols = colors ? new Float32Array(nv * 3) : undefined
  let vo = 0
  let io = 0
  for (const m of list) {
    positions.set(m.positions, vo * 3)
    if (cols && m.colors) cols.set(m.colors, vo * 3)
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo
    vo += m.positions.length / 3
    io += m.indices.length
  }
  return { positions, indices, colors: cols }
}

export interface MeshStats {
  vertices: number
  triangles: number
  bbox: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] }
  volume: number // mm³ (assinado: positivo = orientação externa correta)
  area: number // mm²
  boundaryEdges: number
  nonManifoldEdges: number
  inconsistentEdges: number
  degenerateTris: number
  watertight: boolean
  nanVertices: number
}

/** Verificação topológica: cada aresta deve ser compartilhada por exatamente 2 faces com sentidos opostos. */
export function meshStats(m: Mesh): MeshStats {
  const p = m.positions
  const ix = m.indices
  let nan = 0
  const mn: [number, number, number] = [Infinity, Infinity, Infinity]
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k]
      if (!Number.isFinite(v)) {
        nan++
        continue
      }
      if (v < mn[k]) mn[k] = v
      if (v > mx[k]) mx[k] = v
    }
  }
  const edges = new Map<number, number>() // chave a*N+b -> contagem direcional
  const N = p.length / 3
  let vol = 0
  let area = 0
  let degenerate = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t], b = ix[t + 1], c = ix[t + 2]
    if (a === b || b === c || a === c) {
      degenerate++
      continue
    }
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2]
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2]
    const cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const ar = 0.5 * Math.hypot(nx, ny, nz)
    area += ar
    if (ar < 1e-9) degenerate++
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = u * N + v
      edges.set(key, (edges.get(key) || 0) + 1)
    }
  }
  let boundary = 0
  let nonManifold = 0
  let inconsistent = 0
  for (const [key, cnt] of edges) {
    const u = Math.floor(key / N)
    const v = key - u * N
    const opp = edges.get(v * N + u) || 0
    if (cnt > 1) inconsistent++ // mesma direção usada 2x
    if (opp === 0) boundary++
    else if (opp > 1 || cnt > 1) nonManifold++
  }
  return {
    vertices: N,
    triangles: ix.length / 3,
    bbox: { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] },
    volume: vol,
    area,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    inconsistentEdges: inconsistent,
    degenerateTris: degenerate,
    watertight: boundary === 0 && nonManifold === 0 && inconsistent === 0 && nan === 0,
    nanVertices: nan,
  }
}

/** Solda vértices coincidentes (tolerância em mm). */
export function weld(m: Mesh, tol = 1e-4): Mesh {
  const map = new Map<string, number>()
  const remap = new Uint32Array(m.positions.length / 3)
  const pos: number[] = []
  const inv = 1 / tol
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(m.positions[i * 3] * inv)},${Math.round(m.positions[i * 3 + 1] * inv)},${Math.round(m.positions[i * 3 + 2] * inv)}`
    let id = map.get(k)
    if (id === undefined) {
      id = pos.length / 3
      map.set(k, id)
      pos.push(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2])
    }
    remap[i] = id
  }
  const idx: number[] = []
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = remap[m.indices[t]], b = remap[m.indices[t + 1]], c = remap[m.indices[t + 2]]
    if (a !== b && b !== c && a !== c) idx.push(a, b, c)
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

export function translateMesh(m: Mesh, x: number, y: number, z: number): Mesh {
  const p = new Float32Array(m.positions)
  for (let i = 0; i < p.length; i += 3) {
    p[i] += x
    p[i + 1] += y
    p[i + 2] += z
  }
  return { ...m, positions: p }
}

export function cloneMesh(m: Mesh): Mesh {
  return {
    positions: new Float32Array(m.positions),
    indices: new Uint32Array(m.indices),
    normals: m.normals ? new Float32Array(m.normals) : undefined,
    colors: m.colors ? new Float32Array(m.colors) : undefined,
    uvs: m.uvs ? new Float32Array(m.uvs) : undefined,
  }
}

export function meshBounds(m: Mesh) {
  const s = meshStats(m)
  return s.bbox
}

/** Remove a cor/uv e normais (para booleanas/exportação). */
export function bare(m: Mesh): Mesh {
  return { positions: m.positions, indices: m.indices }
}

/** Inverte o sentido dos triângulos se o volume assinado for negativo (faces externas para fora). */
export function orientMesh(m: Mesh): Mesh {
  const p = m.positions
  const ix = m.indices
  let vol = 0
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3
    vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  if (vol >= 0) return m
  const out = new Uint32Array(ix)
  for (let t = 0; t < out.length; t += 3) {
    const tmp = out[t + 1]
    out[t + 1] = out[t + 2]
    out[t + 2] = tmp
  }
  return { ...m, indices: out }
}
