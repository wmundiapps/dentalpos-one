// Medições clínicas sobre os marcos no mundo (independentes da forma como o dente foi movido).
import { type Vec3, dot, sub, len, toDeg, round, norm } from "./math";
import { ANDREWS_NORMS, toothRef } from "./anatomy";
import type { Evaluated, WorldTooth } from "./project";

export interface ContactGap { a: number; b: number; gap: number } // gap<0 = sobreposição
export interface Measurements {
  overjet: number | null;
  overbite: number | null;
  overbitePct: number | null;
  speeDepth: { R: number | null; L: number | null; max: number | null };
  wilsonRadius: number | null;
  upperMidlineX: number | null; lowerMidlineX: number | null; midlineDev: number | null;
  molar: { R: number | null; L: number | null };
  canine: { R: number | null; L: number | null };
  crossbite: number[]; // fdi com mordida cruzada posterior
  bolton: { anterior: number | null; overall: number | null };
  contacts: ContactGap[];
  /** largura aparente (projeção frontal) 11/12/13 e 21/22/23 */
  apparent: Record<number, number>;
  /** altura de coroa e largura real */
  trueDims: Record<number, { md: number; h: number }>;
  tipErr: Record<number, number>; torqueErr: Record<number, number>; rotation: Record<number, number>;
  zenith: Record<number, number>; edgeZ: Record<number, number>;
  archWidthIntercanine: { upper: number | null; lower: number | null };
  archWidthIntermolar: { upper: number | null; lower: number | null };
}

const get = (ev: Evaluated, f: number): WorldTooth | undefined => ev.teeth.get(f);
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** Ajuste de círculo (mínimos quadrados algébricos de Kåsa) no plano xz. */
export function fitCircleXZ(pts: Vec3[]): { r: number; cx: number; cz: number } | null {
  if (pts.length < 3) return null;
  let sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sxxx = 0, szzz = 0, sxzz = 0, szxx = 0;
  const n = pts.length;
  for (const [x, , z] of pts) { sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; sxxx += x ** 3; szzz += z ** 3; sxzz += x * z * z; szxx += z * x * x; }
  const A = n * sxx - sx * sx, B = n * sxz - sx * sz, C = n * szz - sz * sz;
  const D = 0.5 * (n * sxzz + n * sxxx - sx * (szz + sxx)), E = 0.5 * (n * szxx + n * szzz - sz * (sxx + szz));
  const den = A * C - B * B;
  if (Math.abs(den) < 1e-9) return null;
  const cx = (D * C - B * E) / den, cz = (A * E - B * D) / den;
  const r = Math.sqrt(Math.max(0, (sxx + szz) / n - 2 * cx * (sx / n) - 2 * cz * (sz / n) + cx * cx + cz * cz));
  return { r, cx, cz };
}

export function measure(ev: Evaluated): Measurements {
  const T = (f: number) => get(ev, f);
  const present = (...f: number[]) => f.map(T).filter((t): t is WorldTooth => !!t);
  const uc = present(11, 21), lc = present(31, 41);
  const overjet = uc.length && lc.length ? avg(uc.map((t) => t.lm.facialEdge[1]))! - avg(lc.map((t) => t.lm.facialEdge[1]))! : null;
  const overbite = uc.length && lc.length ? avg(lc.map((t) => t.lm.incisalMid[2]))! - avg(uc.map((t) => t.lm.incisalMid[2]))! : null;
  const lowCentralH = lc.length ? avg(lc.map((t) => t.dims.h))! : null;
  const overbitePct = overbite !== null && lowCentralH ? (overbite / lowCentralH) * 100 : null;

  // Spee: linha entre borda do incisivo inferior e ponta distal do último molar; profundidade = maior afastamento
  const spee = (side: "R" | "L") => {
    const q = side === "R" ? 4 : 3;
    const list = [1, 2, 3, 4, 5, 6, 7].map((i) => T(q * 10 + i)).filter((t): t is WorldTooth => !!t);
    if (list.length < 4) return null;
    const pts = list.map((t) => (t.ref.index >= 4 ? t.lm.cusps.reduce((m, c) => (c[2] > m[2] ? c : m)) : t.lm.incisalMid));
    const u: number[] = [0];
    for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const z0 = pts[0][2], z1 = pts[pts.length - 1][2], L = u[u.length - 1] || 1;
    let depth = -Infinity;
    pts.forEach((p, i) => { const lineZ = z0 + ((z1 - z0) * u[i]) / L; depth = Math.max(depth, lineZ - p[2]); });
    return depth;
  };
  const sR = spee("R"), sL = spee("L");
  const speeMax = sR === null && sL === null ? null : Math.max(sR ?? -Infinity, sL ?? -Infinity);

  // Wilson: círculo pelas pontas de cúspide vestibular/lingual dos 1ºs molares inferiores
  const pts: Vec3[] = [];
  for (const f of [36, 46]) { const t = T(f); if (t) { pts.push(t.lm.facialEdge, t.lm.lingualEdge); } }
  const wc = fitCircleXZ(pts);
  const wilsonRadius = wc ? wc.r : null;

  const mid = (f1: number, f2: number) => { const a = T(f1), b = T(f2); return a && b ? (a.lm.mesialContact[0] + b.lm.mesialContact[0]) / 2 : null; };
  const upperMidlineX = mid(11, 21), lowerMidlineX = mid(31, 41);
  const midlineDev = upperMidlineX !== null && lowerMidlineX !== null ? upperMidlineX - lowerMidlineX : null;

  // relação molar de Andrews: cúspide MV do 16/26 vs sulco entre cúspides V e médio-V do 46/36 ao longo do eixo mesiodistal inferior
  const molarSide = (up: number, lo: number) => {
    const u = T(up), l = T(lo);
    if (!u || !l || l.lm.cusps.length < 2) return null;
    const mb = u.lm.cusps[0];
    const groove: Vec3 = [(l.lm.cusps[0][0] + l.lm.cusps[1][0]) / 2, (l.lm.cusps[0][1] + l.lm.cusps[1][1]) / 2, (l.lm.cusps[0][2] + l.lm.cusps[1][2]) / 2];
    const d = norm([l.distal[0], l.distal[1], 0]);
    return dot(sub(mb, groove), d);
  };
  const canineSide = (up: number, lo: number, lo2: number) => {
    const u = T(up), l = T(lo), l2 = T(lo2);
    if (!u || !l || !l2) return null;
    const emb: Vec3 = [(l.lm.distalContact[0] + l2.lm.mesialContact[0]) / 2, (l.lm.distalContact[1] + l2.lm.mesialContact[1]) / 2, 0];
    const d = norm([l.distal[0], l.distal[1], 0]);
    return dot(sub(u.lm.incisalMid, emb), d);
  };
  const crossbite: number[] = [];
  for (const [u, l] of [[14, 44], [15, 45], [16, 46], [17, 47], [24, 34], [25, 35], [26, 36], [27, 37]]) {
    const a = T(u), b = T(l);
    if (a && b && Math.abs(a.lm.facialEdge[0]) < Math.abs(b.lm.facialEdge[0]) - 0.2) crossbite.push(u);
  }
  const sumMd = (fdis: number[]) => fdis.reduce((s, f) => s + (T(f)?.dims.md ?? 0), 0);
  const upA = sumMd([13, 12, 11, 21, 22, 23]), loA = sumMd([33, 32, 31, 41, 42, 43]);
  const upO = sumMd([16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26]), loO = sumMd([46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36]);
  const bolton = { anterior: upA > 0 && loA > 0 ? (loA / upA) * 100 : null, overall: upO > 0 && loO > 0 ? (loO / upO) * 100 : null };

  const contacts: ContactGap[] = [];
  for (const jaw of ["upper", "lower"] as const) for (const sd of ["R", "L"] as const) {
    const list = [...ev.teeth.values()].filter((t) => t.ref.jaw === jaw && t.ref.side === sd).sort((a, b) => a.ref.index - b.ref.index);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (b.ref.index !== a.ref.index + 1) continue;
      const dx = a.distal[0] + b.distal[0], dy = a.distal[1] + b.distal[1], l = Math.hypot(dx, dy) || 1;
      contacts.push({ a: a.fdi, b: b.fdi, gap: round(((b.lm.mesialContact[0] - a.lm.distalContact[0]) * dx + (b.lm.mesialContact[1] - a.lm.distalContact[1]) * dy) / l, 2) });
    }
  }
  for (const [r, l] of [[11, 21], [31, 41]]) { const a = T(r), b = T(l); if (a && b) contacts.push({ a: r, b: l, gap: round(b.lm.mesialContact[0] - a.lm.mesialContact[0], 2) }); }

  const apparent: Record<number, number> = {}, trueDims: Record<number, { md: number; h: number }> = {};
  const tipErr: Record<number, number> = {}, torqueErr: Record<number, number> = {}, rotation: Record<number, number> = {}, zenith: Record<number, number> = {}, edgeZ: Record<number, number> = {};
  for (const t of ev.teeth.values()) {
    apparent[t.fdi] = Math.abs(t.lm.distalContact[0] - t.lm.mesialContact[0]);
    trueDims[t.fdi] = { md: t.dims.md, h: t.dims.h };
    const n = ANDREWS_NORMS[t.ref.jaw][t.ref.type];
    tipErr[t.fdi] = round(t.pose.tip - n.tip, 1); torqueErr[t.fdi] = round(t.pose.torque - n.torque, 1); rotation[t.fdi] = t.pose.rotation;
    zenith[t.fdi] = t.lm.cervicalCenter[2]; edgeZ[t.fdi] = t.lm.incisalMid[2];
  }
  const dxw = (a: number, b: number) => { const x = T(a), y = T(b); return x && y ? len([x.lm.incisalMid[0] - y.lm.incisalMid[0], x.lm.incisalMid[1] - y.lm.incisalMid[1], 0]) : null; };
  return {
    overjet, overbite, overbitePct, speeDepth: { R: sR, L: sL, max: speeMax }, wilsonRadius, upperMidlineX, lowerMidlineX, midlineDev,
    molar: { R: molarSide(16, 46), L: molarSide(26, 36) }, canine: { R: canineSide(13, 43, 44), L: canineSide(23, 33, 34) }, crossbite, bolton, contacts, apparent, trueDims, tipErr, torqueErr, rotation, zenith, edgeZ,
    archWidthIntercanine: { upper: dxw(13, 23), lower: dxw(33, 43) }, archWidthIntermolar: { upper: dxw(16, 26), lower: dxw(36, 46) },
  };
}
export { toDeg, toothRef };
