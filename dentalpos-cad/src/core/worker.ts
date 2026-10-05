// Trabalhos pesados (SDF/voxel) fora da thread da interface.
import { evaluate, type CadProject } from "./project";
import { buildJawVolume, buildMockupTray, jawMeshes, type TrayOptions } from "./wax";
import { buildSurgicalGuide, type GuideOptions } from "./guide";
import { designCrown, type PrepSpec } from "./crown";
import { planCamJob, type CamJobUnit, type Disc } from "./cam";
import { designOf } from "./project";
import type { Mesh } from "./mesh";
import type { Jaw } from "./anatomy";
import { sculptTooth, type SculptOpts } from "./toothSdf";
import { toothRef } from "./anatomy";
import { designRestoration, type RestorationParams } from "./restoration";
import type { ToothModel } from "./toothMesh";
import type { Vec3 } from "./math";
import type { MaterialId } from "./materials";

export type JobRequest =
  | { id: number; kind: "wax"; project: CadProject; jaw: Jaw; h?: number }
  | { id: number; kind: "tray"; project: CadProject; jaw: Jaw; opts: Partial<TrayOptions>; h?: number }
  | { id: number; kind: "guide"; project: CadProject; jaw: Jaw; opts: Partial<GuideOptions> }
  | { id: number; kind: "crown"; project: CadProject; fdi: number; spec: PrepSpec }
  | { id: number; kind: "cam"; project: CadProject; disc?: Disc; bur?: number; extra?: Array<{ id: string; mesh: Mesh; material: MaterialId }> }
  | { id: number; kind: "sculpt"; fdi: number; opts: SculptOpts }
  | { id: number; kind: "restore"; scan: Mesh; antagonist?: Mesh; pick: Vec3; tooth: ToothModel; params?: Partial<RestorationParams>; axis?: Vec3; margin?: Vec3[] };
export interface JobResponse { id: number; ok: boolean; error?: string; meshes?: Record<string, Mesh>; data?: unknown; progress?: { stage: string; p: number } }

const transfer = (r: JobResponse) => (r.meshes ? Object.values(r.meshes).flatMap((m) => [m.positions.buffer, m.indices.buffer]) : []);

export function runJob(req: JobRequest, onProgress?: (stage: string, p: number) => void): JobResponse {
  try {
    if (req.kind === "sculpt") return { id: req.id, ok: true, meshes: { tooth: sculptTooth(toothRef(req.fdi), req.opts) } };
    if (req.kind === "restore") {
      const r = designRestoration({ scan: req.scan, antagonist: req.antagonist, pick: req.pick, tooth: req.tooth, params: req.params, axis: req.axis, margin: req.margin, onProgress });
      return { id: req.id, ok: true, meshes: { crown: r.crown, ...(r.cavity ? { cavity: r.cavity } : {}) }, data: { report: r.report, margin: r.margin, axis: r.axis, params: r.params } };
    }
    const ev = evaluate(req.project);
    if (req.kind === "wax") {
      const v = buildJawVolume(ev, req.jaw, req.h ?? 0.4);
      const m = jawMeshes(v);
      return { id: req.id, ok: true, meshes: { teeth: m.teeth, gingiva: m.gingiva, model: m.model } };
    }
    if (req.kind === "tray") {
      const t = buildMockupTray(ev, req.jaw, req.opts, undefined);
      return { id: req.id, ok: true, meshes: { tray: t.mesh } };
    }
    if (req.kind === "guide") {
      const g = buildSurgicalGuide(req.project, ev, req.jaw, req.opts);
      return { id: req.id, ok: true, meshes: { guide: g.guide, sleeves: g.sleeves, implants: g.implants }, data: g.info };
    }
    if (req.kind === "crown") {
      const t = ev.teeth.get(req.fdi)!;
      const d = designOf(req.project, req.fdi);
      const r = designCrown(t.model, req.spec, d.material, 0.25);
      // leva ao mundo
      return { id: req.id, ok: true, meshes: { shell: r.shell, prep: r.prep }, data: { stats: r.stats, marginZ: r.marginZ } };
    }
    const units: CamJobUnit[] = [...ev.teeth.values()].filter((t) => designOf(req.project, t.fdi).kind !== "natural").map((t) => ({ id: String(t.fdi), mesh: t.mesh, material: designOf(req.project, t.fdi).material }));
    for (const x of req.extra ?? []) units.push({ id: x.id, mesh: x.mesh, material: x.material });
    if (!units.length) return { id: req.id, ok: false, error: "Nenhum dente com restauração definida (altere o tipo na aba Dentes ou gere uma restauração a partir do escaneamento)." };
    const plan = planCamJob(units, { disc: req.disc, burRadius: req.bur });
    const meshes: Record<string, Mesh> = {};
    for (const it of plan.items) { meshes[`u${it.id}`] = it.scaled; meshes[`s${it.id}`] = it.sprue.mesh; }
    return { id: req.id, ok: true, meshes, data: { disc: plan.disc, sinterFactor: plan.sinterFactor, utilization: plan.utilization, warnings: plan.warnings, unplaced: plan.unplaced, items: plan.items.map((i) => ({ id: i.id, x: i.x, y: i.y, reach: i.reach })) } };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

if (typeof self !== "undefined" && typeof (self as unknown as { document?: unknown }).document === "undefined" && typeof postMessage === "function") {
  self.onmessage = (ev: MessageEvent<JobRequest>) => { const r = runJob(ev.data, (stage, p) => (self as unknown as Worker).postMessage({ id: ev.data.id, progress: { stage, p } })); (self as unknown as Worker).postMessage(r, transfer(r)); };
}
