// Gerador paramétrico de coroas dentárias (malha estanque) com anatomia detalhada.
// Referencial local: x = mésio→distal (+distal), y = vestibular (+), z = cervical(0) → oclusal/incisal (+h)
//
// Anteriores: lóbulos vestibulares, crista labial (canino), mamelões, cíngulo, cristas marginais e fossa lingual, desgaste incisal.
// Posteriores: cúspides cônicas, cristas triangulares, crista oblíqua, cristas marginais, sulco central, sulcos V/L, fossas e fóssulas,
//              crista vestibular dos pré-molares, depressões de desenvolvimento.
import { type Vec3, clamp, lerp, smoothstep } from "./math";
import { type Landmarks, type ToothDims, type ToothRef, isAnterior } from "./anatomy";
import { type Mesh, computeNormals, volume } from "./mesh";
import type { StyleModifiers } from "./profiles";

export interface ToothShapeInput {
  ref: ToothRef;
  dims: ToothDims;
  mods: StyleModifiers;
  /** resolução angular (default 64) */
  segments?: number;
  /** inclinação (°) da mesa oclusal em relação ao eixo — compensa o torque de Andrews nos posteriores */
  occlusalTilt?: number;
}
export interface ToothModel {
  fdi: number;
  dims: ToothDims;
  mesh: Mesh;
  landmarks: Landmarks;
}

const sgnpow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;
const gauss = (d: number, s: number) => Math.exp(-((d / s) ** 2));

/** cúspide: posição normalizada (u = x/a, w = y/(bl/2)), altura relativa, raio normalizado */
interface Cusp { u: number; w: number; h: number; r: number }
interface Morph {
  cusps: Cusp[];
  /** cristas triangulares/oblíquas: pares de cúspides [i, j] (j = -1 → fossa central) e altura relativa */
  ridges: Array<[number, number, number]>;
  buccalGrooves: number[]; lingualGrooves: number[];
  marginal: number; // altura relativa das cristas marginais
  centralGroove: number; // profundidade relativa
  pits: Array<[number, number, number]>; // u, w, profundidade
  cuspH: number; // mm (relevo oclusal)
}
function morphFor(ref: ToothRef): Morph | null {
  const up = ref.jaw === "upper";
  switch (ref.type) {
    case "premolar1": return up
      ? { cusps: [{ u: 0, w: 0.42, h: 1, r: 0.62 }, { u: 0, w: -0.4, h: 0.86, r: 0.56 }], ridges: [[0, -1, 0.5], [1, -1, 0.45]], buccalGrooves: [], lingualGrooves: [], marginal: 0.5, centralGroove: 0.5, pits: [[-0.55, 0, 0.3], [0.55, 0, 0.3]], cuspH: 2.4 }
      : { cusps: [{ u: 0.05, w: 0.18, h: 1, r: 0.66 }, { u: 0.05, w: -0.5, h: 0.34, r: 0.34 }], ridges: [[0, 1, 0.65]], buccalGrooves: [], lingualGrooves: [-0.15], marginal: 0.45, centralGroove: 0.3, pits: [[-0.5, -0.1, 0.25], [0.5, -0.1, 0.25]], cuspH: 2.3 };
    case "premolar2": return up
      ? { cusps: [{ u: 0, w: 0.4, h: 0.96, r: 0.62 }, { u: 0, w: -0.38, h: 0.88, r: 0.58 }], ridges: [[0, -1, 0.5], [1, -1, 0.45]], buccalGrooves: [], lingualGrooves: [], marginal: 0.5, centralGroove: 0.45, pits: [[-0.5, 0, 0.3], [0.5, 0, 0.3]], cuspH: 2.2 }
      : { cusps: [{ u: 0, w: 0.34, h: 0.95, r: 0.56 }, { u: -0.38, w: -0.42, h: 0.82, r: 0.4 }, { u: 0.42, w: -0.42, h: 0.72, r: 0.4 }], ridges: [[0, -1, 0.5], [1, -1, 0.4], [2, -1, 0.4]], buccalGrooves: [], lingualGrooves: [0.0], marginal: 0.45, centralGroove: 0.4, pits: [[0, -0.05, 0.3]], cuspH: 2.2 };
    case "molar1": return up
      ? { cusps: [{ u: -0.42, w: 0.44, h: 1, r: 0.5 }, { u: 0.4, w: 0.44, h: 0.9, r: 0.46 }, { u: -0.4, w: -0.44, h: 1, r: 0.52 }, { u: 0.44, w: -0.42, h: 0.6, r: 0.4 }], ridges: [[0, -1, 0.35], [1, 2, 0.55], [1, -1, 0.3], [2, -1, 0.3], [3, -1, 0.25]], buccalGrooves: [-0.02], lingualGrooves: [0.1], marginal: 0.45, centralGroove: 0.4, pits: [[0, 0, 0.45], [-0.55, 0.05, 0.3], [0.62, -0.1, 0.3]], cuspH: 2.7 }
      : { cusps: [{ u: -0.55, w: 0.46, h: 0.95, r: 0.44 }, { u: 0, w: 0.5, h: 0.9, r: 0.42 }, { u: 0.58, w: 0.4, h: 0.74, r: 0.4 }, { u: -0.32, w: -0.46, h: 1, r: 0.48 }, { u: 0.36, w: -0.44, h: 0.96, r: 0.46 }], ridges: [[0, -1, 0.3], [1, -1, 0.3], [2, -1, 0.25], [3, -1, 0.35], [4, -1, 0.35]], buccalGrooves: [-0.28, 0.3], lingualGrooves: [0.0], marginal: 0.45, centralGroove: 0.45, pits: [[0, 0, 0.45], [-0.6, 0, 0.3], [0.62, 0, 0.3]], cuspH: 2.6 };
    case "molar2": return up
      ? { cusps: [{ u: -0.4, w: 0.44, h: 0.95, r: 0.5 }, { u: 0.42, w: 0.44, h: 0.85, r: 0.5 }, { u: -0.4, w: -0.44, h: 0.95, r: 0.5 }, { u: 0.42, w: -0.4, h: 0.5, r: 0.38 }], ridges: [[0, -1, 0.3], [1, 2, 0.45], [1, -1, 0.3], [2, -1, 0.3]], buccalGrooves: [0.0], lingualGrooves: [0.05], marginal: 0.45, centralGroove: 0.4, pits: [[0, 0, 0.4]], cuspH: 2.5 }
      : { cusps: [{ u: -0.4, w: 0.44, h: 0.95, r: 0.5 }, { u: 0.42, w: 0.44, h: 0.9, r: 0.5 }, { u: -0.4, w: -0.44, h: 0.95, r: 0.5 }, { u: 0.42, w: -0.44, h: 0.9, r: 0.5 }], ridges: [[0, -1, 0.3], [1, -1, 0.3], [2, -1, 0.3], [3, -1, 0.3]], buccalGrooves: [0.0], lingualGrooves: [0.0], marginal: 0.45, centralGroove: 0.45, pits: [[0, 0, 0.4]], cuspH: 2.5 };
    case "molar3": return { cusps: [{ u: -0.4, w: 0.4, h: 0.8, r: 0.5 }, { u: 0.4, w: 0.4, h: 0.7, r: 0.5 }, { u: -0.36, w: -0.4, h: 0.8, r: 0.5 }, { u: 0.4, w: -0.36, h: 0.6, r: 0.45 }], ridges: [[0, -1, 0.3], [1, -1, 0.3], [2, -1, 0.3]], buccalGrooves: [0.0], lingualGrooves: [0.0], marginal: 0.4, centralGroove: 0.35, pits: [[0, 0, 0.35]], cuspH: 2.2 };
    default: return null;
  }
}

export function generateTooth(inp: ToothShapeInput): ToothModel {
  const { ref, mods } = inp;
  const ant = isAnterior(ref.type);
  const NT = inp.segments ?? 64;
  const a0 = inp.dims.md / 2;
  const bl = inp.dims.bl;
  const h = inp.dims.h;
  const n = mods.squareness;
  const conv = mods.labialConvexity;
  const wearMM = mods.wear * (ant ? 1.2 : 0.5);
  const morph0 = morphFor(ref);
  // cúspides vestibulares maiores que as linguais/palatinas
  const morph = morph0 && { ...morph0, cusps: morph0.cusps.map((c) => ({ ...c, r: c.r * (c.w > 0 ? 1.12 : c.w < 0 ? 0.88 : 1) })) };
  const cuspH = morph ? morph.cuspH * (0.55 + mods.cuspRelief * 0.6) * (1 - mods.wear * 0.5) : 0;
  const hWall = ant ? h - wearMM : h - cuspH;
  const edgeT = clamp(1.1 + mods.wear * 0.9, 1, 2.2);

  const aOf = (v: number, side = 0) => {
    const asym = ant ? (side < 0 ? 1.06 : side > 0 ? 0.88 : 1) : 1; // lado mesial (−x) mais reto, distal (+x) mais afunilado
    const cerv = (ant ? mods.cervicalRatio : lerp(0.8, mods.cervicalRatio, 0.35)) * asym;
    const up = ant ? smoothstep(0, 0.78, v) : smoothstep(0, 0.62, v);
    let a = a0 * lerp(cerv, 1, up);
    if (ant) a *= 1 - 0.1 * smoothstep(0.88, 1, v) * mods.cornerRounding;
    if (!ant) a *= 1 - 0.1 * smoothstep(0.78, 1, v);
    return a;
  };
  const tOf = (v: number) => {
    if (ant) {
      const taper = (1 - smoothstep(0.18, 1, v)) ** 1.15;
      return (edgeT + (bl - edgeT) * taper) * lerp(0.78, 1, smoothstep(0, 0.14, v));
    }
    return bl * lerp(0.82, 1, smoothstep(0, 0.2, v)) * (1 - 0.2 * smoothstep(0.55, 1, v));
  };
  const yfOf = (v: number) => {
    const bulge = Math.sin(Math.PI * clamp(v / 0.55, 0, 1)) * 0.07 * conv * bl;
    if (ant) return bl * 0.5 - 0.12 * v * bl * (1 - conv * 0.6) + bulge;
    return bl * 0.5 * (1 - 0.1 * smoothstep(0.6, 1, v)) + bulge * (ref.jaw === "upper" ? 1.7 : 0.7); // superiores: equador vestibular mais cheio (afasta a bochecha)
  };
  const dMax = clamp((ant ? 0.35 : 0) + mods.cornerRounding * 1.4, 0, 2.2);
  const dropAt = (x: number) => {
    if (!ant) return 0;
    const r = x / a0;
    if (ref.type === "canine") return (r < 0 ? mods.cuspDrop * 0.75 : mods.cuspDrop * 1.15) * Math.abs(r) ** 1.1;
    return (r < 0 ? dMax * 0.65 : dMax * (ref.type === "lateral" ? 1.25 : 1)) * Math.abs(r) ** (ref.type === "lateral" ? 2.6 : 3.2);
  };
  const mamelonAt = (x: number) => (ant && ref.type !== "canine" ? mods.mamelon * Math.max(0, Math.cos((x / a0) * 3 * Math.PI * 0.5)) ** 2 * 0.7 : 0);

  // -------- relevo oclusal (posteriores) --------
  const field = (x: number, y: number, yc: number) => {
    if (!morph) return 0;
    const u = x / a0, w = (y - yc) / (bl / 2);
    const sharp = 1.7 - mods.wear * 0.5;
    let f = 0;
    for (const c of morph.cusps) {
      const d = Math.min(1, Math.hypot((u - c.u) / c.r, (w - c.w) / (c.r * 1.15)));
      f += c.h * (1 - d ** sharp) ** 1.5;
    }
    // cristas triangulares / oblíqua
    for (const [i, j, hr] of morph.ridges) {
      const A = morph.cusps[i], B = j >= 0 ? morph.cusps[j] : { u: 0, w: 0, h: 0, r: 0 };
      const dx = B.u - A.u, dy = B.w - A.w, L2 = dx * dx + dy * dy || 1;
      const t = clamp(((u - A.u) * dx + (w - A.w) * dy) / L2, 0, 1);
      const dist = Math.hypot(u - (A.u + t * dx), w - (A.w + t * dy));
      f += hr * A.h * gauss(dist, 0.11) * (1 - 0.7 * t);
    }
    // cristas marginais (mesial e distal)
    f += morph.marginal * gauss(Math.abs(u) - 0.82, 0.13) * Math.max(0, 1 - Math.abs(w) ** 3);
    // sulco central
    f -= morph.centralGroove * gauss(w, 0.09) * Math.max(0, 1 - Math.abs(u) ** 6);
    // sulcos vestibular/lingual (partindo da fossa)
    for (const g of morph.buccalGrooves) f -= 0.4 * gauss(u - g, 0.075) * smoothstep(0.1, 0.55, w);
    for (const g of morph.lingualGrooves) f -= 0.4 * gauss(u - g, 0.075) * smoothstep(0.1, 0.55, -w);
    // fóssulas
    for (const [pu, pw, depth] of morph.pits) f -= depth * Math.exp(-(((u - pu) / 0.2) ** 2 + ((w - pw) / 0.16) ** 2));
    return cuspH * clamp(f, 0, 1.2) * 0.9;
  };
  const slope = ant ? 0 : -Math.tan(((inp.occlusalTilt ?? 0) * Math.PI) / 180);

  const V = 28, C = ant ? 6 : 14;
  const positions: number[] = [];
  const ringStart: number[] = [];

  const ringPoint = (v: number, th: number, s = 1, capMode = false): Vec3 => {
    const c = Math.cos(th), sn = Math.sin(th);
    const vv = capMode ? 1 : v;
    const a = aOf(vv, c < 0 ? -1 : 1), yf = yfOf(vv), t = tOf(vv);
    const yc = yf - t / 2;
    const x = a * sgnpow(c, 2 / n) * s;
    let y = yc + (t / 2) * sgnpow(sn, sn > 0 && ant ? 1 : 2 / Math.max(2, n * 0.8)) * s;
    const u = x / a0;
    if (!capMode) {
      if (ant) {
        if (sn > 0) {
          // face vestibular: lóbulos (central/lateral) ou crista labial (canino)
          const lob = ref.type === "canine" ? 0.5 * conv * gauss(u, 0.3) - 0.1 * conv * smoothstep(0.5, 1, Math.abs(u)) : 0.22 * conv * (0.5 + 0.5 * Math.cos(3 * Math.PI * u));
          y += lob * smoothstep(0.2, 0.9, v) * sn;
        } else {
          // face lingual: cíngulo, cristas marginais, fossa e (canino) crista lingual
          const ls = -sn;
          y -= (0.55 * gauss(u, 0.5) * (1 - smoothstep(0.08, 0.5, v))) * ls;
          y -= 0.22 * gauss(Math.abs(u) - 0.72, 0.16) * smoothstep(0.35, 0.85, v) * ls;
          y += Math.min(0.5, 0.3 * t) * gauss(u, ref.type === "canine" ? 0.55 : 0.45) * smoothstep(0.3, 0.55, v) * (1 - smoothstep(0.78, 1, v)) * ls;
          if (ref.type === "canine") y -= 0.35 * gauss(u, 0.14) * smoothstep(0.3, 0.9, v) * ls;
        }
      } else if (sn > 0) {
        if (ref.type.startsWith("premolar")) y += 0.4 * conv * gauss(u, 0.32) * smoothstep(0.15, 0.9, v) * sn; // crista vestibular
        for (const g of morph?.buccalGrooves ?? []) y -= 0.32 * gauss(u - g, 0.07) * smoothstep(0.45, 1, v) * sn;
      } else {
        for (const g of morph?.lingualGrooves ?? []) y += 0.26 * gauss(u - g, 0.07) * smoothstep(0.5, 1, v) * -sn;
      }
    }
    let z: number;
    if (ant) {
      z = v * hWall - dropAt(x) * smoothstep(0.3, 1, vv) ** 1.4 + mamelonAt(x) * smoothstep(0.7, 1, vv);
      if (capMode) z = hWall - dropAt(x) + mamelonAt(x);
      z += 1.1 * (1 - smoothstep(0, 0.32, vv)) * Math.abs(x / a0) ** 2; // junção amelocementária
    } else {
      const w = capMode ? 1 : smoothstep(0.5, 1, v) ** 2;
      z = (capMode ? hWall : v * hWall) + w * field(x, y, yc) + (capMode ? 1 : smoothstep(0.2, 1, v)) * slope * (y - yc);
      if (!capMode) z += 0.4 * (1 - smoothstep(0, 0.25, v)) * Math.abs(x / a0) ** 2;
    }
    return [x, y, z];
  };
  for (let i = 0; i <= V; i++) {
    ringStart.push(positions.length / 3);
    const v = i / V;
    for (let j = 0; j < NT; j++) positions.push(...ringPoint(v, (j / NT) * Math.PI * 2));
  }
  const lastWall = ringStart[V];
  for (let j = 0; j < NT; j++) { const p = ringPoint(1, (j / NT) * Math.PI * 2, 1, true); positions[(lastWall + j) * 3] = p[0]; positions[(lastWall + j) * 3 + 1] = p[1]; positions[(lastWall + j) * 3 + 2] = p[2]; }
  for (let k = 1; k < C; k++) {
    ringStart.push(positions.length / 3);
    const s = 1 - k / C;
    for (let j = 0; j < NT; j++) positions.push(...ringPoint(1, (j / NT) * Math.PI * 2, s, true));
  }
  const topC = positions.length / 3;
  const yc1 = yfOf(1) - tOf(1) / 2;
  positions.push(0, yc1, ant ? hWall + mamelonAt(0) : hWall + field(0, yc1, yc1));
  const botC = positions.length / 3;
  positions.push(0, yfOf(0) - tOf(0) / 2, 0);

  const idx: number[] = [];
  const nRings = ringStart.length;
  for (let r = 0; r < nRings - 1; r++) {
    const A = ringStart[r], B = ringStart[r + 1];
    for (let j = 0; j < NT; j++) { const j2 = (j + 1) % NT; idx.push(A + j, A + j2, B + j, A + j2, B + j2, B + j); }
  }
  const lastRing = ringStart[nRings - 1];
  for (let j = 0; j < NT; j++) idx.push(lastRing + j, lastRing + (j + 1) % NT, topC);
  const firstRing = ringStart[0];
  for (let j = 0; j < NT; j++) idx.push(firstRing + (j + 1) % NT, firstRing + j, botC);

  let mesh: Mesh = { positions: new Float32Array(positions), indices: new Uint32Array(idx) };
  if (volume(mesh) < 0) {
    const f = new Uint32Array(mesh.indices);
    for (let i = 0; i < f.length; i += 3) { const t = f[i + 1]; f[i + 1] = f[i + 2]; f[i + 2] = t; }
    mesh = { positions: mesh.positions, indices: f };
  }
  mesh = computeNormals(mesh);

  // ---- marcos anatômicos ----
  const P = (v: number, th: number): Vec3 => ringPoint(v, th, 1, v >= 1);
  const vContact = ant ? 0.78 : 0.72;
  const top = (th: number) => P(1, th);
  let cuspPts: Vec3[];
  if (ant) cuspPts = [top(Math.PI / 2)];
  else cuspPts = morph!.cusps.map((c) => { const x = c.u * a0, y = yc1 + c.w * (bl / 2); return [x, y, hWall + field(x, y, yc1) + slope * (y - yc1)] as Vec3; });
  const maxCusp = cuspPts.reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[0]);
  const facialCusp = ant ? top(Math.PI / 2) : cuspPts.filter((_, i) => morph!.cusps[i].w > 0).reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[0]);
  const lingualCusp = ant ? top(-Math.PI / 2) : cuspPts.filter((_, i) => morph!.cusps[i].w < 0).reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[cuspPts.length - 1]);
  const cz = P(0.04, Math.PI / 2);
  const landmarks: Landmarks = {
    incisalMid: ant ? [0, (top(Math.PI / 2)[1] + top(-Math.PI / 2)[1]) / 2, top(Math.PI / 2)[2]] : maxCusp,
    facialEdge: ant ? top(Math.PI / 2) : facialCusp,
    lingualEdge: ant ? top(-Math.PI / 2) : lingualCusp,
    mesialContact: P(vContact, Math.PI),
    distalContact: P(vContact, 0),
    cervicalFacial: [ant && (ref.type === "central" || ref.type === "canine") ? a0 * 0.08 : 0, cz[1], cz[2]],
    cervicalCenter: [0, yfOf(0) - tOf(0) / 2, 0],
    cusps: cuspPts,
    mesialRidge: P(1, Math.PI), distalRidge: P(1, 0),
    mesialAngle: top(Math.PI * 0.88),
    distalAngle: top(Math.PI * 0.12),
    anchor: [0, 0, 0],
  };
  landmarks.anchor = ant ? [0, landmarks.incisalMid[1], landmarks.incisalMid[2]] : [0, (facialCusp[1] + lingualCusp[1]) / 2, hWall + cuspH * 0.55];
  return { fdi: ref.fdi, dims: { md: a0 * 2, bl, h }, mesh, landmarks };
}
