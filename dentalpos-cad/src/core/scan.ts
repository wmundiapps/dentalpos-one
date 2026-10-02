// Escaneamentos: alinhamento por marcos (Kabsch) + ICP, orientação do arco, eixo de inserção/área em sombra e linha de margem.
import { type Vec3, type Rigid, add, cross, dist, dot, kabsch, len, mApply, mIdentity, norm, rigidApply, scale, sub, rotZ, mMul, round } from "./math";
import { type Mesh, PointIndex, getV, transformMesh, vertexCount } from "./mesh";

export const alignByLandmarks = (source: Vec3[], target: Vec3[]): Rigid => kabsch(source, target);

/** ICP rígido (ponto-a-ponto) com subamostragem. Retorna transformação acumulada e RMS final. */
export function icp(source: Mesh, target: Mesh, init: Rigid = { R: mIdentity(), t: [0, 0, 0] }, iterations = 30, sample = 1500): { T: Rigid; rms: number } {
  const idx = new PointIndex(target, 1.5);
  const n = vertexCount(source), step = Math.max(1, Math.floor(n / sample));
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i += step) pts.push(getV(source, i));
  let T = init, rms = Infinity;
  for (let it = 0; it < iterations; it++) {
    const A: Vec3[] = [], B: Vec3[] = [];
    let se = 0;
    for (const p of pts) {
      const q = rigidApply(T, p);
      const nn = idx.nearest(q, 6);
      if (!nn) continue;
      A.push(p); B.push(getV(target, nn.index)); se += nn.dist * nn.dist;
    }
    if (A.length < 6) break;
    const newRms = Math.sqrt(se / A.length);
    T = kabsch(A, B);
    if (Math.abs(rms - newRms) < 1e-4) { rms = newRms; break; }
    rms = newRms;
  }
  return { T, rms };
}

/** Do escaneamento: 3 marcos (molar direito, molar esquerdo, ponto incisal central) → transformação para o referencial do projeto + parâmetros do arco. */
export function orientFromLandmarks(rMolar: Vec3, lMolar: Vec3, incisal: Vec3): { T: Rigid; width: number; depth: number } {
  const mid: Vec3 = [(rMolar[0] + lMolar[0]) / 2, (rMolar[1] + lMolar[1]) / 2, (rMolar[2] + lMolar[2]) / 2];
  const xAxis = norm(sub(lMolar, rMolar));
  const fwd0 = sub(incisal, mid);
  const zAxis = norm(cross(xAxis, fwd0));
  const yAxis = cross(zAxis, xAxis);
  const R: [number, number, number, number, number, number, number, number, number] = [xAxis[0], xAxis[1], xAxis[2], yAxis[0], yAxis[1], yAxis[2], zAxis[0], zAxis[1], zAxis[2]];
  // p' = R (p − incisal)
  const t = mApply(R, scale(incisal, -1));
  return { T: { R, t }, width: dist(rMolar, lMolar), depth: Math.abs(dot(fwd0, yAxis)) };
}

/** fração (0..1) da área da superfície em sombra (undercut) para um eixo de inserção */
export function undercutFraction(m: Mesh, axis: Vec3, threshold = 0.02): number {
  const a = norm(axis);
  let total = 0, under = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const p0 = getV(m, m.indices[t]), p1 = getV(m, m.indices[t + 1]), p2 = getV(m, m.indices[t + 2]);
    const c = cross(sub(p1, p0), sub(p2, p0)), area = len(c) / 2;
    if (area < 1e-9) continue;
    const n = scale(c, 1 / (2 * area));
    total += area;
    if (dot(n, a) < -threshold) under += area;
  }
  return total ? under / total : 0;
}
/** eixo de inserção que minimiza a área em sombra (varredura hemisférica + refinamento) */
export function bestInsertionAxis(m: Mesh, around: Vec3 = [0, 0, 1], maxTiltDeg = 35): { axis: Vec3; undercut: number; undercutAtVertical: number } {
  const up = norm(around);
  const ref: Vec3 = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(up, ref)), v = cross(up, u);
  let best = up, bu = undercutFraction(m, up);
  const v0 = bu;
  const eval_ = (axis: Vec3) => { const f = undercutFraction(m, axis); if (f < bu) { bu = f; best = axis; } };
  for (let tilt = 5; tilt <= maxTiltDeg; tilt += 5) for (let az = 0; az < 360; az += 30) {
    const tr = (tilt * Math.PI) / 180, ar = (az * Math.PI) / 180;
    eval_(norm(add(scale(up, Math.cos(tr)), add(scale(u, Math.sin(tr) * Math.cos(ar)), scale(v, Math.sin(tr) * Math.sin(ar))))));
  }
  return { axis: best, undercut: bu, undercutAtVertical: v0 };
}

/** curva fechada de Catmull-Rom pelos pontos de margem; devolve polilinha e comprimento */
export function marginCurve(points: Vec3[], samples = 16): { polyline: Vec3[]; length: number } {
  const n = points.length;
  const out: Vec3[] = [];
  if (n < 3) return { polyline: points.slice(), length: 0 };
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)) as Vec3);
    }
  }
  let L = 0;
  for (let i = 0; i < out.length; i++) L += dist(out[i], out[(i + 1) % out.length]);
  return { polyline: out, length: round(L, 2) };
}
export { transformMesh, rotZ, mMul, add };
