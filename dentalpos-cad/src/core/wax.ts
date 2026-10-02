// Enceramento digital (wax-up), base de modelo/gengiva, bandeja de mockup e escultura de cera (SDF).
import { type Vec3 } from "./math";
import { type Mesh, mergeMeshes } from "./mesh";
import type { Evaluated, WorldTooth } from "./project";
import type { Jaw } from "./anatomy";
import {
  type Grid, gridFor, gridPoint, gidx, gridSize, rasterizeSolid, sdfAnalytic, sdfCylinder, sdfFromOccupancy, sdfIntersect, sdfOffset, sdfSubtract, sdfUnion, surfaceNets,
} from "./voxel";

const teethOf = (ev: Evaluated, jaw: Jaw): WorldTooth[] => [...ev.teeth.values()].filter((t) => t.ref.jaw === jaw).sort((a, b) => a.pose.arcPos - b.pose.arcPos);

/** polilinha do arco (centros das coroas) da direita para a esquerda */
export function archPolyline(ev: Evaluated, jaw: Jaw): Array<[number, number]> {
  return teethOf(ev, jaw).map((t) => [t.lm.anchor[0], t.lm.anchor[1]] as [number, number]);
}
function distToPolyline(p: [number, number], pl: Array<[number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < pl.length - 1; i++) {
    const [ax, ay] = pl[i], [bx, by] = pl[i + 1];
    const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * abx + (p[1] - ay) * aby) / l2));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * abx), p[1] - (ay + t * aby)));
  }
  return best;
}
function insidePolygon(p: [number, number], poly: Array<[number, number]>): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < ((poly[j][0] - poly[i][0]) * (p[1] - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
  }
  return c;
}

export interface JawVolume { grid: Grid; teeth: Float32Array; gum: Float32Array; model: Float32Array; zGum: number; polyline: Array<[number, number]> }

/** Volumes SDF da arcada: dentes (união), gengiva/base e modelo (dentes ∪ gengiva). */
export function buildJawVolume(ev: Evaluated, jaw: Jaw, h = 0.4): JawVolume {
  const ts = teethOf(ev, jaw);
  const meshes = ts.map((t) => t.mesh);
  const grid = gridFor(meshes, h, 12);
  const pl = archPolyline(ev, jaw);
  const apical = jaw === "upper" ? 1 : -1;
  const zc = ts.reduce((s, t) => s + t.lm.cervicalCenter[2], 0) / Math.max(1, ts.length);
  const poly = [...pl, ...pl.slice().reverse().map(([x, y]) => [x * 0.55, y - 4] as [number, number])];
  const teethOcc = rasterizeSolid(grid, meshes);
  const teeth = sdfFromOccupancy(grid, teethOcc);
  const cerv = ts.map((t) => [t.lm.cervicalCenter[0], t.lm.cervicalCenter[1], t.lm.cervicalCenter[2]] as Vec3);
  const gum = sdfAnalytic(grid, (p) => {
    const d2 = distToPolyline([p[0], p[1]], pl);
    const inside = insidePolygon([p[0], p[1]], poly);
    const dxy = inside ? Math.min(0, d2 - 7) : d2 - 7; // base: faixa de 7 mm + preenchimento interno
    // altura da margem gengival: média ponderada dos z cervicais vizinhos
    let wsum = 0, zs = 0;
    for (const c of cerv) { const w = Math.exp(-(((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2) / (2 * 4.5 * 4.5))); wsum += w; zs += w * c[2]; }
    const zTop = (wsum > 1e-6 ? zs / wsum : zc) + apical * 0.8;
    const zBot = zTop + apical * 8;
    const dz = apical === 1 ? Math.max(zTop - p[2], p[2] - zBot) : Math.max(p[2] - zTop, zBot - p[2]);
    return Math.max(dxy, dz);
  });
  return { grid, teeth, gum, model: sdfUnion(teeth, gum), zGum: zc, polyline: pl };
}

export function jawMeshes(v: JawVolume) {
  return { teeth: surfaceNets(v.grid, v.teeth, 1), gingiva: surfaceNets(v.grid, sdfSubtract(v.gum, sdfOffset(v.teeth, -0.01)), 1), model: surfaceNets(v.grid, v.model, 1) };
}

export interface TrayOptions {
  thickness: number; // mm
  gap: number; // folga entre bandeja e modelo (mm)
  coverGingiva: number; // mm de cobertura gengival além do zênite
  vents: boolean;
  ventRadius: number;
  lateralReach: number; // largura da faixa ao redor do arco (mm)
}
export const DEFAULT_TRAY: TrayOptions = { thickness: 2, gap: 0.1, coverGingiva: 2, vents: true, ventRadius: 0.9, lateralReach: 7.5 };

/** Bandeja de mockup (guia de silicone/impressa): casca sobre o enceramento, aberta na base, com respiros de injeção. */
export function buildMockupTray(ev: Evaluated, jaw: Jaw, opts: Partial<TrayOptions> = {}, vol?: JawVolume): { mesh: Mesh; volume: JawVolume } {
  const o = { ...DEFAULT_TRAY, ...opts };
  const v = vol ?? buildJawVolume(ev, jaw);
  const g = v.grid, apical = jaw === "upper" ? 1 : -1;
  const outer = sdfOffset(v.model, o.thickness + o.gap);
  const inner = sdfOffset(v.model, o.gap);
  let shell = sdfSubtract(outer, inner);
  // faixa lateral ao redor do arco
  const band = sdfAnalytic(g, (p) => distToPolyline([p[0], p[1]], v.polyline) - o.lateralReach);
  // corte na base: cobre `coverGingiva` mm além da margem
  const cut = sdfAnalytic(g, (p) => apical === 1 ? p[2] - (v.zGum + apical * o.coverGingiva) : (v.zGum + apical * o.coverGingiva) - p[2]);
  shell = sdfIntersect(sdfIntersect(shell, band), cut);
  if (o.vents) {
    for (const t of teethOf(ev, jaw)) {
      if (t.ref.type === "central" || t.ref.type === "canine") {
        const top = t.lm.incisalMid;
        const dirOcc = jaw === "upper" ? -1 : 1;
        const a: Vec3 = [top[0], top[1], top[2] - dirOcc * 1.5], b: Vec3 = [top[0], top[1], top[2] + dirOcc * (o.thickness + 4)];
        shell = sdfSubtract(shell, sdfCylinder(g, a, b, o.ventRadius));
      }
    }
  }
  return { mesh: surfaceNets(g, shell, 1), volume: v };
}

/** Escultura de cera: adiciona/remove/alisa volume com pincel esférico sobre o SDF do enceramento. */
export class WaxSculpt {
  constructor(public grid: Grid, public sdf: Float32Array) {}
  static fromJaw(v: JawVolume) { return new WaxSculpt(v.grid, new Float32Array(v.teeth)); }
  private region(c: Vec3, r: number) {
    const g = this.grid, h = g.h;
    const i0 = Math.max(0, Math.floor((c[0] - r - g.o[0]) / h)), i1 = Math.min(g.nx - 1, Math.ceil((c[0] + r - g.o[0]) / h));
    const j0 = Math.max(0, Math.floor((c[1] - r - g.o[1]) / h)), j1 = Math.min(g.ny - 1, Math.ceil((c[1] + r - g.o[1]) / h));
    const k0 = Math.max(0, Math.floor((c[2] - r - g.o[2]) / h)), k1 = Math.min(g.nz - 1, Math.ceil((c[2] + r - g.o[2]) / h));
    return { i0, i1, j0, j1, k0, k1 };
  }
  /** adiciona cera (blob esférico suave) */
  add(c: Vec3, r: number) { this.blob(c, r, 1); }
  /** remove cera */
  carve(c: Vec3, r: number) { this.blob(c, r, -1); }
  private blob(c: Vec3, r: number, sign: 1 | -1) {
    const g = this.grid, { i0, i1, j0, j1, k0, k1 } = this.region(c, r + 1);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const p = gridPoint(g, i, j, k), d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r, q = gidx(g, i, j, k), s = this.sdf[q];
      // união suave (k=0.6 mm) para add; subtração suave para carve
      if (sign === 1) { const kk = 0.6, hh = Math.max(kk - Math.abs(s - d), 0) / kk; this.sdf[q] = Math.min(s, d) - hh * hh * kk * 0.25; }
      else { const dd = -d, kk = 0.6, hh = Math.max(kk - Math.abs(s - dd), 0) / kk; this.sdf[q] = Math.max(s, dd) + hh * hh * kk * 0.25; }
    }
  }
  /** alisa: média local do SDF */
  smooth(c: Vec3, r: number, amount = 0.5) {
    const g = this.grid, { i0, i1, j0, j1, k0, k1 } = this.region(c, r);
    const copy = new Float32Array(this.sdf);
    for (let k = Math.max(1, k0); k <= Math.min(g.nz - 2, k1); k++) for (let j = Math.max(1, j0); j <= Math.min(g.ny - 2, j1); j++) for (let i = Math.max(1, i0); i <= Math.min(g.nx - 2, i1); i++) {
      const p = gridPoint(g, i, j, k), w = Math.max(0, 1 - Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / r);
      if (!w) continue;
      let s = 0;
      for (const [a, b, cc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) s += copy[gidx(g, i + a, j + b, k + cc)];
      const q = gidx(g, i, j, k);
      this.sdf[q] = copy[q] + (s / 6 - copy[q]) * amount * w;
    }
  }
  mesh(): Mesh { return surfaceNets(this.grid, this.sdf, 1); }
  volumeMm3(): number { let n = 0; for (let i = 0; i < this.sdf.length; i++) if (this.sdf[i] < 0) n++; return n * this.grid.h ** 3; }
}

export function waxupMesh(ev: Evaluated, jaw: Jaw, h = 0.3): Mesh {
  const meshes = teethOf(ev, jaw).map((t) => t.mesh);
  const grid = gridFor(meshes, h, 2);
  return surfaceNets(grid, sdfFromOccupancy(grid, rasterizeSolid(grid, meshes)), 2);
}
export const mergeAll = mergeMeshes;
export { gridSize };
