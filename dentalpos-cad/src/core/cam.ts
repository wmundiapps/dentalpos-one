// Preparação CAM: compensação de sinterização, pinos de fresagem (sprue), nesting em disco e checagem de alcance da fresa.
import { type Vec3, add, scale, norm, sub, dot, len } from "./math";
import { type Mesh, bounds, getV, mergeMeshes, transformMesh, vertexCount } from "./mesh";
import { MATERIALS, type MaterialId } from "./materials";
import { cylinderMesh } from "./primitives";
import { type Grid, gridFor, rasterizeSolid, sdfFromOccupancy, sdfOffset, sdfSubtract } from "./voxel";
import { rigidIdentity } from "./math";

export interface Disc { diameter: number; height: number; label: string }
export const DISCS: Disc[] = [
  { diameter: 98.5, height: 12, label: "Ø98 × 12 mm" }, { diameter: 98.5, height: 14, label: "Ø98 × 14 mm" }, { diameter: 98.5, height: 18, label: "Ø98 × 18 mm" },
  { diameter: 98.5, height: 22, label: "Ø98 × 22 mm" }, { diameter: 95, height: 14, label: "Ø95 × 14 mm" }, { diameter: 100, height: 20, label: "Ø100 × 20 mm" },
];
export const BLOCKS = [{ label: "Bloco 14 (12×14×18)", w: 12, d: 14, h: 18 }, { label: "Bloco 16 (15×16×19)", w: 15, d: 16, h: 19 }, { label: "Bloco 40 (15×19×39)", w: 15, d: 19, h: 39 }];

/** amplia a malha pelo fator linear de sinterização (zircônia), em torno do centro */
export function compensateSintering(m: Mesh, factor: number): Mesh {
  const c = bounds(m).center;
  const T = rigidIdentity();
  const shifted = transformMesh(m, { R: T.R, t: [-c[0], -c[1], -c[2]] });
  const sc = transformMesh(shifted, { R: T.R, t: c }, [factor, factor, factor]);
  return sc;
}

export interface Sprue { position: Vec3; axis: Vec3; mesh: Mesh }
/** escolhe o ponto de fixação do pino: face lingual/proximal mais próxima ao topo do bloco e voltada à direção de fresagem */
export function planSprue(m: Mesh, up: Vec3 = [0, 0, 1], diameter = 2.0, length = 3): Sprue {
  const u = norm(up);
  const b = bounds(m);
  // candidato: vértice com projeção máxima no eixo up, deslocado em direção ao centro (evita borda funcional)
  let best = -1, bs = -Infinity;
  for (let i = 0; i < vertexCount(m); i++) {
    const p = getV(m, i);
    const s = dot(p, u) - 0.15 * len(sub(p, b.center));
    if (s > bs) { bs = s; best = i; }
  }
  const pos = getV(m, best);
  const mesh = cylinderMesh(pos, add(pos, scale(u, length)), diameter / 2, diameter / 2 * 1.3, 16);
  return { position: pos, axis: u, mesh };
}

export interface NestItem { id: string; mesh: Mesh; radius: number; height: number }
export interface NestPlaced { id: string; x: number; y: number }
/** nesting 2D guloso em espiral dentro do disco; verifica altura contra o disco */
export function nestInDisc(items: NestItem[], disc: Disc, margin = 3, spacing = 2): { placed: NestPlaced[]; unplaced: string[]; utilization: number } {
  const R = disc.diameter / 2 - margin;
  const placed: Array<NestPlaced & { r: number }> = [];
  const unplaced: string[] = [];
  const sorted = [...items].sort((a, b) => b.radius - a.radius);
  for (const it of sorted) {
    if (it.height > disc.height - 2) { unplaced.push(it.id); continue; }
    let ok = false;
    for (let ring = 0; ring * 6 + 0 <= R && !ok; ring++) {
      const rad = ring * 6;
      const steps = Math.max(1, Math.floor((2 * Math.PI * rad) / (it.radius * 2 + spacing)));
      for (let s = 0; s < steps && !ok; s++) {
        const th = (s / steps) * Math.PI * 2 + ring * 0.3;
        const x = rad * Math.cos(th), y = rad * Math.sin(th);
        if (Math.hypot(x, y) + it.radius > R) continue;
        if (placed.every((q) => Math.hypot(q.x - x, q.y - y) >= q.r + it.radius + spacing)) { placed.push({ id: it.id, x, y, r: it.radius }); ok = true; }
      }
    }
    if (!ok) unplaced.push(it.id);
  }
  const used = placed.reduce((s, p) => s + Math.PI * p.r * p.r, 0);
  return { placed: placed.map(({ id, x, y }) => ({ id, x, y })), unplaced, utilization: used / (Math.PI * R * R) };
}

export interface ReachReport { unreachableMm3: number; worstMm: number; ok: boolean; note: string }
/** Fresabilidade: volume de "ar" inalcançável por uma fresa esférica de raio r (concavidades mais estreitas que 2r). */
export function millingReach(m: Mesh, burRadius = 0.5, res = 0.2): ReachReport {
  const g: Grid = gridFor([m], res, burRadius + 2);
  const s = sdfFromOccupancy(g, rasterizeSolid(g, [m]));
  // ar = -s ; centros alcançáveis: ar erodido por r; alcance = centros dilatados por r
  const air = new Float32Array(s.length); for (let i = 0; i < s.length; i++) air[i] = -s[i];
  const centers = sdfOffset(air, -burRadius); // contrai o ar
  // dilata o conjunto de centros por r: sdf(centers) - r ; só vale onde há centros — usa EDT sobre ocupação dos centros
  const occ = new Uint8Array(s.length); for (let i = 0; i < occ.length; i++) occ[i] = centers[i] < 0 ? 1 : 0;
  const reach = sdfOffset(sdfFromOccupancy(g, occ), burRadius);
  const un = sdfSubtract(air, reach); // ar não alcançado
  let n = 0, worst = 0;
  for (let i = 0; i < un.length; i++) if (un[i] < -res * 0.5) { n++; worst = Math.max(worst, -un[i]); }
  const vol = n * res ** 3;
  return { unreachableMm3: Math.round(vol * 10) / 10, worstMm: Math.round(worst * 100) / 100, ok: vol < 2.0, note: vol < 2 ? "Fresável com a fresa informada." : "Há sulcos/cantos mais estreitos que o diâmetro da fresa — suavize ou use fresa menor." };
}

export interface CamJobUnit { id: string; mesh: Mesh; material: MaterialId }
export interface CamPlan { disc: Disc; sinterFactor: number; items: Array<{ id: string; x: number; y: number; scaled: Mesh; sprue: Sprue; reach: ReachReport }>; unplaced: string[]; utilization: number; warnings: string[] }
export function planCamJob(units: CamJobUnit[], opts: { disc?: Disc; sinterFactor?: number; burRadius?: number } = {}): CamPlan {
  const mats = new Set(units.map((u) => u.material));
  const warnings: string[] = [];
  if (mats.size > 1) warnings.push("Materiais diferentes no mesmo job — separe em discos distintos.");
  const mat = MATERIALS[units[0]?.material ?? "zirconia-ml"];
  const factor = opts.sinterFactor ?? (mat.family === "zirconia" ? mat.sinterFactor ?? 1.23 : 1);
  const prepared = units.map((u) => {
    const scaled = factor !== 1 ? compensateSintering(u.mesh, factor) : u.mesh;
    const b = bounds(scaled);
    return { u, scaled, radius: Math.hypot(b.size[0], b.size[1]) / 2 + 2, height: b.size[2] + 3 };
  });
  const maxH = Math.max(0, ...prepared.map((p) => p.height));
  const disc = opts.disc ?? ([...DISCS].sort((a, b) => a.height - b.height).find((d) => d.height - 2 >= maxH) ?? DISCS[DISCS.length - 1]);
  const nest = nestInDisc(prepared.map((p) => ({ id: p.u.id, mesh: p.scaled, radius: p.radius, height: p.height })), disc);
  const items = nest.placed.map((pl) => {
    const p = prepared.find((q) => q.u.id === pl.id)!;
    return { id: pl.id, x: pl.x, y: pl.y, scaled: p.scaled, sprue: planSprue(p.scaled), reach: millingReach(p.scaled, opts.burRadius ?? 0.5, 0.25) };
  });
  for (const it of items) if (!it.reach.ok) warnings.push(`${it.id}: ${it.reach.note}`);
  if (nest.unplaced.length) warnings.push(`Não couberam no disco: ${nest.unplaced.join(", ")}`);
  return { disc, sinterFactor: factor, items, unplaced: nest.unplaced, utilization: nest.utilization, warnings };
}
export const mergePlan = (plan: CamPlan) => mergeMeshes(plan.items.flatMap((i) => [i.scaled, i.sprue.mesh]));
export { norm };
