// Restauração a partir do escaneamento: preparo → eixo de inserção → linha de término (automática) → cavidade com espaço de cimento
// → coroa (dente da biblioteca ajustado ao espaço) → contatos proximais → oclusão com o antagonista → espessura → malha final.
// Tudo por campos de distância (SDF) em uma grade local alinhada ao eixo de inserção; vale para escaneamentos abertos (mapa de altura).
import { type Vec3, type Mat3, add, cross, dot, len, mApply, mTranspose, norm, scale, sub, clamp, smoothstep, round, toRad } from "./math";
import { type Mesh, bounds, computeNormals, getV, surfaceArea, transformMesh, vertexCount, volume } from "./mesh";
import { type Grid, gridPoint, makeGrid, sdfFromOccupancy, surfaceNets, sampleSdf } from "./voxel";
import { rasterizeSolid } from "./voxel";
import { bestInsertionAxis } from "./scan";
import type { ToothModel } from "./toothMesh";

export interface RestorationParams {
  cementGap: number;          // mm — folga de cimento (exocad: 0,08)
  spacerStart: number;        // mm acima do término em que a folga atinge o valor total (exocad: 1,0)
  minThicknessAxial: number;  // mm — espessura mínima das paredes
  minThicknessOcclusal: number;
  resolution: number;         // mm da grade (0,12 = padrão; 0,08 = máxima qualidade)
  antagonistClearance: number;// mm de folga estática com o antagonista
  contactClose: number;       // mm — fecha frestas proximais menores que 2× este valor
  marginOffset: number;       // mm — desloca a linha de término ao longo do eixo (+ = oclusal)
  yawDeg: number;             // giro adicional da coroa sobre o eixo
  shiftMD: number; shiftFB: number; // mm — deslocamento mésio-distal / vestíbulo-lingual
  scaleMd: number; scaleBl: number; scaleH: number; // fatores sobre o ajuste automático
  autoFit: boolean;           // ajusta largura/altura ao espaço entre vizinhos e antagonista
  flipMesial: boolean;        // inverte a direção mesial/distal estimada
  insertionTiltMaxDeg: number;
}
export const DEFAULT_RESTORATION: RestorationParams = {
  cementGap: 0.08, spacerStart: 1.0, minThicknessAxial: 0.8, minThicknessOcclusal: 1.0, resolution: 0.12, antagonistClearance: 0.05, contactClose: 0.25,
  marginOffset: 0, yawDeg: 0, shiftMD: 0, shiftFB: 0, scaleMd: 1, scaleBl: 1, scaleH: 1, autoFit: true, flipMesial: false, insertionTiltMaxDeg: 25,
};

export interface RestorationInput {
  scan: Mesh;
  antagonist?: Mesh;
  pick: Vec3;                 // ponto sobre o preparo (mundo)
  tooth: ToothModel;          // dente da biblioteca (referencial local: x distal, y vestibular, z oclusal)
  params?: Partial<RestorationParams>;
  axis?: Vec3;                // eixo de inserção (mundo); se ausente, é calculado
  margin?: Vec3[];            // linha de término manual (mundo)
  onProgress?: (stage: string, p: number) => void;
  /** apenas testes: devolve os campos internos */
  debug?: boolean;
}
export interface RestorationReport {
  stageLog: string[];
  marginLengthMm: number;
  marginPoints: number;
  axis: Vec3; axisUndercutPct: number;
  space: { mesial: number | null; distal: number | null; occlusal: number | null };
  scale: { md: number; bl: number; h: number };
  thickness: { minAxial: number; meanAxial: number; minOcclusal: number | null; meanOcclusal: number | null; thinCount: number; thinPoints: Vec3[]; requiredAxial: number; requiredOcclusal: number };
  contacts: { mesialGap: number | null; distalGap: number | null };
  occlusion: { minClearance: number | null; contactFraction: number | null; hasAntagonist: boolean };
  marginFit: { meanGap: number; maxGap: number };
  volumeMm3: number; surfaceMm2: number; triangles: number; components: number; flatOcclusalPct: number;
  warnings: string[];
}
export interface RestorationResult {
  crown: Mesh;                // mundo
  cavity?: Mesh;              // superfície interna (mundo), para inspeção
  margin: Vec3[];             // mundo
  axis: Vec3;
  report: RestorationReport;
  params: RestorationParams;
  debug?: { grid: Grid; sdfPrep: Float32Array; cav: Float32Array; K: Float32Array; toothSdf: Float32Array; outerFill: Float32Array; tField: Float32Array };
}

// ----------------- utilitários 2D -----------------
interface HMap { nx: number; ny: number; cell: number; ox: number; oy: number; h: Float32Array }
function newHMap(ox: number, oy: number, nx: number, ny: number, cell: number, fill = NaN): HMap {
  return { nx, ny, cell, ox, oy, h: new Float32Array(nx * ny).fill(fill) };
}
/** mapa de altura (máx. z por célula) a partir de uma malha no referencial local */
function heightMapMax(m: Mesh, ox: number, oy: number, nx: number, ny: number, cell: number, mode: "max" | "min" = "max"): HMap {
  const hm = newHMap(ox, oy, nx, ny, cell, mode === "max" ? -Infinity : Infinity);
  const better = mode === "max" ? (a: number, b: number) => a > b : (a: number, b: number) => a < b;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = getV(m, m.indices[t]), b = getV(m, m.indices[t + 1]), c = getV(m, m.indices[t + 2]);
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - ox) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - ox) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - oy) / cell)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - oy) / cell));
    if (i1 < 0 || j1 < 0 || i0 >= nx || j0 >= ny) continue;
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-12) { const zz = mode === "max" ? Math.max(a[2], b[2], c[2]) : Math.min(a[2], b[2], c[2]); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = i + nx * j; if (better(zz, hm.h[q])) hm.h[q] = zz; } continue; }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = ox + i * cell, py = oy + j * cell;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      const q = i + nx * j; if (better(z, hm.h[q])) hm.h[q] = z;
    }
  }
  for (let i = 0; i < hm.h.length; i++) if (!isFinite(hm.h[i])) hm.h[i] = NaN;
  return hm;
}
/** preenche furos do escaneamento com a média dos vizinhos válidos */
function fillHoles(hm: HMap, passes = 12) {
  const { nx, ny } = hm;
  for (let p = 0; p < passes; p++) {
    let changed = false; const nxt = new Float32Array(hm.h);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!isNaN(hm.h[i + nx * j])) continue;
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const v = hm.h[ii + nx * jj]; if (!isNaN(v)) { s += v; c++; } }
      if (c >= 2) { nxt[i + nx * j] = s / c; changed = true; }
    }
    hm.h = nxt; if (!changed) break;
  }
}
function sampleHM(hm: HMap, x: number, y: number): number {
  const fx = (x - hm.ox) / hm.cell, fy = (y - hm.oy) / hm.cell;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= hm.nx - 1 || j >= hm.ny - 1) return NaN;
  const tx = fx - i, ty = fy - j;
  const a = hm.h[i + hm.nx * j], b = hm.h[i + 1 + hm.nx * j], c = hm.h[i + hm.nx * (j + 1)], d = hm.h[i + 1 + hm.nx * (j + 1)];
  if (isNaN(a) || isNaN(b) || isNaN(c) || isNaN(d)) return NaN;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// ----------------- referencial local -----------------
interface Frame { R: Mat3; o: Vec3 } // p_mundo = o + R · p_local ; colunas de R = e1, e2, a
function makeFrame(a: Vec3, origin: Vec3): Frame {
  const z = norm(a);
  const ref: Vec3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(ref, z)), e2 = cross(z, e1);
  return { R: [e1[0], e2[0], z[0], e1[1], e2[1], z[1], e1[2], e2[2], z[2]], o: origin };
}
const toLocal = (f: Frame, p: Vec3): Vec3 => mApply(mTranspose(f.R), sub(p, f.o));
const toWorld = (f: Frame, p: Vec3): Vec3 => add(f.o, mApply(f.R, p));
function meshToLocal(m: Mesh, f: Frame): Mesh { return transformMesh(m, { R: mTranspose(f.R), t: mApply(mTranspose(f.R), scale(f.o, -1)) }); }
function meshToWorld(m: Mesh, f: Frame): Mesh { return transformMesh(m, { R: f.R, t: f.o }); }
function flipWindingM(m: Mesh): Mesh { const idx = new Uint32Array(m.indices); for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } return computeNormals({ positions: m.positions, indices: idx }); }

/** triângulos cujo centroide está a menos de R de c (no referencial indicado) */
export function cropMesh(m: Mesh, c: Vec3, R: number): Mesh {
  const keep: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = getV(m, m.indices[t]), b = getV(m, m.indices[t + 1]), d = getV(m, m.indices[t + 2]);
    const cx = (a[0] + b[0] + d[0]) / 3 - c[0], cy = (a[1] + b[1] + d[1]) / 3 - c[1], cz = (a[2] + b[2] + d[2]) / 3 - c[2];
    if (cx * cx + cy * cy + cz * cz < R * R) keep.push(t);
  }
  const map = new Map<number, number>(); const pos: number[] = []; const idx: number[] = [];
  for (const t of keep) for (let k = 0; k < 3; k++) { const v = m.indices[t + k]; let n = map.get(v); if (n === undefined) { n = pos.length / 3; map.set(v, n); pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]); } idx.push(n); }
  return computeNormals({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
}
/** direção oclusal estimada = soma das normais ponderadas por área (as faces oclusais dominam) */
export function estimateOcclusalDirection(m: Mesh): Vec3 {
  let s: Vec3 = [0, 0, 0];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = getV(m, m.indices[t]), b = getV(m, m.indices[t + 1]), c = getV(m, m.indices[t + 2]);
    s = add(s, scale(cross(sub(b, a), sub(c, a)), 0.5));
  }
  return norm(s);
}

// ----------------- linha de término automática -----------------
export interface MarginProfile { rm: Float64Array; hm: Float64Array; N: number; confidence: number }
const gaussSmoothCircular = (a: Float64Array, sigma: number) => {
  const N = a.length, out = new Float64Array(N), K = Math.ceil(sigma * 3);
  for (let i = 0; i < N; i++) { let s = 0, w = 0; for (let k = -K; k <= K; k++) { const g = Math.exp(-(k * k) / (2 * sigma * sigma)); s += a[(i + k + N * 4) % N] * g; w += g; } out[i] = s / w; }
  return out;
};

/** Detecta o término em perfis radiais: quebra côncava (parede íngreme → ombro/colar), com caminho contínuo por programação dinâmica. */
export function detectMarginProfile(hm: HMap, N = 120, rMax = 9, rMin = 1.4): MarginProfile {
  const rStep = 0.05, nR = Math.floor((rMax - 0) / rStep);
  const rIdxMin = Math.floor(rMin / rStep);
  // perfis suavizados
  const prof: Float64Array[] = [], score: Float64Array[] = [];
  const top = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const h = new Float64Array(nR + 1);
    let last = NaN;
    for (let i = 0; i <= nR; i++) { const v = sampleHM(hm, i * rStep * c, i * rStep * s); h[i] = isNaN(v) ? (isNaN(last) ? 0 : last) : v; last = h[i]; }
    // suavização gaussiana 1D (±0,2 mm)
    const hs = new Float64Array(nR + 1);
    for (let i = 0; i <= nR; i++) { let a = 0, w = 0; for (let d = -4; d <= 4; d++) { const j = clamp(i + d, 0, nR), g = Math.exp(-(d * d) / 8); a += h[j] * g; w += g; } hs[i] = a / w; }
    prof.push(hs);
    let t = -Infinity; for (let i = 0; i <= Math.floor(2.5 / rStep); i++) t = Math.max(t, hs[i]); top[k] = t;
    const sc = new Float64Array(nR + 1);
    const W = 4; // 0,2 mm
    for (let i = W + 2; i < nR - W; i++) {
      const curv = (hs[i + W] - 2 * hs[i] + hs[i - W]) / ((W * rStep) ** 2); // >0: côncavo (quebra parede→ombro)
      const slopeBefore = (hs[i - 2 * W] - hs[i]) / (2 * W * rStep);       // descida antes do ponto (parede)
      const slopeAfter = (hs[i] - hs[i + 2 * W]) / (2 * W * rStep);
      const drop = top[k] - hs[i];
      const wall = smoothstep(0.35, 1.0, slopeBefore) * (1 - smoothstep(0.5, 1.2, slopeAfter) * 0.6);
      sc[i] = Math.max(0, curv) * wall * smoothstep(0.8, 2.0, drop) * (i >= rIdxMin ? 1 : 0) / (1 + ((i * rStep) / 6) ** 2);
    }
    score.push(sc);
  }
  // Viterbi circular (sequência duplicada)
  const T = N * 2, lam = 0.9, maxJump = 6;
  const cost = new Float64Array(T * (nR + 1)).fill(Infinity), back = new Int16Array(T * (nR + 1));
  for (let i = 0; i <= nR; i++) cost[i] = -score[0][i];
  for (let t = 1; t < T; t++) {
    const sc = score[t % N];
    for (let i = 0; i <= nR; i++) {
      let best = Infinity, bj = i;
      for (let d = -maxJump; d <= maxJump; d++) { const j = i + d; if (j < 0 || j > nR) continue; const c = cost[(t - 1) * (nR + 1) + j] + lam * (d * rStep) ** 2 * 6; if (c < best) { best = c; bj = j; } }
      cost[t * (nR + 1) + i] = best - sc[i]; back[t * (nR + 1) + i] = bj;
    }
  }
  let bi = 0, bc = Infinity;
  for (let i = 0; i <= nR; i++) if (cost[(T - 1) * (nR + 1) + i] < bc) { bc = cost[(T - 1) * (nR + 1) + i]; bi = i; }
  const path = new Int32Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = bi; bi = back[t * (nR + 1) + bi]; }
  let rm = new Float64Array(N), hmv = new Float64Array(N), sumScore = 0;
  for (let k = 0; k < N; k++) { const i = path[N + k]; rm[k] = i * rStep; hmv[k] = prof[k][i]; sumScore += score[k][i]; }
  rm = gaussSmoothCircular(rm, 1.5); hmv = gaussSmoothCircular(hmv, 1.5);
  return { rm, hm: hmv, N, confidence: clamp(sumScore / N / 4, 0, 1) };
}

/** converte uma linha de término manual (mundo) em perfil polar no referencial local */
function profileFromPoints(pts: Vec3[], f: Frame, N = 120): MarginProfile {
  const loc = pts.map((p) => toLocal(f, p));
  const ang = loc.map((p) => Math.atan2(p[1], p[0]));
  const rm = new Float64Array(N), hm = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2 - Math.PI;
    let bi = 0, bd = Infinity;
    loc.forEach((_, i) => { let d = Math.abs(ang[i] - th); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; bi = i; } });
    // interpolação entre os dois pontos angularmente mais próximos
    const order = loc.map((_, i) => i).sort((a, b) => { const da = Math.min(Math.abs(ang[a] - th), Math.PI * 2 - Math.abs(ang[a] - th)), db = Math.min(Math.abs(ang[b] - th), Math.PI * 2 - Math.abs(ang[b] - th)); return da - db; }).slice(0, 2);
    const [p, q] = order.map((i) => loc[i]);
    const wp = 1 / (1e-3 + Math.min(Math.abs(ang[order[0]] - th), Math.PI * 2 - Math.abs(ang[order[0]] - th))), wq = 1 / (1e-3 + Math.min(Math.abs(ang[order[1]] - th), Math.PI * 2 - Math.abs(ang[order[1]] - th)));
    rm[k] = (Math.hypot(p[0], p[1]) * wp + Math.hypot(q[0], q[1]) * wq) / (wp + wq); hm[k] = (p[2] * wp + q[2] * wq) / (wp + wq); void bi;
  }
  // reordena para começar em θ=0 (o perfil automático usa θ = k/N·2π a partir de 0)
  const rm2 = new Float64Array(N), hm2 = new Float64Array(N);
  for (let k = 0; k < N; k++) { const kk = (k + N / 2) % N; rm2[k] = rm[kk]; hm2[k] = hm[kk]; }
  return { rm: gaussSmoothCircular(rm2, 1.2), hm: gaussSmoothCircular(hm2, 1.2), N, confidence: 1 };
}
const profAt = (arr: Float64Array, th: number) => { const N = arr.length; let u = ((th / (Math.PI * 2)) % 1 + 1) % 1 * N; const i = Math.floor(u) % N, f = u - Math.floor(u); return arr[i] * (1 - f) + arr[(i + 1) % N] * f; };

// ----------------- pipeline principal -----------------
export function designRestoration(inp: RestorationInput): RestorationResult {
  const P: RestorationParams = { ...DEFAULT_RESTORATION, ...(inp.params ?? {}) };
  const log: string[] = [], warnings: string[] = [];
  const prog = (s: string, p: number) => { log.push(s); inp.onProgress?.(s, p); };
  prog("Orientação e eixo de inserção", 0.02);

  // 1) direção oclusal e eixo de inserção (apenas sobre o preparo)
  const roiBig = cropMesh(inp.scan, inp.pick, 16);
  if (roiBig.indices.length < 300) throw new Error("O ponto escolhido está fora do escaneamento ou em região sem malha.");
  const a0 = estimateOcclusalDirection(cropMesh(inp.scan, inp.pick, 12));
  let axis = inp.axis ? norm(inp.axis) : a0, undercut = 0;
  if (!inp.axis) {
    const near = cropMesh(inp.scan, inp.pick, 6);
    const r = bestInsertionAxis(near, a0, P.insertionTiltMaxDeg);
    axis = r.axis; undercut = r.undercut;
  }
  // 2) mapa de altura local e centro do preparo
  let f = makeFrame(axis, inp.pick);
  let loc = meshToLocal(roiBig, f);
  const cell = 0.05, half = 14, nxy = Math.round((half * 2) / cell) + 1;
  let hmap = heightMapMax(loc, -half, -half, nxy, nxy, cell); fillHoles(hmap, 16);
  // topo do preparo: platô mais alto próximo do ponto
  let cx = 0, cy = 0, cn = 0, hTop = -Infinity;
  for (let j = 0; j < nxy; j++) for (let i = 0; i < nxy; i++) { const x = -half + i * cell, y = -half + j * cell; if (x * x + y * y > 25) continue; const v = hmap.h[i + nxy * j]; if (!isNaN(v) && v > hTop) hTop = v; }
  for (let j = 0; j < nxy; j += 2) for (let i = 0; i < nxy; i += 2) { const x = -half + i * cell, y = -half + j * cell; if (x * x + y * y > 25) continue; const v = hmap.h[i + nxy * j]; if (!isNaN(v) && v > hTop - 0.9) { cx += x; cy += y; cn++; } }
  if (cn) { cx /= cn; cy /= cn; }
  // recentra o referencial no centro do preparo e na altura do topo
  f = makeFrame(axis, toWorld(f, [cx, cy, hTop]));
  loc = meshToLocal(roiBig, f);
  hmap = heightMapMax(loc, -half, -half, nxy, nxy, cell); fillHoles(hmap, 16);

  // 3) linha de término
  prog("Linha de término", 0.1);
  const N = 120;
  let prof: MarginProfile;
  if (inp.margin && inp.margin.length >= 4) prof = profileFromPoints(inp.margin, f, N);
  else { prof = detectMarginProfile(hmap, N); if (prof.confidence < 0.12) warnings.push("Término detectado com baixa confiança: confira/edite a linha de término."); }
  const hmShift = prof.hm.map((v) => v + P.marginOffset);
  const hmMean = hmShift.reduce((s, v) => s + v, 0) / N;
  const marginLocal: Vec3[] = [];
  for (let k = 0; k < N; k++) { const th = (k / N) * Math.PI * 2; marginLocal.push([prof.rm[k] * Math.cos(th), prof.rm[k] * Math.sin(th), hmShift[k]]); }
  let marginLen = 0; for (let k = 0; k < N; k++) marginLen += len(sub(marginLocal[k], marginLocal[(k + 1) % N]));

  // 4) geometria do dente: orientação (faceta, mesial) e escala
  prog("Posicionamento do dente", 0.2);
  const arch = estimateArch(inp.scan, f);

  // 5) grade e sólidos
  prog("Grade de voxels", 0.3);
  const tm = inp.tooth, md0 = tm.dims.md, bl0 = tm.dims.bl, h0 = tm.dims.h;
  const res = P.resolution;
  const ext = Math.max(md0, bl0) * Math.max(P.scaleMd, P.scaleBl, 1.15) / 2 + 5.0;
  const zMin = Math.min(...Array.from(hmShift)) - 2.0, zMax = Math.max(...Array.from(hmShift)) + h0 * Math.max(1.2, P.scaleH) + 3.0;
  const g: Grid = makeGrid([-ext, -ext, zMin], [ext, ext, zMax], res, 0);
  const nxy2 = g.nx * g.ny;
  // por coluna: θ, r, rm, hm
  const colR = new Float32Array(nxy2), colRm = new Float32Array(nxy2), colHm = new Float32Array(nxy2), colH = new Float32Array(nxy2);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = g.o[0] + i * res, y = g.o[1] + j * res, q = i + g.nx * j;
    const th = Math.atan2(y, x);
    colR[q] = Math.hypot(x, y); colRm[q] = profAt(prof.rm, th); colHm[q] = profAt(hmShift as unknown as Float64Array, th);
    const v = sampleHM(hmap, x, y); colH[q] = isNaN(v) ? -1e3 : v;
  }
  const size = g.nx * g.ny * g.nz;
  const occS = new Uint8Array(size), occPrep = new Uint8Array(size), occOther = new Uint8Array(size);
  for (let k = 0; k < g.nz; k++) { const z = g.o[2] + k * res; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const q = i + g.nx * j, id = q + nxy2 * k;
    if (z <= colH[q]) { occS[id] = 1; if (colR[q] <= colRm[q] + 0.15) occPrep[id] = 1; else if (colR[q] > colRm[q] + 0.3) occOther[id] = 1; }
  } }
  prog("Campos de distância do preparo", 0.4);
  const sdfPrep = sdfFromOccupancy(g, occPrep);
  const sdfOther = sdfFromOccupancy(g, occOther);

  // orientação do dente: eixo mésio-distal = direção em que os vizinhos mais se aproximam (ambos os lados); vestibular = para fora do arco
  const probeAt = (dir: Vec3, zRel: number, maxD = 14): number | null => {
    const z = hmMean + zRel; let d = 0;
    while (d < maxD) { if (sampleSdf(g, sdfOther, [dir[0] * d, dir[1] * d, z]) < 0) return d; d += res; }
    return null;
  };
  let dist: Vec3 = [1, 0, 0], fac: Vec3 = [0, 1, 0];
  { // estimativa pelo arco
    let f0: Vec3 = norm([-arch.cx, -arch.cy, 0]); if (len(f0) < 1e-6) f0 = [0, 1, 0];
    let d0: Vec3 = norm(cross([0, 0, 1], f0));
    if (d0[0] * arch.mx + d0[1] * arch.my > 0) d0 = scale(d0, -1);
    dist = d0; fac = f0;
    // refinamento pelos vizinhos
    let bestSum = Infinity, bestTh = -1;
    for (let deg = 0; deg < 180; deg += 5) {
      const th = toRad(deg), dp: Vec3 = [Math.cos(th), Math.sin(th), 0];
      const dm = probeAt(scale(dp, -1), h0 * 0.5), dd = probeAt(dp, h0 * 0.5);
      if (dm !== null && dd !== null && dm + dd < bestSum) { bestSum = dm + dd; bestTh = th; }
    }
    if (bestTh >= 0) {
      let dn: Vec3 = [Math.cos(bestTh), Math.sin(bestTh), 0];
      if (dot(dn, d0) < 0) dn = scale(dn, -1);   // mantém o sentido distal estimado pela linha média
      let fn: Vec3 = [-dn[1], dn[0], 0];
      if (dot(fn, f0) < 0) fn = scale(fn, -1);  // vestibular para fora do arco
      dist = dn; fac = fn;
    } else warnings.push("Vizinhos não localizados para orientar o dente: usada a orientação estimada do arco (confira o giro).");
  }
  if (P.flipMesial) dist = scale(dist, -1);
  { const yaw = toRad(P.yawDeg), cy = Math.cos(yaw), sy = Math.sin(yaw); const rot = (v: Vec3): Vec3 => [v[0] * cy - v[1] * sy, v[0] * sy + v[1] * cy, 0]; dist = rot(dist); fac = rot(fac); }
  const mirror = dot(cross(dist, fac), [0, 0, 1]) < 0;
  const xcol: Vec3 = mirror ? scale(dist, -1) : dist;

  // 6) cavidade com espaço de cimento (0 no término → cementGap a spacerStart acima)
  const cav = new Float32Array(size);   // <0 dentro da cavidade
  const above = new Float32Array(size); // <0 acima do término
  for (let k = 0; k < g.nz; k++) { const z = g.o[2] + k * res; for (let q = 0; q < nxy2; q++) {
    const id = q + nxy2 * k, hA = z - colHm[q];
    const gap = P.cementGap * smoothstep(0, P.spacerStart, hA);
    cav[id] = sdfPrep[id] - gap; above[id] = -hA;
  } }

  // 7) espaço disponível (vizinhos e antagonista) e ajuste do dente
  prog("Espaço entre vizinhos e antagonista", 0.5);
  const dMes = probeAt(scale(dist, -1), h0 * 0.55), dDis = probeAt(dist, h0 * 0.55);
  let antSdf: Float32Array | null = null, zAnt: number | null = null;
  if (inp.antagonist) {
    const am = meshToLocal(cropMesh(inp.antagonist, inp.pick, 18), f);
    const amap = heightMapMax(am, g.o[0], g.o[1], g.nx, g.ny, res, "min"); fillHoles(amap, 10);
    const occA = new Uint8Array(size);
    for (let k = 0; k < g.nz; k++) { const z = g.o[2] + k * res; for (let q = 0; q < nxy2; q++) { const v = amap.h[q]; if (!isNaN(v) && z >= v) occA[q + nxy2 * k] = 1; } }
    antSdf = sdfFromOccupancy(g, occA);
    // altura do antagonista sobre o centro da coroa (média 3×3 mm)
    let s = 0, c = 0; for (let dx = -1.5; dx <= 1.5; dx += 0.75) for (let dy = -1.5; dy <= 1.5; dy += 0.75) { const v = sampleHM(amap, dx, dy); if (!isNaN(v)) { s += v; c++; } }
    zAnt = c ? s / c : null;
  }
  let sMd = P.scaleMd, sBl = P.scaleBl, sH = P.scaleH, shiftMD = P.shiftMD;
  if (P.autoFit) {
    if (dMes !== null && dDis !== null) { const space = dMes + dDis; sMd *= clamp(space / md0, 0.7, 1.3); shiftMD += (dDis - dMes) / 2; if (space / md0 < 0.7 || space / md0 > 1.3) warnings.push(`Espaço mésio-distal (${space.toFixed(1)} mm) muito diferente do dente da biblioteca (${md0.toFixed(1)} mm).`); }
    else warnings.push("Vizinho(s) não encontrado(s) para ajustar a largura: ajuste manual.");
    if (zAnt !== null) { const avail = zAnt - hmMean - P.antagonistClearance; sH *= clamp(avail / Math.max(1, h0 - 0.6), 0.7, 1.3); }
  }
  // dente → grade local
  const sc3: Vec3 = [mirror ? -sMd : sMd, sBl, sH];
  const Rt: Mat3 = [xcol[0], fac[0], 0, xcol[1], fac[1], 0, 0, 0, 1];
  // tooth local (x distal, y facial, z oclusal) → [x*dist, y*fac, z*axis] ; âncora: base cervical no nível médio do término
  const place = { R: Rt, t: add(scale(dist, shiftMD), add(scale(fac, P.shiftFB), [0, 0, hmMean - 0.6 * sH])) as Vec3 };
  let toothLocal = transformMesh({ positions: tm.mesh.positions, indices: tm.mesh.indices }, place, sc3);
  // o centro do dente na base: desloca para o centro da base cervical do modelo
  const cc = tm.landmarks.cervicalCenter;
  toothLocal = transformMesh(toothLocal, { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: scale(mApply(Rt, [cc[0] * sc3[0], cc[1] * sc3[1], 0]), -1) as Vec3 });
  if (mirror) toothLocal = flipWindingM(toothLocal);
  prog("Dente da biblioteca → campo de distância", 0.58);
  const toothOcc = rasterizeSolid(g, [toothLocal]);
  const toothSdf = sdfFromOccupancy(g, toothOcc);

  // 8) coroa = (dente ∪ espessura mínima ao redor da cavidade) acima do término, menos cavidade, vizinhos e antagonista
  prog("Montagem da coroa", 0.7);
  const tMin = P.minThicknessAxial, tOcc = P.minThicknessOcclusal;
  const tField = new Float32Array(size); // espessura mínima local: axial nas paredes, oclusal nas faces voltadas ao eixo
  for (let k = 0; k < g.nz; k++) for (let q = 0; q < nxy2; q++) {
    const id = q + nxy2 * k;
    const up = k < g.nz - 1 ? sdfPrep[id + nxy2] : sdfPrep[id], dn = k > 0 ? sdfPrep[id - nxy2] : sdfPrep[id];
    const gz = (up - dn) / (2 * res);
    tField[id] = (tMin + (tOcc - tMin) * smoothstep(0.3, 0.9, gz)) * 1.06; // 6 % de margem p/ a discretização da grade
  }
  const outer = new Float32Array(size);
  for (let id = 0; id < size; id++) outer[id] = Math.min(toothSdf[id], Math.max(cav[id] - tField[id], above[id]));
  const K = new Float32Array(size);
  for (let id = 0; id < size; id++) {
    let v = Math.max(outer[id], above[id]);          // acima do término
    v = Math.max(v, -cav[id]);                        // menos a cavidade
    v = Math.max(v, -sdfOther[id]);                   // menos vizinhos/gengiva
    if (antSdf) v = Math.max(v, P.antagonistClearance - antSdf[id]); // folga com o antagonista
    K[id] = v;
  }
  // 9) fechamento de contatos proximais
  prog("Contatos proximais", 0.8);
  const occK = new Uint8Array(size); for (let id = 0; id < size; id++) occK[id] = K[id] < 0 ? 1 : 0;
  const sdfK = sdfFromOccupancy(g, occK);
  const cg = P.contactClose;
  for (let k = 0; k < g.nz; k++) { const z = g.o[2] + k * res; for (let q = 0; q < nxy2; q++) {
    if (z - colHm[q] < 1.0) continue;
    const id = q + nxy2 * k;
    if (sdfK[id] < cg && sdfK[id] > 0 && sdfOther[id] > 0 && sdfOther[id] < cg && cav[id] > 0) { if (!antSdf || antSdf[id] > P.antagonistClearance) K[id] = -0.01; }
  } }
  // 10) maior componente conexo
  let components = 0;
  { const lab = new Int32Array(size); const stack: number[] = []; const sizes: number[] = [];
    for (let id0 = 0; id0 < size; id0++) {
      if (K[id0] >= 0 || lab[id0]) continue;
      components++; let cnt = 0; stack.push(id0); lab[id0] = components;
      while (stack.length) {
        const id = stack.pop()!; cnt++;
        const i = id % g.nx, j = Math.floor(id / g.nx) % g.ny, kz = Math.floor(id / nxy2);
        const nb = [i > 0 ? id - 1 : -1, i < g.nx - 1 ? id + 1 : -1, j > 0 ? id - g.nx : -1, j < g.ny - 1 ? id + g.nx : -1, kz > 0 ? id - nxy2 : -1, kz < g.nz - 1 ? id + nxy2 : -1];
        for (const n of nb) if (n >= 0 && K[n] < 0 && !lab[n]) { lab[n] = components; stack.push(n); }
      }
      sizes.push(cnt);
    }
    if (components > 1) { let best = 1; sizes.forEach((s, i) => { if (s > sizes[best - 1]) best = i + 1; }); for (let id = 0; id < size; id++) if (K[id] < 0 && lab[id] !== best) K[id] = 0.5; }
    else if (components === 0) throw new Error("A coroa resultou vazia: verifique o ponto do preparo, o término e o espaço disponível.");
  }
  // 11) malha
  prog("Malha final", 0.9);
  const crownLocal = surfaceNets(g, K, 1);
  const cavLocal = surfaceNets(g, cav, 1);

  // 12) verificações
  prog("Verificações", 0.95);
  const need = { ax: P.minThicknessAxial, oc: P.minThicknessOcclusal };
  // espessura nos pontos da cavidade que pertencem à coroa
  const outerFill = new Float32Array(size);
  for (let id = 0; id < size; id++) { let v = Math.min(toothSdf[id], cav[id] - tField[id]); if (antSdf) v = Math.max(v, P.antagonistClearance - antSdf[id]); outerFill[id] = v; } // sem o corte do término: mede até a superfície lateral
  const ax: number[] = [], oc: number[] = []; const thin: Vec3[] = [];
  const gradZ = (id: number, i: number, j: number, kz: number) => { const up = kz < g.nz - 1 ? sdfPrep[id + nxy2] : sdfPrep[id], dn = kz > 0 ? sdfPrep[id - nxy2] : sdfPrep[id]; void i; void j; return (up - dn) / (2 * res); };
  for (let k = 1; k < g.nz - 1; k++) for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
    const id = i + g.nx * j + nxy2 * k;
    const c = cav[id];
    if (c < 0 || c > res * 1.6) continue; // casca fina fora da cavidade (superfície interna)
    if (K[id] >= 0 && outerFill[id] >= 0 && cav[id] > 0) continue;
    const z = g.o[2] + k * res;
    if (z - colHm[i + g.nx * j] < 0.2) continue; // exclui a faixa do término
    let vv = outerFill[id];
    if (z - colHm[i + g.nx * j] >= 1.0) vv = Math.max(vv, -sdfOther[id]); // vizinhos só limitam acima da zona do término
    const t = -vv;
    if (t < 0) continue;
    const gz = gradZ(id, i, j, k);
    // normal da superfície do preparo apontando para fora: oclusal se gz>0.6 (para cima)
    if (gz > 0.85) oc.push(t); else if (Math.abs(gz) < 0.4) { ax.push(t); if (t < need.ax - 0.05 && thin.length < 80) thin.push(toWorld(f, gridPoint(g, i, j, k))); }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
  const minAx = ax.length ? pct(ax, 0.01) : 0, minOc = oc.length ? pct(oc, 0.01) : null;
  if (ax.length && minAx < need.ax * 0.85) warnings.push(`Parede axial fina: ${minAx.toFixed(2)} mm (mín. ${need.ax} mm). Aumente a redução axial do preparo ou reduza o espaço.`);
  if (minOc !== null && minOc < need.oc * 0.85) warnings.push(`Espessura oclusal ${minOc.toFixed(2)} mm (mín. ${need.oc} mm): falta redução oclusal no preparo ou espaço com o antagonista.`);
  // contatos e oclusão: amostra dos vértices da coroa
  let mesialGap: number | null = null, distalGap: number | null = null, minClr: number | null = null, contactN = 0, occN = 0;
  const mg: number[] = [], dg: number[] = [];
  for (let v = 0; v < vertexCount(crownLocal); v++) {
    const p = getV(crownLocal, v);
    if (p[2] - hmMean < 1.0) continue;
    const dO = sampleSdf(g, sdfOther, p);
    const side = dot(p, dist);
    if (dO < 1.0) (side < 0 ? mg : dg).push(dO);
    if (antSdf) { const dA = sampleSdf(g, antSdf, p); if (dA < 1.5) { occN++; minClr = minClr === null ? dA : Math.min(minClr, dA); if (dA < 0.12) contactN++; } }
  }
  mesialGap = mg.length ? Math.min(...mg) : null; distalGap = dg.length ? Math.min(...dg) : null;
  if (mesialGap === null || mesialGap > 0.25) warnings.push("Contato proximal mesial ausente ou frouxo.");
  if (distalGap === null || distalGap > 0.25) warnings.push("Contato proximal distal ausente ou frouxo.");
  if (!inp.antagonist) warnings.push("Sem antagonista: a oclusão não foi verificada.");
  // adaptação marginal: espaço entre cavidade e preparo na faixa do término
  const gaps: number[] = [];
  for (let v = 0; v < vertexCount(cavLocal); v++) { const p = getV(cavLocal, v); const q = Math.floor((p[0] - g.o[0]) / res) + g.nx * Math.floor((p[1] - g.o[1]) / res); if (q < 0 || q >= nxy2) continue; const hA = p[2] - colHm[q]; if (hA >= -0.1 && hA < 0.3 && colR[q] <= colRm[q] + 0.2) gaps.push(Math.abs(sampleSdf(g, sdfPrep, p))); }
  const marginFit = { meanGap: gaps.length ? mean(gaps) : 0, maxGap: gaps.length ? Math.max(...gaps) : 0 };

  // anatomia oclusal: fração da face oclusal em que a espessura mínima (e não a anatomia do dente) define a superfície
  let occTot = 0, occFlat = 0;
  for (let v = 0; v < vertexCount(crownLocal); v += 3) {
    const nz = crownLocal.normals![v * 3 + 2]; if (nz < 0.6) continue;
    const p = getV(crownLocal, v); if (p[2] - hmMean < 1.5) continue;
    occTot++;
    const tt = sampleSdf(g, toothSdf, p), ee = sampleSdf(g, cav, p) - tMin * 1.06;
    if (ee < tt - 0.05) occFlat++;
  }
  const flatPct = occTot ? occFlat / occTot : 0;
  if (flatPct > 0.25) warnings.push(`Espaço oclusal insuficiente: ${Math.round(flatPct * 100)} % da face oclusal ficou achatada (a anatomia não cabe). Reduza mais o preparo ou use um dente mais baixo.`);
  const crown = meshToWorld(crownLocal, f);
  const cavity = meshToWorld(cavLocal, f);
  const marginWorld = marginLocal.map((p) => toWorld(f, p));
  const rep: RestorationReport = {
    stageLog: log, marginLengthMm: round(marginLen, 1), marginPoints: N, axis, axisUndercutPct: round(undercut * 100, 1),
    space: { mesial: dMes === null ? null : round(dMes, 2), distal: dDis === null ? null : round(dDis, 2), occlusal: zAnt === null ? null : round(zAnt - hmMean, 2) },
    scale: { md: round(sMd, 3), bl: round(sBl, 3), h: round(sH, 3) },
    thickness: { minAxial: round(minAx, 2), meanAxial: round(mean(ax), 2), minOcclusal: minOc === null ? null : round(minOc, 2), meanOcclusal: oc.length ? round(mean(oc), 2) : null, thinCount: thin.length, thinPoints: thin, requiredAxial: need.ax, requiredOcclusal: need.oc },
    contacts: { mesialGap: mesialGap === null ? null : round(mesialGap, 3), distalGap: distalGap === null ? null : round(distalGap, 3) },
    occlusion: { minClearance: minClr === null ? null : round(minClr, 3), contactFraction: occN ? round(contactN / occN, 3) : null, hasAntagonist: !!inp.antagonist },
    marginFit: { meanGap: round(marginFit.meanGap, 3), maxGap: round(marginFit.maxGap, 3) },
    volumeMm3: round(volume(crown), 1), surfaceMm2: round(surfaceArea(crown), 1), triangles: crown.indices.length / 3, components, flatOcclusalPct: round(flatPct * 100, 0), warnings,
  };
  prog("Concluído", 1);
  return { crown, cavity, margin: marginWorld, axis, report: rep, params: P, debug: inp.debug ? { grid: g, sdfPrep, cav, K, toothSdf, outerFill, tField } : undefined };
}

/** centro e linha média aproximados do arco (no plano ⟂ eixo, referencial local do preparo) */
function estimateArch(scan: Mesh, f: Frame) {
  // amostra de vértices; PCA 2D
  const n = vertexCount(scan), step = Math.max(1, Math.floor(n / 20000));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i += step) { const p = toLocal(f, getV(scan, i)); pts.push([p[0], p[1]]); }
  let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0; for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
  // eixo maior = largura do arco; AP = perpendicular
  let ux = sxy, uy = l1 - sxx; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; // maior variância
  const ax = -uy, ay = ux; // AP
  // anterior = lado em que o arco é "fechado": a média do AP fica deslocada para o lado anterior em relação ao ponto médio dos extremos
  let mn = Infinity, mxv = -Infinity, mean = 0; for (const p of pts) { const t = (p[0] - mx) * ax + (p[1] - my) * ay; mn = Math.min(mn, t); mxv = Math.max(mxv, t); mean += t; } mean /= pts.length;
  const sign = mean > (mn + mxv) / 2 ? 1 : -1;
  const front = sign > 0 ? mxv : mn;
  return { cx: mx, cy: my, mx: mx + ax * front * sign * sign * 1 + 0, my: my + ay * front, ap: [ax * sign, ay * sign] as [number, number] };
}
export { bounds };
