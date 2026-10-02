import { type Vec3, cross, norm, sub, add, scale, len } from "./math";
import { type Mesh, computeNormals } from "./mesh";

/** cilindro/tronco de cone entre a e b (raio ra em a, rb em b), tampas fechadas */
export function cylinderMesh(a: Vec3, b: Vec3, ra: number, rb = ra, seg = 24): Mesh {
  const ax = norm(sub(b, a));
  const ref: Vec3 = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(ax, ref)), v = cross(ax, u);
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < seg; i++) {
    const th = (i / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const d: Vec3 = add(scale(u, c), scale(v, s));
    pos.push(...add(a, scale(d, ra)), ...add(b, scale(d, rb)));
  }
  const ca = pos.length / 3; pos.push(...a); const cb = pos.length / 3; pos.push(...b);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    idx.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1, ca, j * 2, i * 2, cb, i * 2 + 1, j * 2 + 1);
  }
  const m = { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  return computeNormals(fixOutward(m, a, b));
}
function fixOutward(m: Mesh, a: Vec3, b: Vec3): Mesh {
  // garante normais para fora (testa um triângulo lateral)
  const c: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const i0 = m.indices[0], i1 = m.indices[1], i2 = m.indices[2];
  const P = (i: number): Vec3 => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
  const n = cross(sub(P(i1), P(i0)), sub(P(i2), P(i0)));
  const out = sub(P(i0), c);
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) {
    const f = new Uint32Array(m.indices);
    for (let i = 0; i < f.length; i += 3) { const t = f[i + 1]; f[i + 1] = f[i + 2]; f[i + 2] = t; }
    return { positions: m.positions, indices: f };
  }
  return m;
}
export function tubeMesh(a: Vec3, b: Vec3, rOut: number, rIn: number, seg = 28): Mesh {
  const L = len(sub(b, a));
  void L;
  const ax = norm(sub(b, a));
  const ref: Vec3 = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(ax, ref)), v = cross(ax, u);
  const pos: number[] = [], idx: number[] = [];
  const ring = (p: Vec3, r: number) => { for (let i = 0; i < seg; i++) { const th = (i / seg) * Math.PI * 2; pos.push(...add(p, add(scale(u, Math.cos(th) * r), scale(v, Math.sin(th) * r)))); } };
  ring(a, rOut); ring(b, rOut); ring(a, rIn); ring(b, rIn);
  const O0 = 0, O1 = seg, I0 = 2 * seg, I1 = 3 * seg;
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    idx.push(O0 + i, O0 + j, O1 + i, O0 + j, O1 + j, O1 + i); // externa
    idx.push(I0 + i, I1 + i, I0 + j, I0 + j, I1 + i, I1 + j); // interna (invertida)
    idx.push(O1 + i, O1 + j, I1 + i, O1 + j, I1 + j, I1 + i); // topo
    idx.push(O0 + i, I0 + i, O0 + j, O0 + j, I0 + i, I0 + j); // base
  }
  const m = { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
  return computeNormals(fixOutward(m, a, b));
}
