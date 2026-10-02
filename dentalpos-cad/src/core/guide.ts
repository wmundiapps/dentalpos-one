// Guia cirúrgico para implantes: planejamento, regras de segurança e geração da guia (casca + mangas/sleeves) por SDF.
import { type Vec3, add, scale, norm, sub, dot, len, angleBetween, round } from "./math";
import { type Mesh, mergeMeshes } from "./mesh";
import { type CadProject, type Evaluated, type ImplantPlan, designOf } from "./project";
import type { Issue } from "./rules";
import { cylinderMesh, tubeMesh } from "./primitives";
import { buildJawVolume, type JawVolume } from "./wax";
import { gridFor, rasterizeSolid, sdfAnalytic, sdfCylinder, sdfFromOccupancy, sdfIntersect, sdfOffset, sdfSubtract, sdfUnion, surfaceNets, type Grid } from "./voxel";
import { toothRef } from "./anatomy";

export interface ImplantSystem { id: string; name: string; sleeveInner: number; sleeveOuter: number; sleeveHeight: number; defaultOffset: number; diameters: number[]; lengths: number[]; note: string }
/** Valores genéricos de referência — SEMPRE configurar conforme o kit de cirurgia guiada do fabricante. */
export const IMPLANT_SYSTEMS: ImplantSystem[] = [
  { id: "generic", name: "Genérico (kit configurável)", sleeveInner: 5.0, sleeveOuter: 6.4, sleeveHeight: 5, defaultOffset: 8, diameters: [3.3, 3.75, 4.1, 4.3, 4.8, 5.0, 6.0], lengths: [8, 10, 11.5, 13, 16], note: "Ajuste ao diâmetro interno da manga do seu kit." },
  { id: "straumann", name: "Straumann (BL/BLT/BLX)", sleeveInner: 5.0, sleeveOuter: 6.5, sleeveHeight: 5, defaultOffset: 6, diameters: [3.3, 4.1, 4.8], lengths: [8, 10, 12, 14], note: "Referência genérica; conferir manual Straumann Guided Surgery." },
  { id: "neodent", name: "Neodent (Drive/Helix/Titamax)", sleeveInner: 5.0, sleeveOuter: 6.5, sleeveHeight: 5, defaultOffset: 6, diameters: [3.5, 3.75, 4.0, 4.3, 5.0], lengths: [8, 10, 11.5, 13, 15], note: "Referência genérica; conferir o kit Neodent." },
  { id: "nobel", name: "Nobel Biocare (NobelGuide)", sleeveInner: 5.0, sleeveOuter: 7.0, sleeveHeight: 5, defaultOffset: 8, diameters: [3.5, 4.3, 5.0], lengths: [8, 10, 11.5, 13, 15], note: "Referência genérica." },
  { id: "osstem", name: "Osstem (TS/SS)", sleeveInner: 5.0, sleeveOuter: 6.5, sleeveHeight: 5, defaultOffset: 8, diameters: [3.5, 4.0, 4.5, 5.0], lengths: [7, 8.5, 10, 11.5, 13], note: "Referência genérica." },
];
export const systemById = (id: string) => IMPLANT_SYSTEMS.find((s) => s.id === id) ?? IMPLANT_SYSTEMS[0];

export const GUIDE_LIMITS = { implantToImplant: 3, implantToTooth: 1.5, buccalBone: 2, canal: 2, sinus: 1, mental: 2, maxTiltVsProsthetic: 15, sleeveWall: 1.5, guideThickness: 2 };

/** eixo protético do sítio (eixo longo da coroa planejada, sentido plataforma → coronal) */
export function prostheticAxis(ev: Evaluated, fdi: number): Vec3 {
  const t = ev.teeth.get(fdi);
  return t ? norm(t.occlusal) : [0, 0, toothRef(fdi).jaw === "upper" ? -1 : 1];
}
/** eixo do implante = eixo protético inclinado (mesio-distal / vestíbulo-lingual) em graus a partir dele */
export function implantAxis(i: ImplantPlan, ev: Evaluated): Vec3 {
  const t = ev.teeth.get(i.fdi);
  if (!t) return [0, 0, toothRef(i.fdi).jaw === "upper" ? -1 : 1];
  const a = (i.tiltMD * Math.PI) / 180, b = (i.tiltBL * Math.PI) / 180;
  const local: Vec3 = norm([Math.sin(a), Math.sin(b), Math.cos(a) * Math.cos(b)]); // x distal, y vestibular, z coronal
  const w = add(add(scale(t.distal, local[0]), scale(t.facial, local[1])), scale(t.occlusal, local[2]));
  return norm(w);
}

export function defaultImplant(ev: Evaluated, fdi: number, system = "generic"): ImplantPlan | null {
  const t = ev.teeth.get(fdi);
  if (!t) return null;
  const sys = systemById(system);
  const ref = toothRef(fdi);
  const d = ref.type === "central" || ref.type === "lateral" ? 3.5 : ref.type === "canine" || ref.type.startsWith("premolar") ? 4.1 : 4.8;
  const occ = norm(t.occlusal);
  const platform = add(t.lm.cervicalCenter, scale(occ, -2.5)); // plataforma ~2,5 mm apical à margem
  return { id: `imp-${fdi}`, fdi, x: platform[0], y: platform[1], z: platform[2], tiltMD: 0, tiltBL: 0, diameter: d, length: 10, sleeveOffset: sys.defaultOffset, system };
}

export function analyzeGuide(p: CadProject, ev: Evaluated): Issue[] {
  const out: Issue[] = [];
  let n = 0;
  const mk = (code: string, severity: Issue["severity"], teeth: number[], title: string, message: string, tip: string, extra: Partial<Issue> = {}): Issue =>
    ({ id: `${code}-g-${n++}`, code, severity, category: "implante", teeth, title, message, tip, ...extra });
  const L = GUIDE_LIMITS;
  const imps = p.implants;
  if (!imps.length) return out;
  const siteSet = new Set(imps.map((i) => i.fdi));
  for (const i of imps) {
    const t = ev.teeth.get(i.fdi);
    const jaw = toothRef(i.fdi).jaw;
    const axis = implantAxis(i, ev);
    const pros = t ? norm(t.occlusal) : axis;
    const tilt = angleBetween(axis, pros);
    if (tilt > L.maxTiltVsProsthetic) out.push(mk("IMP_TILT", tilt > 25 ? "error" : "warning", [i.fdi], `Angulação do implante ${i.fdi}`, `Eixo do implante ${round(tilt, 0)}° divergente do eixo protético (máx. ${L.maxTiltVsProsthetic}°).`, "Use pilar angulado/ multi-unit ou replaneje para emergência no cíngulo/ fossa central.", { value: tilt, fix: { label: `Alinhar implante ${i.fdi} ao eixo protético`, apply: (q) => ({ ...q, implants: q.implants.map((m) => (m.id === i.id ? { ...m, tiltMD: 0, tiltBL: 0 } : m)) }) } }));
    if (i.boneWidth !== undefined) {
      const need = i.diameter + 2 * L.buccalBone;
      if (i.boneWidth < need) out.push(mk("IMP_BONE_W", i.boneWidth < i.diameter + 2 ? "error" : "warning", [i.fdi], `Osso vestibulo-lingual insuficiente (${i.fdi})`, `Largura óssea ${round(i.boneWidth, 1)} mm; necessário ≥ ${round(need, 1)} mm (implante + 2 mm de osso em cada face).`, "Reduza o diâmetro, planeje regeneração óssea (ROG) ou implante mais estreito.", { value: i.boneWidth, target: `≥ ${round(need, 1)} mm` }));
    }
    if (i.boneHeight !== undefined) {
      const safety = Math.min(i.canalDistance ?? Infinity, i.sinusDistance ?? Infinity) !== Infinity ? L.canal : 0;
      if (i.length + safety > i.boneHeight) out.push(mk("IMP_BONE_H", "error", [i.fdi], `Comprimento do implante ${i.fdi} invade estrutura nobre`, `Altura óssea ${round(i.boneHeight, 1)} mm; implante ${i.length} mm + margem de segurança ${safety} mm.`, "Reduza o comprimento, use implante curto ou faça enxerto/elevação de seio.", { value: i.length, fix: { label: `Comprimento = ${Math.max(6, Math.floor(i.boneHeight - safety))} mm`, apply: (q) => ({ ...q, implants: q.implants.map((m) => (m.id === i.id ? { ...m, length: Math.max(6, Math.floor(i.boneHeight! - safety)) } : m)) }) } }));
    }
    if (i.canalDistance !== undefined && i.canalDistance < L.canal) out.push(mk("IMP_CANAL", "error", [i.fdi], `Distância ao canal mandibular (${i.fdi})`, `${round(i.canalDistance, 1)} mm do ápice ao canal (mín. ${L.canal} mm).`, "Risco de lesão do nervo alveolar inferior. Reduza o comprimento."));
    if (i.sinusDistance !== undefined && i.sinusDistance < L.sinus) out.push(mk("IMP_SINUS", "warning", [i.fdi], `Proximidade do seio maxilar (${i.fdi})`, `${round(i.sinusDistance, 1)} mm do ápice ao assoalho do seio.`, "Considere implante curto, perfuração do assoalho controlada ou levantamento de seio."));
    if (i.mentalDistance !== undefined && i.mentalDistance < L.mental + 2) out.push(mk("IMP_MENTAL", "warning", [i.fdi], `Proximidade do forame mentual (${i.fdi})`, `${round(i.mentalDistance, 1)} mm do forame (zona de segurança ≥ 4 mm anterior/ 8 mm inferior).`, "Mantenha distância e confirme o alça anterior do nervo no CBCT."));
    // distância a dentes remanescentes
    for (const o of ev.teeth.values()) {
      if (siteSet.has(o.fdi) || o.ref.jaw !== jaw) continue;
      const c = o.lm.cervicalCenter;
      const apart = len(sub([c[0], c[1], 0], [i.x, i.y, 0])) - o.dims.md * 0.38 - i.diameter / 2;
      if (apart < L.implantToTooth && len(sub(c, [i.x, i.y, i.z])) < 14) out.push(mk("IMP_TOOTH", apart < 0.5 ? "error" : "warning", [i.fdi, o.fdi], `Implante ${i.fdi} próximo ao dente ${o.fdi}`, `Distância estimada ${round(apart, 1)} mm (mín. ${L.implantToTooth} mm).`, "Risco à crista óssea interproximal e à raiz adjacente. Afaste ou reduza o diâmetro.", { value: apart }));
    }
  }
  for (let a = 0; a < imps.length; a++) for (let b = a + 1; b < imps.length; b++) {
    const A = imps[a], B = imps[b];
    const center = Math.hypot(A.x - B.x, A.y - B.y);
    const gap = center - (A.diameter + B.diameter) / 2;
    if (gap < L.implantToImplant) out.push(mk("IMP_IMP", gap < 2 ? "error" : "warning", [A.fdi, B.fdi], `Implantes ${A.fdi}–${B.fdi} muito próximos`, `Distância entre implantes ${round(gap, 1)} mm (mín. ${L.implantToImplant} mm).`, "Mantenha ≥ 3 mm entre implantes para preservar papila e irrigação óssea.", { value: gap }));
    const sa = systemById(A.system), sb = systemById(B.system);
    const sleeveGap = center - sa.sleeveOuter / 2 - sb.sleeveOuter / 2;
    if (sleeveGap < L.sleeveWall) out.push(mk("SLEEVE_CLASH", "warning", [A.fdi, B.fdi], `Mangas ${A.fdi}–${B.fdi} com parede fina`, `Material do guia entre mangas ${round(sleeveGap, 1)} mm (mín. ${L.sleeveWall} mm).`, "Use mangas menores, kit de mangas fresadas ou separe os implantes."));
  }
  // suporte do guia: dentes remanescentes
  const remaining = [...ev.teeth.values()].filter((t) => !siteSet.has(t.fdi));
  const jaws = new Set(imps.map((i) => toothRef(i.fdi).jaw));
  for (const jaw of jaws) {
    const rem = remaining.filter((t) => t.ref.jaw === jaw);
    const rightN = rem.filter((t) => t.ref.side === "R").length, leftN = rem.filter((t) => t.ref.side === "L").length;
    if (rem.length < 4) out.push(mk("GUIDE_SUPPORT", "error", [], "Suporte insuficiente do guia", `Apenas ${rem.length} dentes de apoio no arco ${jaw === "upper" ? "superior" : "inferior"}.`, "Guias dentossuportados exigem ≥ 4 dentes (2 por lado) — considere guia mucossuportado com pinos de fixação."));
    else if (Math.min(rightN, leftN) < 2) out.push(mk("GUIDE_SUPPORT", "warning", [], "Apoio unilateral do guia", `Apoio: ${rightN} dentes à direita e ${leftN} à esquerda.`, "Distribua o apoio nos dois lados para evitar rotação e inclua pinos de fixação."));
  }
  return out;
}

export interface GuideOptions {
  thickness: number; tissueGap: number; collar: number; reach: number; window: boolean; resolution: number;
}
export const DEFAULT_GUIDE: GuideOptions = { thickness: 2.5, tissueGap: 0.12, collar: 2, reach: 8, window: false, resolution: 0.45 };

export interface GuideResult {
  guide: Mesh; sleeves: Mesh; implants: Mesh; volume: JawVolume;
  info: Array<{ fdi: number; sleeveTop: Vec3; sleeveBottom: Vec3; drillKeyMm: number; depthMm: number; diameter: number }>;
}

export function buildSurgicalGuide(p: CadProject, ev: Evaluated, jaw: "upper" | "lower", opts: Partial<GuideOptions> = {}): GuideResult {
  const o = { ...DEFAULT_GUIDE, ...opts };
  const imps = p.implants.filter((i) => toothRef(i.fdi).jaw === jaw);
  // arcada sem os dentes dos sítios implantares (edêntulos no paciente)
  const sites = new Set(imps.map((i) => i.fdi));
  const evNoSites: Evaluated = { ...ev, teeth: new Map([...ev.teeth].filter(([f]) => !sites.has(f))) };
  const v = buildJawVolume(evNoSites.teeth.size ? evNoSites : ev, jaw, o.resolution);
  const g: Grid = v.grid;
  const apical = jaw === "upper" ? 1 : -1;
  let shell = sdfSubtract(sdfOffset(v.model, o.thickness + o.tissueGap), sdfOffset(v.model, o.tissueGap));
  // faixa lateral + corte gengival
  const band = sdfAnalytic(g, (q) => { let best = Infinity; const pl = v.polyline; for (let i = 0; i < pl.length - 1; i++) { const [ax, ay] = pl[i], [bx, by] = pl[i + 1]; const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby || 1; const t = Math.max(0, Math.min(1, ((q[0] - ax) * abx + (q[1] - ay) * aby) / l2)); best = Math.min(best, Math.hypot(q[0] - ax - t * abx, q[1] - ay - t * aby)); } return best - o.reach; });
  const cut = sdfAnalytic(g, (q) => (apical === 1 ? q[2] - (v.zGum + 3) : v.zGum - 3 - q[2]));
  shell = sdfIntersect(sdfIntersect(shell, band), cut);
  const sleeveMeshes: Mesh[] = [], implMeshes: Mesh[] = [];
  const info: GuideResult["info"] = [];
  for (const i of imps) {
    const sys = systemById(i.system);
    const axis = implantAxis(i, ev);
    const P: Vec3 = [i.x, i.y, i.z];
    const s0 = add(P, scale(axis, i.sleeveOffset)), s1 = add(s0, scale(axis, sys.sleeveHeight));
    const collarTop = add(s1, scale(axis, o.collar));
    const apicalEnd = add(P, scale(axis, -i.length));
    // reforço (colar) ao redor da manga → garante parede mínima
    shell = sdfUnion(shell, sdfIntersect(sdfCylinder(g, sub(s0, scale(axis, 0.5)), collarTop, sys.sleeveOuter / 2 + GUIDE_LIMITS.sleeveWall), cut));
    // furo para a manga
    shell = sdfSubtract(shell, sdfCylinder(g, sub(s0, scale(axis, 3)), add(collarTop, scale(axis, 3)), sys.sleeveOuter / 2 + 0.05));
    sleeveMeshes.push(tubeMesh(s0, s1, sys.sleeveOuter / 2, sys.sleeveInner / 2));
    implMeshes.push(cylinderMesh(apicalEnd, P, i.diameter / 2 * 0.85, i.diameter / 2, 20));
    info.push({ fdi: i.fdi, sleeveTop: s1, sleeveBottom: s0, drillKeyMm: i.sleeveOffset, depthMm: i.length, diameter: i.diameter });
  }
  const guide = surfaceNets(g, shell, 1);
  void gridFor; void rasterizeSolid; void sdfFromOccupancy; void dot; void designOf;
  return { guide, sleeves: sleeveMeshes.length ? mergeMeshes(sleeveMeshes) : { positions: new Float32Array(), indices: new Uint32Array() }, implants: implMeshes.length ? mergeMeshes(implMeshes) : { positions: new Float32Array(), indices: new Uint32Array() }, volume: v, info };
}
