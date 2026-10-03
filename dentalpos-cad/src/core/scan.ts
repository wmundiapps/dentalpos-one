// Escaneamentos: alinhamento por marcos (Kabsch) + ICP, orientação do arco, eixo de inserção/área em sombra e linha de margem.
import { type Vec3, type Rigid, add, cross, dist, dot, kabsch, len, mApply, mIdentity, norm, rigidApply, scale, sub, rotZ, rotX, mMul, round, rng } from "./math";
import { type Mesh, PointIndex, bounds, computeNormals, getV, transformMesh, vertexCount } from "./mesh";

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

/** pontos da face interna (cavidade) de uma coroa/casca: normais apontando para o centro da peça */
export function innerPoints(m: Mesh, maxPoints = 1500): Vec3[] {
  const nm = m.normals ?? computeNormals(m).normals!;
  const b = bounds(m);
  const c = b.center;
  const pts: Vec3[] = [];
  for (let i = 0; i < vertexCount(m); i++) {
    const p = getV(m, i);
    const n: Vec3 = [nm[i * 3], nm[i * 3 + 1], nm[i * 3 + 2]];
    const toC = norm(sub(c, p));
    if (dot(n, toC) > 0.35) pts.push(p);
  }
  const step = Math.max(1, Math.floor(pts.length / maxPoints));
  return pts.filter((_, i) => i % step === 0);
}

export interface MultiIcpOptions { starts?: number; refine?: number; iterations?: number; maxDist?: number; seed?: number; onProgress?: (p: number) => void }
export interface MultiIcpResult { T: Rigid; rms: number; coverage: number; ranking: Array<{ rms: number; coverage: number }>; confident: boolean }

/** ICP rígido com várias partidas (posição × giro × orientação) usando só a face interna da coroa. */
export function alignCrownToArch(crown: Mesh, arch: Mesh, opts: MultiIcpOptions = {}): MultiIcpResult {
  const { starts = 200, refine = 10, iterations = 25, maxDist = 1.0 } = opts;
  // índice sobre o arco decimado (≈ 20 mil pontos): suficiente p/ distâncias de ~0,1 mm em escaneamentos de 0,05–0,1 mm
  const step = Math.max(1, Math.floor(vertexCount(arch) / 25000));
  const dec = { positions: new Float32Array(Math.ceil(vertexCount(arch) / step) * 3), indices: new Uint32Array(0) } as Mesh;
  for (let i = 0, j = 0; i < vertexCount(arch); i += step, j++) { dec.positions[j * 3] = arch.positions[i * 3]; dec.positions[j * 3 + 1] = arch.positions[i * 3 + 1]; dec.positions[j * 3 + 2] = arch.positions[i * 3 + 2]; }
  const idx = new PointIndex(dec, 1.5);
  const inner = innerPoints(crown, 700);
  const cc = bounds(crown).center;
  const local = inner.map((p) => sub(p, cc));
  const rand = rng(opts.seed ?? 7);
  // candidatos de posição: vértices do arco amostrados
  const na = vertexCount(arch);
  const cands: Vec3[] = [];
  for (let i = 0; i < starts; i++) cands.push(getV(arch, Math.floor(rand() * na)));
  const orient: Rigid["R"][] = [];
  for (const flip of [0, 180]) for (let yaw = 0; yaw < 360; yaw += 45) orient.push(mMul(rotZ(yaw), rotX(flip)));
  const coarseLocal = local.filter((_, i) => i % 10 === 0);
  const score = (T: Rigid, pts: Vec3[] = local) => {
    let s = 0, hit = 0;
    for (const q of pts) { const w = rigidApply(T, q); const nn = idx.nearest(w, 2.2); const d = nn ? Math.min(nn.dist, maxDist * 3) : maxDist * 3; s += d; if (d < 0.25) hit++; }
    return { mean: s / pts.length, cov: hit / pts.length };
  };
  const coarse: Array<{ T: Rigid; mean: number }> = [];
  let k = 0;
  for (const c of cands) {
    for (const R of orient) { const T: Rigid = { R, t: c }; coarse.push({ T, mean: score(T, coarseLocal).mean }); }
    if (opts.onProgress && ++k % 20 === 0) opts.onProgress(k / cands.length * 0.5);
  }
  coarse.sort((a, b) => a.mean - b.mean);
  const results: Array<{ T: Rigid; rms: number; coverage: number }> = [];
  for (let i = 0; i < Math.min(refine, coarse.length); i++) {
    // ICP ponto-a-ponto das amostras internas (em coordenadas do centro da coroa)
    let T = coarse[i].T;
    let prev = Infinity;
    for (let it = 0; it < iterations; it++) {
      const A: Vec3[] = [], B: Vec3[] = [];
      let se = 0;
      for (const q of local) { const w = rigidApply(T, q); const nn = idx.nearest(w, 3); if (!nn || nn.dist > maxDist * 2.5) continue; A.push(q); B.push(getV(dec, nn.index)); se += nn.dist ** 2; }
      if (A.length < 20) break;
      const rms = Math.sqrt(se / A.length);
      T = kabsch(A, B);
      if (Math.abs(prev - rms) < 1e-4) break;
      prev = rms;
    }
    const sc = score(T);
    results.push({ T, rms: sc.mean, coverage: sc.cov });
    opts.onProgress?.(0.5 + ((i + 1) / refine) * 0.5);
  }
  results.sort((a, b) => b.coverage - a.coverage || a.rms - b.rms);
  const best = results[0];
  // converte T (centro da coroa → mundo) em transformação da malha original: p' = R (p − cc) + t
  const R = best.T.R, t = add(best.T.t, mApply(R, scale(cc, -1)));
  return { T: { R, t }, rms: best.rms, coverage: best.coverage, ranking: results.map((r) => ({ rms: r.rms, coverage: r.coverage })), confident: best.coverage > 0.8 && best.rms < 0.15 };
}
