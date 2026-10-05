// Modelo de projeto (caso) + avaliação: gera dentes, poses, malhas e marcos no mundo.
import { type Vec3, mApply, add, sub, round } from "./math";
import { ANDREWS_NORMS, MEAN_DIMS, DEFAULT_HEIGHTS, schemeHeight, type HeightScheme, allFdi, toothRef, type Jaw, type Landmarks, type ToothRef } from "./anatomy";
import { type Mesh, computeNormals, transformMesh } from "./mesh";
import { DEFAULT_PROFILE, FACE_TO_FORM, styleModifiers, type PatientProfile, type StyleModifiers, type ToothForm } from "./profiles";
import { buildPoses, DEFAULT_ARTISTIC, artisticOffset, type ArtisticParams, DEFAULT_ARCH, DEFAULT_OCCLUSION, type ArchParams, type OcclusionParams, type Pose, type ToothAdjust, worldPoint } from "./arch";
import { generateTooth, type ToothModel } from "./toothMesh";
import { customToMesh, modelFromMesh, type CustomTooth } from "./library";
import type { MaterialId } from "./materials";
import { getSculpted } from "./sculptCache";
import { modelFromSculpt, DEFAULT_ANATOMY, type AnatomyParams } from "./toothSdf";

export type RestorationKind = "natural" | "crown" | "veneer" | "inlay" | "onlay" | "pontic" | "implant-crown" | "provisional" | "wax" | "denture-tooth";
export type ProportionRule = "golden" | "red70" | "red80" | "preston" | "none";

export interface ToothDesign {
  kind: RestorationKind;
  material: MaterialId;
  shade?: string;
  /** preparo planejado (mm de redução) — usado nas verificações de espessura */
  prep?: { axial: number; occlusal: number; finish: "chamfer" | "shoulder" | "featheredge" | "knife"; taperDeg: number };
}

export interface PhotoLandmarks {
  /** pontos em pixels da foto: pupilas, comissuras, lábios, linha média */
  pupilR?: [number, number]; pupilL?: [number, number];
  commissureR?: [number, number]; commissureL?: [number, number];
  upperLipMid?: [number, number]; lowerLipMid?: [number, number];
  /** abertura interna do sorriso (polígono) */
  mouth?: Array<[number, number]>;
  facialMidTop?: [number, number]; facialMidBottom?: [number, number];
  chin?: [number, number]; forehead?: [number, number]; zygR?: [number, number]; zygL?: [number, number]; gonR?: [number, number]; gonL?: [number, number];
}

export interface CadProject {
  version: 1;
  name: string;
  createdAt: string;
  patient: PatientProfile;
  form: ToothForm;
  presetId?: string;
  fdis: number[];
  designs: Record<number, ToothDesign>;
  arches: Record<Jaw, ArchParams>;
  occlusion: OcclusionParams;
  adjust: Record<number, ToothAdjust>;
  proportion: ProportionRule;
  andrews: boolean;
  shade: string;
  notes: string;
  photo?: { name: string; width: number; height: number; landmarks: PhotoLandmarks };
  /** posicionamento do sorriso projetado na foto */
  smile: SmilePlacement;
  implants: ImplantPlan[];
  /** modelos de dente importados (STL/OBJ/PLY) que substituem o dente paramétrico */
  customTeeth?: Record<number, CustomTooth>;
  /** biblioteca de dentes: "sculpt" (escultura SDF, padrão — usa o paramétrico enquanto gera) ou "procedural" */
  library?: "sculpt" | "procedural";
  /** anatomia da biblioteca esculpida: ajustes por tipo de dente e por dente (multiplicadores) */
  anatomy?: { byType?: Partial<Record<string, Partial<AnatomyParams>>>; byTooth?: Record<number, Partial<AnatomyParams>> };
  /** esquema de alturas de coroa (X) */
  heights?: HeightScheme;
  /** inset/off-set artístico */
  artistic?: ArtisticParams;
}

export interface SmilePlacement {
  /** deslocamento horizontal (mm, + = direita da tela) e exibição incisal em repouso (mm abaixo do lábio superior) */
  offsetXmm: number; incisalDisplayMm: number; offsetZmm: number; cantDeg: number; scale: number; opacity: number; showGrid: boolean;
}
export interface ImplantPlan {
  id: string; fdi: number;
  /** posição da plataforma (mundo, mm) */ x: number; y: number; z: number;
  /** inclinação do eixo (graus) em relação à vertical: mesiodistal e vestibulolingual */
  tiltMD: number; tiltBL: number;
  diameter: number; length: number;
  sleeveOffset: number; // distância da plataforma até a base da manga (mm)
  system: string;
  /** dados do CBCT (opcionais): largura/altura óssea disponível e distâncias a estruturas nobres (mm) */
  boneWidth?: number; boneHeight?: number; canalDistance?: number; sinusDistance?: number; mentalDistance?: number;
}

export function createProject(profile: Partial<PatientProfile> = {}, name = "Novo caso"): CadProject {
  const patient: PatientProfile = { ...DEFAULT_PROFILE, ...profile };
  const form = FACE_TO_FORM[patient.face].primary;
  return {
    version: 1, name, createdAt: new Date().toISOString(), patient, form,
    fdis: allFdi(false), designs: {}, arches: structuredClone(DEFAULT_ARCH), occlusion: { ...DEFAULT_OCCLUSION },
    adjust: {}, proportion: "red70", andrews: true, shade: "A1", notes: "",
    smile: { offsetXmm: 0, incisalDisplayMm: 2, offsetZmm: 0, cantDeg: 0, scale: 1, opacity: 1, showGrid: true }, implants: [],
  };
}

export function designOf(p: CadProject, fdi: number): ToothDesign {
  return p.designs[fdi] ?? { kind: "natural", material: "zirconia-ml" };
}

export interface WorldTooth {
  fdi: number;
  ref: ToothRef;
  dims: { md: number; bl: number; h: number };
  model: ToothModel;
  pose: Pose;
  mirror: boolean;
  mesh: Mesh;
  lm: Landmarks; // marcos no mundo
  /** direção distal (mundo) do dente */
  distal: Vec3;
  facial: Vec3;
  occlusal: Vec3;
}
export interface Evaluated {
  teeth: Map<number, WorldTooth>;
  mods: StyleModifiers;
  lowerShiftY: number;
}

const modelCache = new Map<string, ToothModel>();
const sculptModelCache = new WeakMap<Mesh, Map<string, ToothModel>>();
function sculptModel(ref: ToothRef, mesh: Mesh, d: { md: number; bl: number; h: number }): ToothModel {
  let byKey = sculptModelCache.get(mesh); if (!byKey) { byKey = new Map(); sculptModelCache.set(mesh, byKey); }
  const key = `${ref.fdi}|${d.md.toFixed(2)}|${d.bl.toFixed(2)}|${d.h.toFixed(2)}`;
  let m = byKey.get(key);
  if (!m) { const c = MEAN_DIMS[ref.jaw][ref.type]; m = modelFromSculpt(ref, mesh, c, d, ref.type === "central" || ref.type === "lateral" || ref.type === "canine" ? 0 : Math.abs(ANDREWS_NORMS[ref.jaw][ref.type].torque) * 0.55); byKey.set(key, m); }
  return m;
}
export function anatomyOf(p: Pick<CadProject, "anatomy">, ref: ToothRef): AnatomyParams {
  return { ...DEFAULT_ANATOMY, ...(p.anatomy?.byType?.[`${ref.jaw}-${ref.type}`] ?? {}), ...(p.anatomy?.byTooth?.[ref.fdi] ?? {}) };
}
function getModel(ref: ToothRef, dims: { md: number; bl: number; h: number }, mods: StyleModifiers, useSculpt = true, anat?: AnatomyParams): ToothModel {
  const sc = useSculpt ? getSculpted(ref, mods, anat) : null;
  if (sc) return sculptModel(ref, sc, dims);
  const key = `${ref.fdi}|t|${dims.md.toFixed(2)}|${dims.bl.toFixed(2)}|${dims.h.toFixed(2)}|${JSON.stringify(mods)}`;
  let m = modelCache.get(key);
  if (!m) {
    m = generateTooth({ ref, dims, mods, occlusalTilt: ref.type === 'central' || ref.type === 'lateral' || ref.type === 'canine' ? 0 : Math.abs(ANDREWS_NORMS[ref.jaw][ref.type].torque) * 0.55 });
    if (modelCache.size > 400) modelCache.clear();
    modelCache.set(key, m);
  }
  return m;
}

const customCache = new WeakMap<CustomTooth, Map<string, ToothModel>>();
function customModel(ref: ToothRef, cu: CustomTooth, d: { md: number; bl: number; h: number }): ToothModel {
  let byKey = customCache.get(cu); if (!byKey) { byKey = new Map(); customCache.set(cu, byKey); }
  const key = `${ref.fdi}|${d.md.toFixed(2)}|${d.bl.toFixed(2)}|${d.h.toFixed(2)}`;
  let m = byKey.get(key);
  if (!m) { m = modelFromMesh(ref, customToMesh(cu), d); byKey.set(key, m); }
  return m;
}

export function baseDims(ref: ToothRef, mods: StyleModifiers, hs?: HeightScheme) {
  const d = MEAN_DIMS[ref.jaw][ref.type];
  const h = hs?.enabled ? schemeHeight(ref.jaw, ref.type, hs) : d.h;
  return { md: d.md * mods.widthScale, bl: d.bl, h: h * mods.heightScale };
}

export function evaluate(p: CadProject): Evaluated {
  const mods = styleModifiers(p.patient, p.form);
  const models = new Map<number, ToothModel>();
  const hs = p.heights ?? DEFAULT_HEIGHTS, art = p.artistic ?? DEFAULT_ARTISTIC;
  const dimsOfFn = (r: ToothRef) => baseDims(r, mods, hs);
  const adjustedDims = (f: number) => {
    const r = toothRef(f), d = dimsOfFn(r), a = p.adjust[f] ?? {};
    const sc = a.scale ?? 1;
    return { md: d.md * sc * (a.scaleMd ?? 1), bl: d.bl * sc, h: d.h * sc * (a.scaleH ?? 1) };
  };
  const modelOf = (f: number) => {
    let m = models.get(f);
    if (!m) {
      const r = toothRef(f), d = adjustedDims(f);
      const cu = p.customTeeth?.[f];
      m = cu ? customModel(r, cu, d) : getModel(r, d, mods, p.library !== "procedural", anatomyOf(p, r));
      models.set(f, m);
    }
    return m;
  };
  const res = buildPoses({
    fdis: p.fdis, dimsOf: dimsOfFn, landmarksOf: (f) => modelOf(f).landmarks,
    arches: p.arches, occlusion: p.occlusion, adjust: p.adjust, applyAndrews: p.andrews,
    edgeOffset: (r) => (r.jaw === "upper" ? (r.type === "lateral" ? mods.lateralStep : r.type === "canine" ? 0.3 : 0) : r.type === "lateral" ? 0.2 : 0),
    facialOffset: (r) => artisticOffset(r, art),
  });
  const teeth = new Map<number, WorldTooth>();
  for (const f of p.fdis) {
    const pose = res.poses.get(f)!, mirror = res.mirror.get(f)!, model = modelOf(f), lm0 = model.landmarks;
    let mesh = transformMesh({ positions: shiftPositions(model.mesh.positions, lm0.anchor), indices: model.mesh.indices }, { R: pose.R, t: pose.anchorW });
    if (mirror) mesh = flipWinding(mesh);
    const W = (v: Vec3) => worldPoint(pose, mirror, lm0, v);
    const lm: Landmarks = {
      incisalMid: W(lm0.incisalMid), facialEdge: W(lm0.facialEdge), lingualEdge: W(lm0.lingualEdge), mesialContact: W(lm0.mesialContact),
      distalContact: W(lm0.distalContact), cervicalFacial: W(lm0.cervicalFacial), cervicalCenter: W(lm0.cervicalCenter),
      cusps: lm0.cusps.map(W), mesialRidge: lm0.mesialRidge && W(lm0.mesialRidge), distalRidge: lm0.distalRidge && W(lm0.distalRidge), mesialAngle: W(lm0.mesialAngle), distalAngle: W(lm0.distalAngle), anchor: pose.anchorW,
    };
    const dir = (v: Vec3) => mApply(pose.R, v);
    teeth.set(f, { fdi: f, ref: toothRef(f), dims: res.dims.get(f)!, model, pose, mirror, mesh, lm, distal: dir([1, 0, 0]), facial: dir([0, 1, 0]), occlusal: dir([0, 0, 1]) });
  }
  return { teeth, mods, lowerShiftY: res.lowerShiftY };
}

function shiftPositions(pos: Float32Array, a: Vec3): Float32Array {
  const o = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { o[i] = pos[i] - a[0]; o[i + 1] = pos[i + 1] - a[1]; o[i + 2] = pos[i + 2] - a[2]; }
  return o;
}
export function flipWinding(m: Mesh): Mesh {
  const idx = new Uint32Array(m.indices);
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return computeNormals({ positions: m.positions, indices: idx });
}

export const toothLabel = (fdi: number) => toothRef(fdi).name;
export { add, sub, round };

/** leva uma malha do referencial local do dente (ex.: coroa/preparo) para o mundo */
export function toWorldMesh(t: WorldTooth, local: Mesh): Mesh {
  let m = transformMesh({ positions: shiftPositions(local.positions, t.model.landmarks.anchor), indices: local.indices }, { R: t.pose.R, t: t.pose.anchorW });
  if (t.mirror) m = flipWinding(m);
  return m;
}
