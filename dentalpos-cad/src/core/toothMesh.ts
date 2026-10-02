// Gerador paramétrico de coroas dentárias (malha estanque). Referencial local:
//   x = mésio→distal (+distal), y = vestibular (+), z = cervical(0) → oclusal/incisal (+h)
import { type Vec3, clamp, lerp, smoothstep } from "./math";
import { type Landmarks, type ToothDims, type ToothRef, isAnterior } from "./anatomy";
import { type Mesh, computeNormals, volume } from "./mesh";
import type { StyleModifiers } from "./profiles";

export interface ToothShapeInput {
  ref: ToothRef;
  dims: ToothDims;
  mods: StyleModifiers;
  /** resolução angular (default 40) */
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

interface CuspDef { x: number; y: number; h: number; s: number }
function cuspsFor(ref: ToothRef): CuspDef[] {
  const up = ref.jaw === "upper";
  switch (ref.type) {
    case "premolar1": return up ? [{ x: 0, y: 0.38, h: 1, s: 0.3 }, { x: 0, y: -0.34, h: 0.82, s: 0.27 }] : [{ x: 0, y: 0.2, h: 1, s: 0.3 }, { x: 0.05, y: -0.4, h: 0.35, s: 0.2 }];
    case "premolar2": return up ? [{ x: 0, y: 0.35, h: 0.95, s: 0.3 }, { x: 0, y: -0.32, h: 0.85, s: 0.28 }] : [{ x: 0, y: 0.3, h: 0.95, s: 0.3 }, { x: -0.3, y: -0.36, h: 0.8, s: 0.22 }, { x: 0.32, y: -0.36, h: 0.7, s: 0.22 }];
    case "molar1": return up
      ? [{ x: -0.32, y: 0.34, h: 1, s: 0.24 }, { x: 0.34, y: 0.34, h: 0.9, s: 0.24 }, { x: -0.3, y: -0.34, h: 1, s: 0.26 }, { x: 0.32, y: -0.34, h: 0.7, s: 0.2 }]
      : [{ x: -0.5, y: 0.34, h: 0.95, s: 0.2 }, { x: 0, y: 0.38, h: 0.9, s: 0.2 }, { x: 0.5, y: 0.32, h: 0.75, s: 0.19 }, { x: -0.3, y: -0.36, h: 1, s: 0.22 }, { x: 0.32, y: -0.34, h: 0.95, s: 0.22 }];
    case "molar2": return up
      ? [{ x: -0.3, y: 0.34, h: 0.95, s: 0.24 }, { x: 0.32, y: 0.34, h: 0.85, s: 0.24 }, { x: -0.3, y: -0.34, h: 0.95, s: 0.24 }, { x: 0.32, y: -0.34, h: 0.55, s: 0.2 }]
      : [{ x: -0.3, y: 0.34, h: 0.95, s: 0.26 }, { x: 0.32, y: 0.34, h: 0.9, s: 0.26 }, { x: -0.3, y: -0.34, h: 0.95, s: 0.26 }, { x: 0.32, y: -0.34, h: 0.9, s: 0.26 }];
    case "molar3": return [{ x: -0.3, y: 0.3, h: 0.8, s: 0.28 }, { x: 0.3, y: 0.3, h: 0.7, s: 0.28 }, { x: -0.25, y: -0.3, h: 0.8, s: 0.28 }, { x: 0.3, y: -0.3, h: 0.6, s: 0.25 }];
    default: return [];
  }
}

export function generateTooth(inp: ToothShapeInput): ToothModel {
  const { ref, mods } = inp;
  const ant = isAnterior(ref.type);
  const NT = inp.segments ?? 40;
  const a0 = inp.dims.md / 2;
  const bl = inp.dims.bl * (ant ? 1 : 1);
  const h = inp.dims.h;
  const n = mods.squareness;
  const conv = mods.labialConvexity;
  const wearMM = mods.wear * (ant ? 1.2 : 0.5);

  const cusps = cuspsFor(ref);
  const cuspH = ant ? 0 : (ref.type.startsWith("premolar") ? 1.9 : 2.2) * (0.55 + mods.cuspRelief * 0.6) * (1 - mods.wear * 0.5);
  const hWall = ant ? h - wearMM : h - cuspH;
  const edgeT = clamp(1.1 + mods.wear * 0.9, 1, 2.2); // espessura da borda incisal

  // largura e espessura em função da altura relativa v (0 cervical … 1 oclusal)
  const aOf = (v: number) => {
    const cerv = ant ? mods.cervicalRatio : lerp(0.8, mods.cervicalRatio, 0.35);
    const up = ant ? smoothstep(0, 0.78, v) : smoothstep(0, 0.65, v);
    let a = a0 * lerp(cerv, 1, up);
    if (ant) a *= 1 - 0.1 * smoothstep(0.88, 1, v) * mods.cornerRounding;
    if (!ant) a *= 1 - 0.1 * smoothstep(0.8, 1, v);
    return a;
  };
  const tOf = (v: number) => {
    if (ant) {
      const taper = (1 - smoothstep(0.18, 1, v)) ** 1.15;
      const base = edgeT + (bl - edgeT) * taper;
      return base * lerp(0.78, 1, smoothstep(0, 0.14, v));
    }
    return bl * lerp(0.82, 1, smoothstep(0, 0.2, v)) * (1 - 0.2 * smoothstep(0.55, 1, v));
  };
  const yfOf = (v: number) => {
    const bulge = Math.sin(Math.PI * clamp(v / 0.55, 0, 1)) * 0.07 * conv * bl;
    if (ant) return bl * 0.5 - 0.12 * v * bl * (1 - conv * 0.6) + bulge;
    return bl * 0.5 * (1 - 0.1 * smoothstep(0.6, 1, v)) + bulge * 0.7;
  };
  const dMax = clamp((ant ? 0.35 : 0) + mods.cornerRounding * 1.4, 0, 2.2);
  // queda da borda incisal em função de x: ângulos arredondados (incisivos) ou ponta de cúspide (canino)
  const dropAt = (x: number) => {
    if (!ant) return 0;
    const r = x / a0; // -1 mesial … +1 distal
    if (ref.type === "canine") {
      const k = r < 0 ? mods.cuspDrop * 0.75 : mods.cuspDrop * 1.15;
      return k * Math.abs(r) ** 1.15;
    }
    const k = r < 0 ? dMax * 0.65 : dMax * 1.0 * (ref.type === "lateral" ? 1.25 : 1);
    return k * Math.abs(r) ** (ref.type === "lateral" ? 2.6 : 3.2);
  };
  const mamelonAt = (x: number) => (ant && ref.type !== "canine" ? mods.mamelon * Math.max(0, Math.cos((x / a0) * 3 * Math.PI * 0.5)) ** 2 * 0.7 : 0);
  // campo oclusal (posteriores)
  const field = (x: number, y: number, yc: number) => {
    if (ant) return 0;
    const a = a0, b = bl / 2;
    let f = 0;
    for (const c of cusps) {
      const dx = (x - c.x * a) / (c.s * a * 1.6), dy = (y - (yc + c.y * b)) / (c.s * b * 1.9);
      f += c.h * Math.exp(-(dx * dx + dy * dy) / 2);
    }
    f = Math.min(f, 1.05);
    const ridge = 0.32 * Math.abs(x / a) ** 3;
    const groove = 0.5 * Math.exp(-((y - yc) ** 2) / (2 * (0.13 * bl) ** 2)) * (1 - Math.abs(x / a) ** 5);
    const fossa = 0.12 * mods.cuspRelief;
    return cuspH * clamp(f + ridge - groove - fossa * 0 , 0, 1.1) * 0.92;
  };

  const slope = ant ? 0 : -Math.tan(((inp.occlusalTilt ?? 0) * Math.PI) / 180);
  const V = 16;
  const C = ant ? 4 : 8;
  const positions: number[] = [];
  const ringStart: number[] = [];
  const ringPoint = (v: number, th: number, s = 1, capMode = false): Vec3 => {
    const c = Math.cos(th), sn = Math.sin(th);
    const vv = capMode ? 1 : v;
    const a = aOf(vv), yf = yfOf(vv), t = tOf(vv);
    const yc = yf - t / 2;
    const x = a * sgnpow(c, 2 / n) * s;
    let y = yc + (t / 2) * sgnpow(sn, 2 / Math.max(2, n * 0.8)) * s;
    // lóbulos de desenvolvimento na face vestibular dos anteriores (sulcos suaves)
    if (ant && sn > 0 && !capMode) y += 0.1 * conv * (0.5 + 0.5 * Math.cos((3 * Math.PI * x) / a0)) * smoothstep(0.25, 0.85, v) * sn;
    let z: number;
    if (ant) {
      const zBase = v * hWall;
      const drop = dropAt(x) * smoothstep(0.3, 1, vv) ** 1.4;
      z = zBase - drop + mamelonAt(x) * smoothstep(0.7, 1, vv);
      if (capMode) z = hWall - dropAt(x) + mamelonAt(x);
      // junção amelocementária: margem cervical sobe nas faces proximais
      z += 1.1 * (1 - smoothstep(0, 0.32, vv)) * Math.abs(x / a0) ** 2;
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
  // anéis da tampa (v=1 já existe como último anel; para posteriores, o anel v=1 usa campo → substitui por capMode)
  const lastWall = ringStart[V];
  // reescreve o último anel com capMode para continuidade
  for (let j = 0; j < NT; j++) { const p = ringPoint(1, (j / NT) * Math.PI * 2, 1, true); positions[(lastWall + j) * 3] = p[0]; positions[(lastWall + j) * 3 + 1] = p[1]; positions[(lastWall + j) * 3 + 2] = p[2]; }
  for (let k = 1; k < C; k++) {
    ringStart.push(positions.length / 3);
    const s = 1 - k / C;
    for (let j = 0; j < NT; j++) positions.push(...ringPoint(1, (j / NT) * Math.PI * 2, s, true));
  }
  // vértice central da tampa e do fundo
  const topC = positions.length / 3;
  const yc1 = yfOf(1) - tOf(1) / 2;
  positions.push(0, yc1, ant ? hWall + mamelonAt(0) : hWall + field(0, yc1, yc1));
  const botC = positions.length / 3;
  positions.push(0, yfOf(0) - tOf(0) / 2, 0);

  const idx: number[] = [];
  const nRings = ringStart.length; // V+1 + (C-1)
  for (let r = 0; r < nRings - 1; r++) {
    const A = ringStart[r], B = ringStart[r + 1];
    for (let j = 0; j < NT; j++) {
      const j2 = (j + 1) % NT;
      idx.push(A + j, A + j2, B + j, A + j2, B + j2, B + j);
    }
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
  else cuspPts = cusps.map((c) => { const x = c.x * a0, y = yc1 + c.y * (bl / 2); return [x, y, hWall + field(x, y, yc1) + slope * (y - yc1)] as Vec3; });
  const maxCusp = cuspPts.reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[0]);
  const facialCusp = ant ? top(Math.PI / 2) : cuspPts.filter((_, i) => cusps[i].y > 0).reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[0]);
  const lingualCusp = ant ? top(-Math.PI / 2) : cuspPts.filter((_, i) => cusps[i].y < 0).reduce((m, p) => (p[2] > m[2] ? p : m), cuspPts[cuspPts.length - 1]);
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
    mesialAngle: top(Math.PI * 0.88),
    distalAngle: top(Math.PI * 0.12),
    anchor: [0, 0, 0],
  };
  landmarks.anchor = ant ? [0, landmarks.incisalMid[1], landmarks.incisalMid[2]] : [0, (facialCusp[1] + lingualCusp[1]) / 2, hWall + cuspH * 0.55];
  return { fdi: ref.fdi, dims: { md: a0 * 2, bl, h }, mesh, landmarks };
}
