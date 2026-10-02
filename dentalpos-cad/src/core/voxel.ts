// Campo de distância com sinal (SDF) em grade regular: booleanas, offsets exatos (EDT) e extração de malha (surface nets).
// Base de enceramento, mockup, guias cirúrgicos e espaçadores — evita CSG de malha, que é frágil.
import { type Vec3 } from "./math";
import { type Mesh, bounds, computeNormals, getV, volume } from "./mesh";

export interface Grid { nx: number; ny: number; nz: number; h: number; o: Vec3 }
export const gridSize = (g: Grid) => g.nx * g.ny * g.nz;
export const gidx = (g: Grid, i: number, j: number, k: number) => i + g.nx * (j + g.ny * k);
export const gridPoint = (g: Grid, i: number, j: number, k: number): Vec3 => [g.o[0] + i * g.h, g.o[1] + j * g.h, g.o[2] + k * g.h];

export function makeGrid(min: Vec3, max: Vec3, h: number, pad = 0): Grid {
  const o: Vec3 = [min[0] - pad, min[1] - pad, min[2] - pad];
  const nx = Math.ceil((max[0] + pad - o[0]) / h) + 1, ny = Math.ceil((max[1] + pad - o[1]) / h) + 1, nz = Math.ceil((max[2] + pad - o[2]) / h) + 1;
  return { nx, ny, nz, h, o };
}
export function gridFor(meshes: Mesh[], h: number, pad: number): Grid {
  const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) { const b = bounds(m); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.min[k]); mx[k] = Math.max(mx[k], b.max[k]); } }
  return makeGrid(mn, mx, h, pad);
}

const INF = 1e12;
/** transformada de distância euclidiana quadrática 1D (Felzenszwalb & Huttenlocher) */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s: number;
    while (true) {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k] && k > 0) k--; else break;
    }
    if (s <= z[k]) { v[k] = q; z[k] = -INF; z[k + 1] = INF; } else { k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
/** distância (em unidades de grade) de cada voxel até o conjunto `seed` (1 = semente). */
function distanceTo(g: Grid, seed: Uint8Array): Float32Array {
  const { nx, ny, nz } = g;
  const f = new Float64Array(nx * ny * nz);
  for (let i = 0; i < f.length; i++) f[i] = seed[i] ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const buf = new Float64Array(m), out = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const b = nx * (j + ny * k); for (let i = 0; i < nx; i++) buf[i] = f[b + i]; edt1d(buf, nx, out, v, z); for (let i = 0; i < nx; i++) f[b + i] = out[i]; }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) buf[j] = f[i + nx * (j + ny * k)]; edt1d(buf, ny, out, v, z); for (let j = 0; j < ny; j++) f[i + nx * (j + ny * k)] = out[j]; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { for (let k = 0; k < nz; k++) buf[k] = f[i + nx * (j + ny * k)]; edt1d(buf, nz, out, v, z); for (let k = 0; k < nz; k++) f[i + nx * (j + ny * k)] = out[k]; }
  const r = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) r[i] = Math.sqrt(Math.min(f[i], INF));
  return r;
}

/** SDF (mm; negativo dentro) a partir de ocupação binária. */
export function sdfFromOccupancy(g: Grid, occ: Uint8Array): Float32Array {
  const inv = new Uint8Array(occ.length);
  for (let i = 0; i < occ.length; i++) inv[i] = occ[i] ? 0 : 1;
  const dOut = distanceTo(g, occ), dIn = distanceTo(g, inv);
  const s = new Float32Array(occ.length);
  for (let i = 0; i < s.length; i++) s[i] = occ[i] ? -(dIn[i] - 0.5) * g.h : (dOut[i] - 0.5) * g.h;
  return s;
}

/** Ocupação de malhas FECHADAS por paridade de raios em +z. */
export function rasterizeSolid(g: Grid, meshes: Mesh[]): Uint8Array {
  const cols: number[][] = new Array(g.nx * g.ny);
  const ex = 0.3719 * g.h, ey = 0.2917 * g.h; // deslocamento p/ evitar arestas exatas
  for (const m of meshes) {
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = getV(m, m.indices[t]), b = getV(m, m.indices[t + 1]), c = getV(m, m.indices[t + 2]);
      const minx = Math.min(a[0], b[0], c[0]), maxx = Math.max(a[0], b[0], c[0]), miny = Math.min(a[1], b[1], c[1]), maxy = Math.max(a[1], b[1], c[1]);
      const i0 = Math.max(0, Math.ceil((minx - ex - g.o[0]) / g.h)), i1 = Math.min(g.nx - 1, Math.floor((maxx - ex - g.o[0]) / g.h));
      const j0 = Math.max(0, Math.ceil((miny - ey - g.o[1]) / g.h)), j1 = Math.min(g.ny - 1, Math.floor((maxy - ey - g.o[1]) / g.h));
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = g.o[0] + i * g.h + ex, py = g.o[1] + j * g.h + ey;
        const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
        const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
        const key = i + g.nx * j;
        (cols[key] ??= []).push(z);
      }
    }
  }
  const occ = new Uint8Array(gridSize(g));
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const zs = cols[i + g.nx * j];
    if (!zs || zs.length < 2) continue;
    zs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < zs.length; s += 2) {
      const k0 = Math.max(0, Math.ceil((zs[s] - g.o[2]) / g.h)), k1 = Math.min(g.nz - 1, Math.floor((zs[s + 1] - g.o[2]) / g.h));
      for (let k = k0; k <= k1; k++) occ[gidx(g, i, j, k)] = 1;
    }
  }
  return occ;
}

/** Sólido por "mapa de altura" a partir do lado oclusal (aceita escaneamentos abertos): ocupado = abaixo (ou acima) da superfície mais externa. */
export function rasterizeHeightfield(g: Grid, meshes: Mesh[], dir: "up" | "down", base: number): Uint8Array {
  const H = new Float32Array(g.nx * g.ny).fill(dir === "up" ? -Infinity : Infinity);
  for (const m of meshes) {
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = getV(m, m.indices[t]), b = getV(m, m.indices[t + 1]), c = getV(m, m.indices[t + 2]);
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - g.o[0]) / g.h)), i1 = Math.min(g.nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - g.o[0]) / g.h));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - g.o[1]) / g.h)), j1 = Math.min(g.ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - g.o[1]) / g.h));
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(det) < 1e-12) { const zz = Math.max(a[2], b[2], c[2]); const zn = Math.min(a[2], b[2], c[2]); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = i + g.nx * j; H[q] = dir === "up" ? Math.max(H[q], zz) : Math.min(H[q], zn); } continue; }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = g.o[0] + i * g.h, py = g.o[1] + j * g.h;
        const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
        const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
        const l3 = 1 - l1 - l2, e = -0.05;
        if (l1 < e || l2 < e || l3 < e) continue;
        const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
        const q = i + g.nx * j;
        H[q] = dir === "up" ? Math.max(H[q], z) : Math.min(H[q], z);
      }
    }
  }
  const occ = new Uint8Array(gridSize(g));
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const hz = H[i + g.nx * j];
    if (!isFinite(hz)) continue;
    const kTop = Math.min(g.nz - 1, Math.floor((hz - g.o[2]) / g.h)), kBase = Math.max(0, Math.ceil((base - g.o[2]) / g.h));
    if (dir === "up") for (let k = kBase; k <= kTop; k++) occ[gidx(g, i, j, k)] = 1;
    else { const kT = Math.max(0, Math.ceil((hz - g.o[2]) / g.h)), kB = Math.min(g.nz - 1, Math.floor((base - g.o[2]) / g.h)); for (let k = kT; k <= kB; k++) occ[gidx(g, i, j, k)] = 1; }
  }
  return occ;
}

// ---- operações sobre SDFs ----
export const sdfUnion = (a: Float32Array, b: Float32Array) => { const r = new Float32Array(a.length); for (let i = 0; i < r.length; i++) r[i] = Math.min(a[i], b[i]); return r; };
export const sdfIntersect = (a: Float32Array, b: Float32Array) => { const r = new Float32Array(a.length); for (let i = 0; i < r.length; i++) r[i] = Math.max(a[i], b[i]); return r; };
export const sdfSubtract = (a: Float32Array, b: Float32Array) => { const r = new Float32Array(a.length); for (let i = 0; i < r.length; i++) r[i] = Math.max(a[i], -b[i]); return r; };
/** offset > 0 expande, < 0 contrai (exato para expansão; aproximado para contração) */
export const sdfOffset = (a: Float32Array, r: number) => { const o = new Float32Array(a.length); for (let i = 0; i < o.length; i++) o[i] = a[i] - r; return o; };
export function sdfAnalytic(g: Grid, f: (p: Vec3) => number): Float32Array {
  const r = new Float32Array(gridSize(g));
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) r[gidx(g, i, j, k)] = f(gridPoint(g, i, j, k));
  return r;
}
export const sdfCylinder = (g: Grid, a: Vec3, b: Vec3, rad: number) => {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...ab), u: Vec3 = [ab[0] / L, ab[1] / L, ab[2] / L];
  return sdfAnalytic(g, (p) => {
    const ap: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const t = ap[0] * u[0] + ap[1] * u[1] + ap[2] * u[2];
    const rx = ap[0] - t * u[0], ry = ap[1] - t * u[1], rz = ap[2] - t * u[2];
    const radial = Math.hypot(rx, ry, rz) - rad, axial = Math.abs(t - L / 2) - L / 2;
    return Math.min(Math.max(radial, axial), 0) + Math.hypot(Math.max(radial, 0), Math.max(axial, 0));
  });
};
export const sdfHalfSpaceZ = (g: Grid, z0: number, keep: "above" | "below") => sdfAnalytic(g, (p) => (keep === "above" ? z0 - p[2] : p[2] - z0));
export function sdfBox(g: Grid, min: Vec3, max: Vec3) {
  return sdfAnalytic(g, (p) => {
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], hs: Vec3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
    const q = [Math.abs(p[0] - c[0]) - hs[0], Math.abs(p[1] - c[1]) - hs[1], Math.abs(p[2] - c[2]) - hs[2]];
    return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
  });
}
export function sdfVolume(g: Grid, s: Float32Array): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] < 0) n++;
  return n * g.h ** 3;
}

/** Surface nets: malha da isosuperfície SDF=0. */
export function surfaceNets(g: Grid, s: Float32Array, smooth = 1): Mesh {
  const { nx, ny, nz } = g;
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = s[gidx(g, i + corner[c][0], j + corner[c][1], k + corner[c][2])]; val[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t; sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t; sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t; cnt++;
    }
    cell[gidx(g, i, j, k)] = pos.length / 3;
    pos.push(g.o[0] + (i + sx / cnt) * g.h, g.o[1] + (j + sy / cnt) * g.h, g.o[2] + (k + sz / cnt) * g.h);
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = s[gidx(g, i, j, k)] < 0;
    // aresta +x
    if ((s[gidx(g, i + 1, j, k)] < 0) !== v0) quad(cell[gidx(g, i, j - 1, k - 1)], cell[gidx(g, i, j, k - 1)], cell[gidx(g, i, j, k)], cell[gidx(g, i, j - 1, k)], v0);
    if ((s[gidx(g, i, j + 1, k)] < 0) !== v0) quad(cell[gidx(g, i - 1, j, k - 1)], cell[gidx(g, i - 1, j, k)], cell[gidx(g, i, j, k)], cell[gidx(g, i, j, k - 1)], v0);
    if ((s[gidx(g, i, j, k + 1)] < 0) !== v0) quad(cell[gidx(g, i - 1, j - 1, k)], cell[gidx(g, i, j - 1, k)], cell[gidx(g, i, j, k)], cell[gidx(g, i - 1, j, k)], v0);
  }
  let mesh: Mesh = { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  if (smooth > 0) mesh = laplacianSmooth(mesh, smooth);
  if (mesh.indices.length && volume(mesh) < 0) { const f = new Uint32Array(mesh.indices); for (let i = 0; i < f.length; i += 3) { const t = f[i + 1]; f[i + 1] = f[i + 2]; f[i + 2] = t; } mesh = { positions: mesh.positions, indices: f }; }
  return computeNormals(mesh);
}

export function laplacianSmooth(m: Mesh, iters: number, lambda = 0.5): Mesh {
  const n = m.positions.length / 3;
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < m.indices.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.indices[t + e], b = m.indices[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  let p = new Float32Array(m.positions);
  for (let it = 0; it < iters; it++) {
    const q = new Float32Array(p.length);
    for (let i = 0; i < n; i++) {
      const s = nb[i]; if (!s.size) { q.set(p.subarray(i * 3, i * 3 + 3), i * 3); continue; }
      let x = 0, y = 0, z = 0; for (const j of s) { x += p[j * 3]; y += p[j * 3 + 1]; z += p[j * 3 + 2]; }
      q[i * 3] = p[i * 3] + lambda * (x / s.size - p[i * 3]); q[i * 3 + 1] = p[i * 3 + 1] + lambda * (y / s.size - p[i * 3 + 1]); q[i * 3 + 2] = p[i * 3 + 2] + lambda * (z / s.size - p[i * 3 + 2]);
    }
    p = q;
  }
  return { positions: p, indices: m.indices };
}

/** amostragem trilinear do SDF em um ponto do mundo (fora da grade = +grande) */
export function sampleSdf(g: Grid, s: Float32Array, p: Vec3): number {
  const fx = (p[0] - g.o[0]) / g.h, fy = (p[1] - g.o[1]) / g.h, fz = (p[2] - g.o[2]) / g.h;
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx - 1 || j >= g.ny - 1 || k >= g.nz - 1) return 1e3;
  const tx = fx - i, ty = fy - j, tz = fz - k;
  const v = (a: number, b: number, c: number) => s[gidx(g, i + a, j + b, k + c)];
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(v(0, 0, 0), v(1, 0, 0), tx), l(v(0, 1, 0), v(1, 1, 0), tx), ty), l(l(v(0, 0, 1), v(1, 0, 1), tx), l(v(0, 1, 1), v(1, 1, 1), tx), ty), tz);
}
