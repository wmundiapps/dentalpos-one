// Matemática básica 3D (mm / graus). Sem dependências — o núcleo roda em Node e no navegador.
export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number]; // linha-maior

export const DEG = Math.PI / 180;
export const toRad = (d: number) => d * DEG;
export const toDeg = (r: number) => r / DEG;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};
export const round = (v: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const angleBetween = (a: Vec3, b: Vec3) => toDeg(Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)));

export const mIdentity = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const mMul = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
export const mApply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export const mTranspose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const rotX = (deg: number): Mat3 => {
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (deg: number): Mat3 => {
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (deg: number): Mat3 => {
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg));
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export function axisAngle(axis: Vec3, deg: number): Mat3 {
  const [x, y, z] = norm(axis);
  const c = Math.cos(toRad(deg)), s = Math.sin(toRad(deg)), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}

/** Transformação rígida: p' = R p + t */
export interface Rigid { R: Mat3; t: Vec3 }
export const rigidApply = (T: Rigid, p: Vec3): Vec3 => add(mApply(T.R, p), T.t);
export const rigidIdentity = (): Rigid => ({ R: mIdentity(), t: [0, 0, 0] });

// ---- Eigen-decomposição simétrica 3x3 (Jacobi) e SVD para Kabsch ----
export function jacobiEigen(A: number[][]): { values: number[]; vectors: number[][] } {
  const a = A.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i][j] * a[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < 2; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v }; // colunas = autovetores
}

/** Kabsch: melhor rotação+translação mapeando A -> B (pares correspondentes). */
export function kabsch(A: Vec3[], B: Vec3[]): Rigid {
  const n = A.length;
  const ca: Vec3 = [0, 0, 0], cb: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { ca[k] += A[i][k] / n; cb[k] += B[i][k] / n; }
  const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const a = sub(A[i], ca), b = sub(B[i], cb);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[r][c] += a[r] * b[c];
  }
  // SVD via autodecomposição de H^T H
  const HtH = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) HtH[i][j] += H[k][i] * H[k][j];
  const { values, vectors } = jacobiEigen(HtH);
  const order = [0, 1, 2].sort((x, y) => values[y] - values[x]);
  const V = order.map((o) => [vectors[0][o], vectors[1][o], vectors[2][o]]); // V[i] = i-ésimo autovetor
  const U: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const s = Math.sqrt(Math.max(values[order[i]], 0));
    const hv = [0, 1, 2].map((r) => H[r][0] * V[i][0] + H[r][1] * V[i][1] + H[r][2] * V[i][2]);
    U.push(s > 1e-9 ? hv.map((x) => x / s) : [0, 0, 0]);
  }
  if (len(U[2] as Vec3) < 1e-9) U[2] = cross(U[0] as Vec3, U[1] as Vec3);
  // R = V * U^T com correção de reflexão
  const build = (sgn: number): Mat3 => {
    const R = new Array(9).fill(0) as Mat3;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let i = 0; i < 3; i++) s += (i === 2 ? sgn : 1) * V[i][r] * U[i][c];
        R[r * 3 + c] = s;
      }
    return R;
  };
  let R = build(1);
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  if (det < 0) R = build(-1);
  const t = sub(cb, mApply(R, ca));
  return { R, t };
}

/** Decompõe R em ângulos (graus) rotZ(yaw)·rotY(pitch)·rotX(roll). */
export function eulerZYX(R: Mat3): { roll: number; pitch: number; yaw: number } {
  const pitch = -Math.asin(clamp(R[6], -1, 1));
  const roll = Math.atan2(R[7], R[8]);
  const yaw = Math.atan2(R[3], R[0]);
  return { roll: toDeg(roll), pitch: toDeg(pitch), yaw: toDeg(yaw) };
}

/** PRNG determinístico (mulberry32) — projetos reproduzíveis. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
