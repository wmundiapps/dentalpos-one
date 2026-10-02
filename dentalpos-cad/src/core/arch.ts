// Forma de arco + posicionamento dos dentes (Andrews, Spee, Wilson, overjet/overbite).
// Referencial do mundo: x = direita→esquerda do paciente (+esquerda), y = anterior (+), z = superior (+).
// Borda incisal inferior em z≈0 (plano oclusal); y=0 no ponto anterior da curva dos incisivos inferiores.
import { type Vec3, type Mat3, mMul, rotX, rotY, rotZ, mApply, add, sub, clamp, dist } from "./math";
import { ANDREWS_NORMS, OVERBITE_TAPER, type Jaw, type ToothRef, type Landmarks, toothRef } from "./anatomy";

export type ArchForm = "ovoid" | "square" | "tapered";
export const ARCH_FORM_LABEL: Record<ArchForm, string> = { ovoid: "Ovoide", square: "Quadrada", tapered: "Triangular" };
const FORM_K: Record<ArchForm, number> = { ovoid: 3.3, square: 4.3, tapered: 2.4 };

export interface ArchParams {
  form: ArchForm;
  /** largura intermolar (mm) entre centros das coroas dos 1ºs molares */
  width: number;
  /** profundidade (mm) dos incisivos ao centro dos 1ºs molares */
  depth: number;
}
export const DEFAULT_ARCH: Record<Jaw, ArchParams> = {
  upper: { form: "ovoid", width: 52, depth: 34 },
  lower: { form: "ovoid", width: 47, depth: 31 },
};

const sgn = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;
type Pt = [number, number];
/** superelipse frontal: φ=0 anterior (0,0); φ=π/2 = ponto lateral extremo (A,-B). */
const superPoint = (A: number, B: number, k: number, phi: number): Pt => [A * sgn(Math.sin(phi), 2 / k), B * (sgn(Math.cos(phi), 2 / k) - 1)];

interface ArcTable { phis: Float64Array; xs: Float64Array; ys: Float64Array; cum: Float64Array }
function makeTable(A: number, B: number, k: number, n: number): ArcTable {
  const phis = new Float64Array(n + 1), xs = new Float64Array(n + 1), ys = new Float64Array(n + 1), cum = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    // amostragem mais densa perto do ponto lateral extremo, onde a curvatura muda rápido
    const phi = (Math.PI / 2) * (i / n);
    const p = superPoint(A, B, k, phi);
    phis[i] = phi; xs[i] = p[0]; ys[i] = p[1];
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { phis, xs, ys, cum };
}
function tableAt(t: ArcTable, s: number): { phi: number; pt: Pt; dir: Pt } {
  const n = t.cum.length - 1;
  const ss = Math.min(Math.max(s, 0), t.cum[n]);
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.cum[m] <= ss) lo = m; else hi = m; }
  const seg = t.cum[hi] - t.cum[lo] || 1, f = (ss - t.cum[lo]) / seg;
  const dx = t.xs[hi] - t.xs[lo], dy = t.ys[hi] - t.ys[lo], l = Math.hypot(dx, dy) || 1;
  return { phi: t.phis[lo] + (t.phis[hi] - t.phis[lo]) * f, pt: [t.xs[lo] + dx * f, t.ys[lo] + dy * f], dir: [dx / l, dy / l] };
}
function arcTo(A: number, B: number, k: number, target: number) { const r = tableAt(makeTable(A, B, k, 200), target); return { phi: r.phi, pt: r.pt }; }

/** Ajusta (A,B) para que o ponto a `arcM1` mm da linha média caia em (width/2, -depth). */
export function fitArch(p: ArchParams, arcM1: number): { A: number; B: number; k: number } {
  const k = FORM_K[p.form];
  let best = { A: p.width / 2 + 2, B: p.depth + 8, e: Infinity };
  const search = (A0: number, A1: number, B0: number, B1: number, n: number) => {
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const A = A0 + ((A1 - A0) * i) / n, B = B0 + ((B1 - B0) * j) / n;
      const { pt } = arcTo(A, B, k, arcM1);
      const e = (pt[0] - p.width / 2) ** 2 + (pt[1] + p.depth) ** 2;
      if (e < best.e) best = { A, B, e };
    }
  };
  search(p.width / 2, p.width / 2 + 14, p.depth, p.depth + 30, 24);
  const a = best.A, b = best.B;
  search(a - 1, a + 1, b - 1.2, b + 1.2, 16);
  return { A: best.A, B: best.B, k };
}

export interface ArchSlot { x: number; y: number; tangent: number; arcPos: number }
const fitCache = new Map<string, { A: number; B: number; k: number }>();
/** Posição (x,y) e tangente de cada dente ao longo do arco, empacotando os dentes em contato (ponto de contato distal = mesial do vizinho). */
export function layoutArch(jaw: Jaw, widths: Map<number, number>, arch: ArchParams): Map<number, ArchSlot> {
  const out = new Map<number, ArchSlot>();
  const list = [...widths.keys()].map(toothRef).filter((r) => r.jaw === jaw);
  const side = (s: "R" | "L") => list.filter((r) => r.side === s).sort((a, b) => a.index - b.index);
  const nominal = (r: ToothRef) => { let s = 0; for (const t of side(r.side)) if (t.index < r.index) s += widths.get(t.fdi)!; return s + widths.get(r.fdi)! / 2; };
  const m1 = ["R", "L"].flatMap((sd) => side(sd as "R" | "L").filter((t) => t.index === 6)).map(nominal);
  const m1Arc = m1.length ? m1.reduce((a, b) => a + b) / m1.length : [...widths.values()].reduce((a, b) => a + b, 0) / 2 * 0.95;
  const key = `${arch.form}|${arch.width}|${arch.depth}|${m1Arc.toFixed(2)}`;
  let fit = fitCache.get(key);
  if (!fit) { fit = fitArch(arch, m1Arc); if (fitCache.size > 200) fitCache.clear(); fitCache.set(key, fit); }
  const tab = makeTable(fit.A, fit.B, fit.k, 1200);
  const frame = (s: number) => { const r = tableAt(tab, s); return { pt: r.pt, dir: r.dir }; }; // dir = sentido posterior (lado esquerdo, x>0)
  for (const sd of ["R", "L"] as const) {
    const sign = sd === "L" ? 1 : -1;
    let prevDistal: [number, number] | null = null;
    let prevS = 0;
    for (const r of side(sd)) {
      const w = widths.get(r.fdi)!;
      // pontos de contato em função de s (coordenadas do mundo; lado R espelhado)
      const contacts = (s: number) => {
        const f = frame(s);
        const P: [number, number] = [sign * f.pt[0], f.pt[1]];
        const D: [number, number] = [sign * f.dir[0], f.dir[1]]; // sentido distal no mundo
        return { P, D, mes: [P[0] - (w / 2) * D[0], P[1] - (w / 2) * D[1]] as [number, number], dis: [P[0] + (w / 2) * D[0], P[1] + (w / 2) * D[1]] as [number, number] };
      };
      const err = (s: number) => { const c = contacts(s); return prevDistal ? Math.hypot(c.mes[0] - prevDistal[0], c.mes[1] - prevDistal[1]) : Math.abs(c.mes[0]); };
      let lo = prevDistal ? prevS : 0, hi = (prevDistal ? prevS : 0) + w * 1.2 + 4;
      if (!prevDistal) { lo = w * 0.3; hi = w * 0.9; }
      for (let i = 0; i < 40; i++) { const m1_ = lo + (hi - lo) / 3, m2_ = hi - (hi - lo) / 3; if (err(m1_) < err(m2_)) hi = m2_; else lo = m1_; }
      const s = (lo + hi) / 2;
      const c = contacts(s);
      // tangente (direita→esquerda): lado L = dir; lado R = −dir espelhado → (dx,−dy)
      const f = frame(s);
      const tangent = sd === "L" ? Math.atan2(f.dir[1], f.dir[0]) : Math.atan2(-f.dir[1], f.dir[0]);
      out.set(r.fdi, { x: c.P[0], y: c.P[1], tangent, arcPos: sign * s });
      prevDistal = c.dis; prevS = s;
    }
  }
  return out;
}

export interface ToothAdjust {
  dx?: number; dy?: number; dz?: number; // mm (dx: p/ esquerda do paciente, dy: anterior, dz: superior)
  tip?: number; torque?: number; rotation?: number; // graus, somados à norma de Andrews
  scale?: number; // fator uniforme
  scaleMd?: number; scaleH?: number; // fatores independentes (largura/altura)
}
export interface OcclusionParams {
  overjet: number;
  overbite: number;
  speeRadius: number; // mm; Infinity = plano
  wilsonRadius: number;
  molarOffset: number; // Classe II (+) / Classe III (−): deslocamento ântero-posterior do inferior posterior, mm
}
export const DEFAULT_OCCLUSION: OcclusionParams = { overjet: 2.5, overbite: 2.5, speeRadius: 135, wilsonRadius: 220, molarOffset: 0 };

export interface Pose {
  /** posição mundial do ponto de ancoragem */
  anchorW: Vec3;
  /** R·M — transforma (p − anchorLocal) do referencial do dente (x distal) para o mundo */
  R: Mat3;
  tip: number; torque: number; rotation: number;
  arcPos: number;
  archTangent: number;
  jaw: Jaw;
}

/** referencial base do arco no dente: colunas (distal, facial, oclusal) + flag de espelhamento */
function baseFrame(r: ToothRef, tangent: number): { B: Mat3; mirror: boolean } {
  const T: Vec3 = [Math.cos(tangent), Math.sin(tangent), 0];
  const N: Vec3 = [-Math.sin(tangent), Math.cos(tangent), 0];
  const d: Vec3 = r.side === "L" ? T : [-T[0], -T[1], 0];
  const o: Vec3 = r.jaw === "lower" ? [0, 0, 1] : [0, 0, -1];
  const sideSign = r.side === "L" ? 1 : -1, oz = r.jaw === "lower" ? 1 : -1;
  const mirror = sideSign * oz < 0;
  const xcol: Vec3 = mirror ? [-d[0], -d[1], 0] : d;
  // colunas: xcol, N, o
  const B: Mat3 = [xcol[0], N[0], o[0], xcol[1], N[1], o[1], xcol[2], N[2], o[2]];
  return { B, mirror };
}
const mirrorM = (m: boolean): Mat3 => [m ? -1 : 1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface PoseInputs {
  fdis: number[];
  dimsOf: (r: ToothRef) => { md: number; bl: number; h: number };
  landmarksOf: (fdi: number) => Landmarks;
  arches: Record<Jaw, ArchParams>;
  occlusion: OcclusionParams;
  adjust: Record<number, ToothAdjust>;
  applyAndrews?: boolean;
  /** deslocamento vertical extra de borda (mm, + = mais cervical) por tipo de dente (degrau lateral/canino) */
  edgeOffset?: (r: ToothRef) => number;
}
export interface PoseResult {
  poses: Map<number, Pose>;
  dims: Map<number, { md: number; bl: number; h: number }>;
  mirror: Map<number, boolean>;
  /** deslocamento aplicado ao arco inferior em y para atingir o overjet */
  lowerShiftY: number;
}

export function localRot(tip: number, torque: number, rotation: number): Mat3 {
  return mMul(rotY(-tip), mMul(rotX(-torque), rotZ(rotation)));
}

export function buildPoses(o: PoseInputs): PoseResult {
  const dims = new Map<number, { md: number; bl: number; h: number }>();
  const widths = new Map<number, number>();
  for (const f of o.fdis) {
    const r = toothRef(f), d = o.dimsOf(r), a = o.adjust[f] ?? {};
    const sc = a.scale ?? 1;
    const dd = { md: d.md * sc * (a.scaleMd ?? 1), bl: d.bl * sc, h: d.h * sc * (a.scaleH ?? 1) };
    dims.set(f, dd); widths.set(f, dd.md);
  }
  const poses = new Map<number, Pose>();
  const mirror = new Map<number, boolean>();
  const oc = o.occlusion;
  const arcShift = new Map<number, number>();
  const build = (lowerShiftY: number, userShift = true) => {
    for (const jaw of ["upper", "lower"] as Jaw[]) {
      const lay = layoutArch(jaw, new Map([...widths].filter(([f]) => toothRef(f).jaw === jaw)), o.arches[jaw]);
      const archLen = Math.max(1, o.arches[jaw].depth);
      const speeLen = archLen + 4; // distância ântero-posterior de referência (incisivo → 2º molar)
      for (const [fdi, p] of lay) {
        const r = toothRef(fdi);
        const adj = o.adjust[fdi] ?? {};
        const norm = ANDREWS_NORMS[jaw][r.type];
        const useA = o.applyAndrews !== false;
        const tip = (useA ? norm.tip : 0) + (adj.tip ?? 0);
        const torque = (useA ? norm.torque : 0) + (adj.torque ?? 0);
        const rotation = adj.rotation ?? 0;
        const { B, mirror: mir } = baseFrame(r, p.tangent);
        const R = mMul(B, mMul(mirrorM(mir), localRot(tip, torque, rotation)));
        const ap = Math.max(0, -p.y);
        const ap0 = speeLen / 2;
        const spee = isFinite(oc.speeRadius) ? ((ap - ap0) ** 2 - ap0 ** 2) / (2 * oc.speeRadius) : 0;
        const wilson = isFinite(oc.wilsonRadius) && r.index >= 4 ? (p.x * p.x) / (2 * oc.wilsonRadius) : 0;
        const taper = OVERBITE_TAPER[r.type];
        const eo = o.edgeOffset ? o.edgeOffset(r) : 0;
        const z = spee + wilson + (jaw === "upper" ? -oc.overbite * taper + eo : eo);
        const lowerWeight = jaw === "lower" ? 1 : 0;
        const molarShift = jaw === "lower" ? -oc.molarOffset * clamp((r.index - 3) / 3, 0, 1) : 0;
        const y = p.y + lowerWeight * lowerShiftY + molarShift;
        const sh = arcShift.get(fdi) ?? 0, dH: Vec3 = [Math.cos(p.tangent) * (r.side === "L" ? 1 : -1), Math.sin(p.tangent) * (r.side === "L" ? 1 : -1), 0];
        poses.set(fdi, { anchorW: [p.x + sh * dH[0] + (userShift ? adj.dx ?? 0 : 0), y + sh * dH[1] + (userShift ? adj.dy ?? 0 : 0), z + (userShift ? adj.dz ?? 0 : 0)], R, tip, torque, rotation, arcPos: p.arcPos, archTangent: p.tangent, jaw });
        mirror.set(fdi, mir);
      }
    }
  };
  build(0, false);
  // resolve o overjet no plano dos incisivos centrais (borda vestibular superior − inferior)
  let shift = 0;
  const cu = [11, 21].filter((f) => poses.has(f)), cl = [31, 41].filter((f) => poses.has(f));
  if (cu.length && cl.length) {
    const facialY = (f: number) => { const w = worldPoint(poses.get(f)!, mirror.get(f)!, o.landmarksOf(f), o.landmarksOf(f).facialEdge); return w[1]; };
    const up = cu.reduce((s, f) => s + facialY(f), 0) / cu.length;
    const lo = cl.reduce((s, f) => s + facialY(f), 0) / cl.length;
    shift = up - lo - oc.overjet;
    build(shift, false);
  }
  // fechamento de contatos: corrige resíduos medidos nos marcos reais (3 iterações)
  const lmW = (f: number) => { const lm = o.landmarksOf(f), ps = poses.get(f)!; return { mes: worldPoint(ps, mirror.get(f)!, lm, lm.mesialContact), dis: worldPoint(ps, mirror.get(f)!, lm, lm.distalContact), d: mApply(ps.R, [1, 0, 0] as Vec3) }; };
  for (let it = 0; it < 3; it++) {
    for (const jaw of ["upper", "lower"] as Jaw[]) for (const sd of ["R", "L"] as const) {
      const list = o.fdis.map(toothRef).filter((r) => r.jaw === jaw && r.side === sd).sort((a, b) => a.index - b.index);
      let delta = 0;
      list.forEach((r, i) => {
        const cur = lmW(r.fdi);
        let g: number;
        if (i === 0) g = cur.mes[0] * cur.d[0] * (r.side === "L" ? 1 : -1) * (r.side === "L" ? 1 : -1);
        else { const pv = lmW(list[i - 1].fdi); const dx = cur.d[0] + pv.d[0], dy = cur.d[1] + pv.d[1], l = Math.hypot(dx, dy) || 1; g = ((cur.mes[0] - pv.dis[0]) * dx + (cur.mes[1] - pv.dis[1]) * dy) / l; }
        if (i === 0) { const dl = Math.hypot(cur.d[0], cur.d[1]) || 1; g = (cur.mes[0] * cur.d[0]) / dl; }
        delta -= g;
        arcShift.set(r.fdi, (arcShift.get(r.fdi) ?? 0) + delta * 0.9);
        void dist;
      });
    }
    build(shift, false);
  }
  build(shift, true);
  return { poses, dims, mirror, lowerShiftY: shift };
}

/** converte ponto do referencial local do dente (x distal) para o mundo */
export function worldPoint(pose: Pose, mirror: boolean, lm: Landmarks, p: Vec3): Vec3 {
  void mirror; // o espelhamento já está embutido em pose.R (R = B·M·Rloc)
  return add(pose.anchorW, mApply(pose.R, sub(p, lm.anchor)));
}
