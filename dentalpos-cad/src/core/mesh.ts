// Malha triangular indexada + utilitários (normais, bounds, volume, estanqueidade, fusão, transformação).
import { type Mat3, type Vec3, type Rigid, mApply, add, sub, cross, dot, len } from "./math";

export interface Mesh {
  positions: Float32Array; // xyz
  indices: Uint32Array;
  normals?: Float32Array;
}

export function makeMesh(pos: number[] | Float32Array, idx: number[] | Uint32Array): Mesh {
  return { positions: pos instanceof Float32Array ? pos : new Float32Array(pos), indices: idx instanceof Uint32Array ? idx : new Uint32Array(idx) };
}
export const vertexCount = (m: Mesh) => m.positions.length / 3;
export const triCount = (m: Mesh) => m.indices.length / 3;
export const getV = (m: Mesh, i: number): Vec3 => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];

export function computeNormals(m: Mesh): Mesh {
  const n = new Float32Array(m.positions.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t], b = m.indices[t + 1], c = m.indices[t + 2];
    const f = cross(sub(getV(m, b), getV(m, a)), sub(getV(m, c), getV(m, a)));
    for (const v of [a, b, c]) { n[v * 3] += f[0]; n[v * 3 + 1] += f[1]; n[v * 3 + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return { ...m, normals: n };
}

export function transformMesh(m: Mesh, T: Rigid, s: Vec3 = [1, 1, 1]): Mesh {
  const p = new Float32Array(m.positions.length);
  for (let i = 0; i < p.length; i += 3) {
    const q = add(mApply(T.R, [m.positions[i] * s[0], m.positions[i + 1] * s[1], m.positions[i + 2] * s[2]]), T.t);
    p[i] = q[0]; p[i + 1] = q[1]; p[i + 2] = q[2];
  }
  return computeNormals({ positions: p, indices: m.indices });
}
export const rotateMesh = (m: Mesh, R: Mat3) => transformMesh(m, { R, t: [0, 0, 0] });

export function mergeMeshes(ms: Mesh[]): Mesh {
  let pc = 0, ic = 0;
  for (const m of ms) { pc += m.positions.length; ic += m.indices.length; }
  const pos = new Float32Array(pc), idx = new Uint32Array(ic);
  let po = 0, io = 0, vo = 0;
  for (const m of ms) {
    pos.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) idx[io + i] = m.indices[i] + vo;
    po += m.positions.length; io += m.indices.length; vo += m.positions.length / 3;
  }
  return { positions: pos, indices: idx };
}

export function bounds(m: Mesh): { min: Vec3; max: Vec3; size: Vec3; center: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3)
    for (let k = 0; k < 3; k++) { const v = m.positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max, size: sub(max, min), center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

export function volume(m: Mesh): number {
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) v += dot(getV(m, m.indices[t]), cross(getV(m, m.indices[t + 1]), getV(m, m.indices[t + 2])));
  return v / 6;
}
export function surfaceArea(m: Mesh): number {
  let a = 0;
  for (let t = 0; t < m.indices.length; t += 3) a += len(cross(sub(getV(m, m.indices[t + 1]), getV(m, m.indices[t])), sub(getV(m, m.indices[t + 2]), getV(m, m.indices[t])))) / 2;
  return a;
}

/** Verifica estanqueidade (cada aresta compartilhada por exatamente 2 triângulos, em sentidos opostos), soldando vértices coincidentes. */
export function checkWatertight(m: Mesh, tol = 1e-4): { watertight: boolean; openEdges: number; nonManifoldEdges: number } {
  const key = (i: number) => `${Math.round(m.positions[i * 3] / tol)},${Math.round(m.positions[i * 3 + 1] / tol)},${Math.round(m.positions[i * 3 + 2] / tol)}`;
  const map = new Map<string, number>();
  const id = (i: number) => { const k = key(i); let v = map.get(k); if (v === undefined) { v = map.size; map.set(k, v); } return v; };
  const edges = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [id(m.indices[t]), id(m.indices[t + 1]), id(m.indices[t + 2])];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(k, (edges.get(k) ?? 0) + (a < b ? 1 : 1000));
    }
  }
  let open = 0, nm = 0;
  for (const c of edges.values()) { if (c !== 1001) { if (c === 1 || c === 1000) open++; else nm++; } }
  return { watertight: open === 0 && nm === 0, openEdges: open, nonManifoldEdges: nm };
}

/** Distância mínima aproximada de um ponto aos vértices (grade espacial). */
export class PointIndex {
  private cell: number;
  private grid = new Map<string, number[]>();
  constructor(private m: Mesh, cell = 1) {
    this.cell = cell;
    for (let i = 0; i < m.positions.length / 3; i++) {
      const k = this.key(getV(m, i));
      const l = this.grid.get(k);
      if (l) l.push(i); else this.grid.set(k, [i]);
    }
  }
  private key(p: Vec3) { return `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)},${Math.floor(p[2] / this.cell)}`; }
  nearest(p: Vec3, maxR = 3): { index: number; dist: number } | null {
    const c = this.cell;
    const cx = Math.floor(p[0] / c), cy = Math.floor(p[1] / c), cz = Math.floor(p[2] / c);
    const R = Math.ceil(maxR / c);
    let best = -1, bd = Infinity;
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      const l = this.grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!l) continue;
      for (const i of l) { const d = len(sub(getV(this.m, i), p)); if (d < bd) { bd = d; best = i; } }
    }
    return best < 0 ? null : { index: best, dist: bd };
  }
}
