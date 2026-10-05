// Escultura de dentes por campos de distância (SDF) com uniões suaves — formas orgânicas em vez de superfícies de revolução.
// Referencial local: x = mésio→distal (+distal), y = vestibular (+), z = cervical(0) → oclusal/incisal (+h).
import { type Vec3, clamp, lerp, smoothstep } from "./math";
import { type ToothRef, type ToothType } from "./anatomy";
import { type Mesh, computeNormals } from "./mesh";
import { makeGrid, gridPoint, gidx, surfaceNets, laplacianSmooth } from "./voxel";

/** Parâmetros de anatomia (multiplicadores; 1 = padrão). Cada um altera a escultura do dente. */
export interface AnatomyParams {
  /** altura das cúspides / incisal */ cuspHeight: number;
  /** largura (volume) das cúspides */ cuspWidth: number;
  /** profundidade de fossas e sulcos */ fossa: number;
  /** cristas marginais (mesial/distal) */ marginal: number;
  /** cíngulo (anteriores) */ cingulum: number;
  /** convexidade vestibular / bojo cervical */ labial: number;
  /** lóbulos de desenvolvimento / crista labial */ lobes: number;
  /** convergência das paredes para oclusal */ taper: number;
  /** espessura da borda incisal */ edge: number;
}
export const DEFAULT_ANATOMY: AnatomyParams = { cuspHeight: 1, cuspWidth: 1, fossa: 1, marginal: 1, cingulum: 1, labial: 1, lobes: 1, taper: 1, edge: 1 };
export const ANATOMY_LABEL: Record<keyof AnatomyParams, [string, string, boolean, boolean]> = {
  // [rótulo, dica, vale p/ anteriores, vale p/ posteriores]
  cuspHeight: ["Altura das cúspides / borda", "Quanto as cúspides (ou a borda incisal) sobem acima da mesa oclusal", true, true],
  cuspWidth: ["Volume das cúspides", "Cúspides mais largas e cheias ou mais finas", false, true],
  fossa: ["Profundidade das fossas e sulcos", "Fossas oclusais (posteriores) e fossa lingual (anteriores)", true, true],
  marginal: ["Cristas marginais", "Altura das cristas mesial e distal", true, true],
  cingulum: ["Cíngulo", "Volume do cíngulo na face lingual", true, false],
  labial: ["Convexidade vestibular", "Bojo da face vestibular (equador)", true, true],
  lobes: ["Lóbulos / crista labial", "Relevo de desenvolvimento na face vestibular", true, false],
  taper: ["Convergência para oclusal", "Quanto as paredes se estreitam em direção à mesa oclusal", false, true],
  edge: ["Espessura da borda incisal", "Borda incisal mais fina ou mais espessa", true, false],
};

export interface SculptOpts { md: number; bl: number; h: number; res?: number; squareness?: number; cornerRounding?: number; labialConvexity?: number; mamelon?: number; wear?: number; anat?: Partial<AnatomyParams> }

const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
const g = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
const ss = smoothstep;

/** cápsula/cone arredondado de a (raio ra) até b (raio rb) */
function sdRound(p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1), 0, 1);
  return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - lerp(ra, rb, t);
}
const sdEll = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => (Math.hypot(x / rx, y / ry, z / rz) - 1) * Math.min(rx, ry, rz);

interface Cusp { u: number; w: number; hf: number; rb: number; rt: number }
interface PostRecipe { cusps: Cusp[]; ridges: Array<[number, number]>; cuspH: number; marginal: number; rhomb: number; fossa: Array<[number, number, number]>; lingTaper: number; premolar: boolean }

function postRecipe(ref: ToothRef): PostRecipe {
  const up = ref.jaw === "upper", t = ref.type;
  if (t === "premolar1" || t === "premolar2") {
    const p1 = t === "premolar1";
    return up
      ? { cusps: [{ u: 0, w: 0.42, hf: 1, rb: 0.5, rt: 0.2 }, { u: 0, w: -0.42, hf: p1 ? 0.88 : 0.9, rb: 0.46, rt: 0.2 }], ridges: [[0, 1]], cuspH: 0.34, marginal: 0.7, rhomb: 0, fossa: [[0, 0, 0.5]], lingTaper: 0.22, premolar: true }
      : { cusps: p1 ? [{ u: 0.05, w: 0.18, hf: 1, rb: 0.5, rt: 0.22 }, { u: 0.05, w: -0.5, hf: 0.38, rb: 0.3, rt: 0.15 }] : [{ u: 0, w: 0.3, hf: 1, rb: 0.46, rt: 0.2 }, { u: -0.4, w: -0.42, hf: 0.78, rb: 0.34, rt: 0.17 }, { u: 0.45, w: -0.4, hf: 0.7, rb: 0.34, rt: 0.17 }], ridges: p1 ? [[0, 1]] : [[0, 1], [0, 2]], cuspH: 0.34, marginal: 0.6, rhomb: 0, fossa: [[0, 0, 0.45]], lingTaper: 0.28, premolar: true };
  }
  if (up) {
    const m1 = t === "molar1";
    return { cusps: [{ u: -0.46, w: 0.46, hf: 1, rb: 0.36, rt: 0.17 }, { u: 0.46, w: 0.46, hf: 0.9, rb: 0.34, rt: 0.16 }, { u: -0.44, w: -0.46, hf: 1, rb: 0.38, rt: 0.18 }, { u: 0.5, w: -0.44, hf: m1 ? 0.62 : 0.78, rb: m1 ? 0.28 : 0.31, rt: 0.14 }], ridges: [[0, 2], [1, 2], [1, 3]], cuspH: 0.36, marginal: 0.8, rhomb: 0.14, fossa: [[-0.6, 0.1, 0.5], [0.64, -0.1, 0.5]], lingTaper: 0.3, premolar: false };
  }
  return { cusps: [{ u: -0.5, w: 0.46, hf: 0.95, rb: 0.34, rt: 0.16 }, { u: 0.0, w: 0.5, hf: 0.9, rb: 0.32, rt: 0.15 }, { u: 0.55, w: 0.4, hf: 0.74, rb: 0.3, rt: 0.14 }, { u: -0.34, w: -0.46, hf: 1, rb: 0.34, rt: 0.16 }, { u: 0.36, w: -0.44, hf: 0.96, rb: 0.33, rt: 0.16 }], ridges: [[0, 3], [1, 3], [1, 4], [2, 4]], cuspH: 0.36, marginal: 0.7, rhomb: 0, fossa: [[0, 0, 0.5]], lingTaper: 0.34, premolar: false };
}

export function sculptTooth(ref: ToothRef, o: SculptOpts): Mesh {
  const { md, bl, h } = o;
  const a = md / 2, B = bl / 2, res = o.res ?? 0.12;
  const ant = ref.type === "central" || ref.type === "lateral" || ref.type === "canine";
  const grid = makeGrid([-a - 1.5, -B - 2.2, -1], [a + 1.5, B + 2.2, h + 1.5], res);
  const s = new Float32Array(grid.nx * grid.ny * grid.nz);
  const f = ant ? anteriorField(ref.type, o, a, B) : posteriorField(ref, o, a, B);
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) s[gidx(grid, i, j, k)] = f(gridPoint(grid, i, j, k));
  let m = surfaceNets(grid, s, 1);
  m = laplacianSmooth(m, 3, 0.5);
  return computeNormals(m);
}

function posteriorField(ref: ToothRef, o: SculptOpts, a: number, B: number): (p: Vec3) => number {
  const A = { ...DEFAULT_ANATOMY, ...o.anat };
  const R = postRecipe(ref), h = o.h, cuspH = R.cuspH * h * A.cuspHeight, hw = h - cuspH;
  const n = 2.6 + (o.squareness ?? 0) * 0.8;
  const cs = R.cusps.map((c) => ({ ...c, cx: c.u * a * 0.8, cy: c.w * B * 0.74, zt: hw + c.hf * cuspH, rx: a * (R.premolar ? 0.6 : 0.42) * A.cuspWidth, ry: B * (R.premolar ? 0.52 : 0.4) * A.cuspWidth }));
  const fz = hw + cuspH * 0.12;
  return (p) => {
    const [x, y, z] = p;
    const t = clamp(z / hw, 0, 1.2);
    // seção transversal: romboide (molares superiores), convergência para oclusal, bojo vestibular no terço cervical
    const hx = a * (0.8 + 0.2 * ss(0, 0.75, t)) * (1 - 0.06 * ss(0.7, 1.1, t));
    const bulge = 0.09 * B * A.labial * g(t - 0.22, 0.22);
    const yf = B * (1 - 0.16 * A.taper * ss(0.3, 1.05, t)) + bulge, yl = -B * (1 - R.lingTaper * A.taper * ss(0.25, 1.05, t));
    const yc = (yf + yl) / 2, hy = (yf - yl) / 2;
    const qx = (x - R.rhomb * (y - yc) * (a / B)) / hx, qy = (y - yc) / hy;
    const side = (Math.pow(Math.pow(Math.abs(qx), n) + Math.pow(Math.abs(qy), n), 1 / n) - 1) * Math.min(hx, hy);
    // mesa oclusal com borda elevada (cristas marginais) e leve elevação nas paredes vestibular/lingual
    const u = x / a, w = (y - yc) / hy;
    const rim = cuspH * (R.marginal * A.marginal * 0.55 * ss(0.5, 0.85, Math.abs(u)) + 0.18 * ss(0.62, 0.95, Math.abs(w)));
    const cejP = 0.07 * h * Math.pow(Math.min(1, Math.abs(x / a)), 2);
    let pit = 0;
    for (const [fu, fw, fd] of R.fossa) pit += A.fossa * cuspH * (0.12 + 0.45 * fd) * Math.exp(-(((x - fu * a * 0.7) / (a * 0.3)) ** 2 + ((y - fw * B * 0.7) / (B * 0.2)) ** 2));
    let d = smax(smax(side, cejP - z, 0.6), z - (hw + rim - pit), 0.4);
    // cúspides: domos largos fundidos ao corpo
    for (const c of cs) d = smin(d, sdEll(x - c.cx, y - c.cy, z - (hw - cuspH * 0.15), c.rx, c.ry, c.zt - hw + cuspH * 0.15), 0.7);
    // cristas triangulares / oblíqua: da ponta da cúspide até a fossa central
    for (const [i, j] of R.ridges) {
      const A = cs[i], Bc = cs[j];
      d = smin(d, sdRound(p, [A.cx, A.cy, A.zt - cuspH * 0.35], [Bc.cx, Bc.cy, Bc.zt - cuspH * 0.35], 0.55, 0.55), 0.7);
    }
    for (const c of cs) d = smin(d, sdRound(p, [c.cx, c.cy, c.zt - cuspH * 0.25], [c.cx * 0.3, c.cy * 0.3, fz], 0.7, 0.5), 0.8);
    return d;
  };
}

function anteriorField(type: ToothType, o: SculptOpts, a: number, B: number): (p: Vec3) => number {
  const A = { ...DEFAULT_ANATOMY, ...o.anat };
  const { h, bl } = o, conv = (o.labialConvexity ?? 0.5) * A.labial, rnd = o.cornerRounding ?? 0.5, mam = o.mamelon ?? 0.3;
  const canine = type === "canine", lat = type === "lateral";
  const edgeT = clamp((1.1 + (o.wear ?? 0) * 0.9) * A.edge, 0.6, 3);
  return (p) => {
    const [x, y, z] = p;
    const t = clamp(z / h, -0.2, 1.2), u = x / a;
    // contorno incisal: ângulo mesial reto, distal arredondado; canino em ponta
    const drop = canine
      ? (u < 0 ? 0.42 : 0.62) * h * 0.30 * Math.pow(Math.abs(u), 1.15) * 1.6
      : (u < 0 ? 0.25 * rnd : 0.75 * rnd * (lat ? 1.3 : 1)) * Math.pow(Math.abs(u), lat ? 2.4 : 3.2) * 1.6 + 0.12 * h * 0 ;
    const mamZ = canine ? 0 : mam * 0.5 * Math.max(0, Math.cos(u * 3 * Math.PI * 0.5)) ** 2;
    const zTop = h - drop * clamp(2 - A.cuspHeight, 0.2, 1.8) + mamZ * 0.6 * A.cuspHeight;
    // largura mésio-distal: colo estreito, maior diâmetro no terço incisal; lado distal mais convexo
    const wcerv = (canine ? 0.62 : 0.7) + (lat ? 0.02 : 0);
    const wt = wcerv + (1 - wcerv) * ss(0, canine ? 0.7 : 0.82, t);
    const xm = -a * (wt + 0.02 * (1 - t)), xd = a * (wt + (canine ? 0.02 : 0.0));
    const xc = (xm + xd) / 2, hxw = (xd - xm) / 2;
    const side = Math.abs(x - xc) - hxw;
    // espessura vestíbulo-lingual
    const thick = edgeT + (bl - edgeT) * Math.pow(1 - ss(0.12, 1.0, t), 1.25);
    // face vestibular: convexa (3 lóbulos no incisivo, crista labial no canino) e bojo cervical
    const lob = A.lobes * (canine ? 0.55 * conv * g(u, 0.28) - 0.12 * ss(0.5, 1, Math.abs(u)) : 0.2 * conv * (0.5 + 0.5 * Math.cos(3 * Math.PI * u)) * ss(0.25, 0.95, t));
    const cerv = 0.34 * g(t - 0.2, 0.2);
    const yf = B * 0.5 + (bl * 0.5 - 0.12 * bl * ss(0.2, 1, t)) * 0.5 + cerv + lob - 0.3 * u * u;
    // face lingual: cíngulo, cristas marginais e fossa
    const ling = -(0.9 * A.cingulum * g(u, 0.5) * g(t - 0.22, 0.16)) + (canine ? 0.35 * g(u, 0.16) * ss(0.3, 0.9, t) : 0);
    const ridge = 0.28 * A.marginal * g(Math.abs(u) - 0.72, 0.16) * ss(0.35, 0.85, t);
    const fossa = -Math.min(0.5, 0.3 * bl * 0.3) * A.fossa * g(u, 0.45) * ss(0.3, 0.55, t) * (1 - ss(0.78, 1, t));
    const yl = yf - thick + ridge * 1.5 + ling - fossa;
    const slab = Math.max(yl - y, y - yf);
    let d = smax(smax(side, slab, 0.5), z - zTop, 0.5);
    const cej = (canine ? 0.2 : 0.26) * h * Math.pow(Math.min(1, Math.abs(u)), 1.8);
    d = smax(d, cej - z, 0.5);
    return d;
  };
}

/** pontas de cúspide (referencial canônico) na ordem da receita: mesial→distal, vestibular→lingual */
export function cuspPoints(ref: ToothRef, o: { md: number; bl: number; h: number }): Vec3[] {
  const R = postRecipe(ref), a = o.md / 2, B = o.bl / 2, cuspH = R.cuspH * o.h, hw = o.h - cuspH;
  return R.cusps.map((c) => [c.u * a * 0.8, c.w * B * 0.74, hw + c.hf * cuspH] as Vec3);
}

import type { ToothModel } from "./toothMesh";
import type { Landmarks } from "./anatomy";
/** Modelo completo (malha + marcos anatômicos) a partir da malha esculpida, ajustado a novas dimensões (md, bl, h). */
export function modelFromSculpt(ref: ToothRef, mesh: Mesh, canon: { md: number; bl: number; h: number }, target: { md: number; bl: number; h: number }, occlusalTilt = 0): ToothModel {
  const P0 = mesh.positions, nV = P0.length / 3;
  const ant = ref.type === "central" || ref.type === "lateral" || ref.type === "canine";
  const a = canon.md / 2;
  // compensa o torque de Andrews: inclina a mesa oclusal (como no gerador paramétrico)
  const slope = ant ? 0 : -Math.tan((occlusalTilt * Math.PI) / 180);
  const shear = (v: Vec3): Vec3 => [v[0], v[1], v[2] + slope * v[1] * smoothstep(0.2, 1, v[2] / canon.h)];
  const P = new Float32Array(P0.length);
  for (let i = 0; i < nV; i++) { const q = shear([P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]]); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
  let maxZ = -Infinity; for (let i = 0; i < nV; i++) maxZ = Math.max(maxZ, P[i * 3 + 2]);
  // varredura: extremos em uma faixa de altura
  const band = (z0: number, z1: number, pick: (x: number, y: number, z: number) => boolean = () => true) => { const out: Vec3[] = []; for (let i = 0; i < nV; i++) { const z = P[i * 3 + 2]; if (z >= z0 && z <= z1 && pick(P[i * 3], P[i * 3 + 1], z)) out.push([P[i * 3], P[i * 3 + 1], z]); } return out; };
  const zc = canon.h * (ref.type === "canine" ? 0.6 : ant ? 0.72 : 0.72);
  const bc = band(zc - 0.35, zc + 0.35);
  const mes = bc.reduce((m, v) => (v[0] < m[0] ? v : m), bc[0] ?? [-a, 0, zc]), dis = bc.reduce((m, v) => (v[0] > m[0] ? v : m), bc[0] ?? [a, 0, zc]);
  const cerv = band(0, canon.h * 0.14, (x) => Math.abs(x) < a * 0.25);
  const cervF = cerv.reduce((m, v) => (v[1] > m[1] ? v : m), cerv[0] ?? [0, canon.bl / 2, 0.3]);
  const cervL = cerv.reduce((m, v) => (v[1] < m[1] ? v : m), cerv[0] ?? [0, -canon.bl / 2, 0.3]);
  let cusps: Vec3[], incisalMid: Vec3, facialEdge: Vec3, lingualEdge: Vec3, mesialAngle: Vec3, distalAngle: Vec3, anchor: Vec3;
  let mesialRidge: Vec3 | undefined, distalRidge: Vec3 | undefined;
  if (ant) {
    const top = band(maxZ - 0.35, maxZ + 1);
    const fT = top.reduce((m, v) => (v[1] > m[1] ? v : m), top[0]), lT = top.reduce((m, v) => (v[1] < m[1] ? v : m), top[0]);
    const tipx = top.reduce((m, v) => (v[2] > m[2] ? v : m), top[0]);
    facialEdge = [0, fT[1], maxZ]; lingualEdge = [0, lT[1], maxZ - 0.2];
    incisalMid = [0, (fT[1] + lT[1]) / 2, ref.type === "canine" ? tipx[2] : maxZ];
    const edge = band(maxZ - 1.2, maxZ + 1), me = edge.reduce((m, v) => (v[0] < m[0] ? v : m), edge[0]), di = edge.reduce((m, v) => (v[0] > m[0] ? v : m), edge[0]);
    mesialAngle = [me[0], fT[1], me[2]]; distalAngle = [di[0], fT[1], di[2]];
    cusps = [incisalMid]; anchor = [0, incisalMid[1], incisalMid[2]];
  } else {
    cusps = cuspPoints(ref, canon).map(shear);
    const fac = cusps.filter((c) => c[1] > 0), lin = cusps.filter((c) => c[1] <= 0);
    const hi = (l: Vec3[]) => l.reduce((m, c) => (c[2] > m[2] ? c : m), l[0] ?? cusps[0]);
    facialEdge = hi(fac); lingualEdge = hi(lin);
    incisalMid = cusps.reduce((m, c) => (c[2] > m[2] ? c : m), cusps[0]);
    mesialAngle = [-a * 0.85, facialEdge[1], canon.h * 0.97]; distalAngle = [a * 0.85, facialEdge[1], canon.h * 0.97];
    const mR = band(canon.h * 0.5, maxZ + 1, (x) => x < -a * 0.62), dR = band(canon.h * 0.5, maxZ + 1, (x) => x > a * 0.62);
    mesialRidge = mR.reduce((m, v) => (v[2] > m[2] ? v : m), mR[0] ?? mes); distalRidge = dR.reduce((m, v) => (v[2] > m[2] ? v : m), dR[0] ?? dis);
    anchor = [0, (facialEdge[1] + lingualEdge[1]) / 2, canon.h - postRecipe(ref).cuspH * canon.h * 0.45];
  }
  anchor = shear(anchor);
  const lm: Landmarks = { incisalMid, facialEdge, lingualEdge, mesialContact: mes, distalContact: dis, cervicalFacial: [0, cervF[1], cervF[2]], cervicalCenter: [0, (cervF[1] + cervL[1]) / 2, 0], cusps, mesialAngle, distalAngle, mesialRidge, distalRidge, anchor };
  const sx = target.md / canon.md, sy = target.bl / canon.bl, sz = target.h / canon.h;
  const sc = (v: Vec3): Vec3 => [v[0] * sx, v[1] * sy, v[2] * sz];
  const pos = new Float32Array(P.length);
  for (let i = 0; i < nV; i++) { pos[i * 3] = P[i * 3] * sx; pos[i * 3 + 1] = P[i * 3 + 1] * sy; pos[i * 3 + 2] = P[i * 3 + 2] * sz; }
  const out = computeNormals({ positions: pos, indices: mesh.indices });
  const L: Landmarks = { incisalMid: sc(lm.incisalMid), facialEdge: sc(lm.facialEdge), lingualEdge: sc(lm.lingualEdge), mesialContact: sc(lm.mesialContact), distalContact: sc(lm.distalContact), cervicalFacial: sc(lm.cervicalFacial), cervicalCenter: sc(lm.cervicalCenter), cusps: lm.cusps.map(sc), mesialAngle: sc(lm.mesialAngle), distalAngle: sc(lm.distalAngle), mesialRidge: lm.mesialRidge && sc(lm.mesialRidge), distalRidge: lm.distalRidge && sc(lm.distalRidge), anchor: sc(lm.anchor) };
  return { fdi: ref.fdi, dims: { md: target.md, bl: target.bl, h: target.h }, mesh: out, landmarks: L };
}
