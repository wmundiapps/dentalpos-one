import { useMemo } from "react";
import { Check, Section, Sel, Slider } from "./atoms";
import type { Ctx } from "./ctx";
import { AGE_LABEL, buildPresetLibrary, ETHNICITY_LABEL, FACE_LABEL, FORM_LABEL, SEX_LABEL, styleModifiers, type AgeBand, type Ethnicity, type FaceShape, type LibraryPreset, type Personality, type Sex, type Style, type ToothForm } from "../core/profiles";
import { generateTooth } from "../core/toothMesh";
import { MEAN_DIMS, toothRef } from "../core/anatomy";
import { convexHull } from "../core/smile";
import { SHADES } from "../core/materials";
import { ARCH_FORM_LABEL, DEFAULT_ARTISTIC, type ArchForm } from "../core/arch";
import { DEFAULT_HEIGHTS } from "../core/anatomy";
import { PROPORTION_LABEL } from "../core/rules";
import { autoDesign, recommendDesign } from "../core/ai";
import type { ProportionRule } from "../core/project";

const svgCache = new Map<string, string>();
function presetPath(p: LibraryPreset): string {
  const hit = svgCache.get(p.id); if (hit) return hit;
  const profile = { face: p.face[0], sex: p.sex === "neutral" ? "female" : p.sex, ethnicity: "mixed", age: "adult", personality: "balanced", style: "natural", ...p.profile } as Parameters<typeof styleModifiers>[0];
  const mods = styleModifiers(profile, p.form);
  const ref = toothRef(11), d = MEAN_DIMS.upper.central;
  const t = generateTooth({ ref, dims: { md: d.md * mods.widthScale, bl: d.bl, h: d.h * mods.heightScale }, mods, segments: 28 });
  const pts: Array<[number, number]> = [];
  const pos = t.mesh.positions, n = t.mesh.normals!;
  for (let i = 0; i < pos.length; i += 3) if (n[i + 1] > -0.1) pts.push([pos[i], pos[i + 2]]);
  const hull = convexHull(pts);
  const xs = hull.map((q) => q[0]), zs = hull.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const sc = 44 / (z1 - z0), W = (x1 - x0) * sc;
  const path = hull.map(([x, z], i) => `${i ? "L" : "M"}${(50 - W / 2 + (x - x0) * sc).toFixed(1)},${(48 - (z - z0) * sc).toFixed(1)}`).join("") + "Z";
  svgCache.set(p.id, path);
  return path;
}

export function CasePanel({ c }: { c: Ctx }) {
  const { project: p } = c.s;
  const presets = useMemo(() => buildPresetLibrary(), []);
  const rec = recommendDesign(p.patient, p.photo);
  const shown = presets.filter((x) => (x.face.includes(p.patient.face) && (x.sex === p.patient.sex || x.sex === "neutral")) || x.id.startsWith("special"));
  const setPat = (patch: Partial<typeof p.patient>) => c.s.set((q) => ({ ...q, patient: { ...q.patient, ...patch } }));
  const o = (rec: Record<string, string>) => Object.entries(rec) as Array<[string, string]>;
  const speeDepth = (((p.arches.lower.depth + 4) / 2) ** 2) / (2 * Math.min(p.occlusion.speeRadius, 9999));
  return (
    <div data-testid="panel-case">
      <h3>Caso e perfil do paciente</h3>
      <div className="field"><label><span>Nome do caso</span></label><input type="text" value={p.name} onChange={(e) => c.s.set((q) => ({ ...q, name: e.target.value }), "name")} /></div>
      <div className="row2">
        <Sel label="Formato do rosto" value={p.patient.face} options={o(FACE_LABEL) as Array<[FaceShape, string]>} onChange={(v) => c.s.set((q) => ({ ...q, patient: { ...q.patient, face: v } }))} testid="sel-face" />
        <Sel label="Sexo" value={p.patient.sex} options={o(SEX_LABEL) as Array<[Sex, string]>} onChange={(v) => setPat({ sex: v })} testid="sel-sex" />
        <Sel label="Etnia / ancestralidade" value={p.patient.ethnicity} options={o(ETHNICITY_LABEL) as Array<[Ethnicity, string]>} onChange={(v) => setPat({ ethnicity: v })} />
        <Sel label="Faixa etária" value={p.patient.age} options={o(AGE_LABEL) as Array<[AgeBand, string]>} onChange={(v) => setPat({ age: v })} />
        <Sel label="Personalidade" value={p.patient.personality} options={[["delicate", "Delicada"], ["balanced", "Equilibrada"], ["vigorous", "Vigorosa"]] as Array<[Personality, string]>} onChange={(v) => setPat({ personality: v })} />
        <Sel label="Estilo do sorriso" value={p.patient.style} options={[["natural", "Natural"], ["hollywood", "Hollywood"], ["youthful", "Jovem"], ["mature", "Maduro"], ["rejuvenated", "Rejuvenescido"]] as Array<[Style, string]>} onChange={(v) => setPat({ style: v })} />
      </div>
      <div className="card o">
        <div className="t">Recomendação da IA: {FORM_LABEL[rec.form]}</div>
        <div className="tip">{rec.bullets[0]}</div>
        <div className="btns">
          <button className="btn p" data-testid="btn-wizard" onClick={() => {
            const r = autoDesign(p.patient, p.photo);
            c.s.set((q) => ({ ...r.project, name: q.name, designs: q.designs, implants: q.implants, photo: q.photo, smile: q.smile }));
            c.toast(`Wizard IA: forma ${FORM_LABEL[r.recommendation.form]}; ${r.correction.applied.length} correção(ões) automática(s).`);
          }}>✨ Desenhar automaticamente</button>
          <button className="btn" onClick={() => c.s.set((q) => ({ ...q, form: rec.form, shade: rec.suggestedShade }))}>Aplicar forma recomendada</button>
        </div>
      </div>
      <Sel label="Forma dos dentes (anteriores)" value={p.form} options={o(FORM_LABEL) as Array<[ToothForm, string]>} onChange={(v) => c.s.set((q) => ({ ...q, form: v, presetId: undefined }))} testid="sel-form" />
      <Section title={`Biblioteca de formas (${shown.length})`}>
        <div className="presets" data-testid="presets">
          {shown.map((pr) => (
            <div key={pr.id} className={`preset ${p.presetId === pr.id ? "on" : ""}`} title={pr.description} onClick={() => c.s.set((q) => ({ ...q, form: pr.form, presetId: pr.id, patient: { ...q.patient, ...pr.profile, sex: pr.sex === "neutral" ? q.patient.sex : pr.sex, face: pr.id.startsWith("special") ? q.patient.face : pr.face[0] } }))}>
              <svg viewBox="0 0 100 56"><path d={presetPath(pr)} fill="#e8dcc0" stroke="#7a6a4a" strokeWidth="1.2" /></svg>
              {pr.name.split("·").slice(2).join("·") || pr.name}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Arco dentário">
        <div className="row2">
          <Sel label="Forma do arco superior" value={p.arches.upper.form} options={o(ARCH_FORM_LABEL) as Array<[ArchForm, string]>} onChange={(v) => c.s.set((q) => ({ ...q, arches: { ...q.arches, upper: { ...q.arches.upper, form: v } } }))} />
          <Sel label="Forma do arco inferior" value={p.arches.lower.form} options={o(ARCH_FORM_LABEL) as Array<[ArchForm, string]>} onChange={(v) => c.s.set((q) => ({ ...q, arches: { ...q.arches, lower: { ...q.arches.lower, form: v } } }))} />
        </div>
        <Slider label="Largura intermolar superior" value={p.arches.upper.width} min={44} max={62} step={0.5} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, arches: { ...q.arches, upper: { ...q.arches.upper, width: v } } }), "aw")} />
        <Slider label="Largura intermolar inferior" value={p.arches.lower.width} min={40} max={58} step={0.5} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, arches: { ...q.arches, lower: { ...q.arches.lower, width: v } } }), "aw2")} />
        <Slider label="Profundidade do arco superior" value={p.arches.upper.depth} min={26} max={42} step={0.5} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, arches: { ...q.arches, upper: { ...q.arches.upper, depth: v } } }), "ad")} />
      </Section>
      <Section title="Oclusão (regras clássicas)">
        <Slider testid="sl-overjet" label="Overjet (trespasse horizontal)" value={p.occlusion.overjet} min={-1} max={7} step={0.1} unit=" mm (ideal 1–2)" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, overjet: v } }), "oj")} />
        <Slider testid="sl-overbite" label="Overbite (trespasse vertical)" value={p.occlusion.overbite} min={-2} max={8} step={0.1} unit=" mm (ideal 1–2)" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, overbite: v } }), "ob")} />
        <Slider label={`Raio da curva de Spee (profundidade ≈ ${speeDepth.toFixed(1).replace(".", ",")} mm)`} value={Math.min(p.occlusion.speeRadius, 400)} min={60} max={400} step={5} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, speeRadius: v } }), "sp")} />
        <Slider label="Raio da curva de Wilson" value={Math.min(p.occlusion.wilsonRadius, 400)} min={80} max={400} step={5} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, wilsonRadius: v } }), "wl")} />
        <Slider label="Relação molar (− Classe II · + Classe III)" value={p.occlusion.molarOffset} min={-5} max={5} step={0.1} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, molarOffset: v } }), "mo")} />
        <Slider label="Plano oclusal (linha rima/comissura → tragus)" value={p.occlusion.occlusalPlaneDeg ?? 0} min={-6} max={10} step={0.5} unit="°" onChange={(v) => c.s.set((q) => ({ ...q, occlusion: { ...q.occlusion, occlusalPlaneDeg: v } }), "opl")} />
        <Check label="Aplicar valores de Andrews (tip/torque)" checked={p.andrews} onChange={(v) => c.s.set((q) => ({ ...q, andrews: v }))} />
      </Section>
      <Section title="Alturas das coroas (esquema X)">
        <p className="hint">Superiores: central X+0,5 · lateral X · canino X+0,5 · pré-molares X · 1º molar X−0,5 · 2º molar X−1. Inferiores: incisivos e pré-molares X · canino X+0,5 · molares X−0,5.</p>
        <Check label="Usar esquema de alturas" checked={(p.heights ?? DEFAULT_HEIGHTS).enabled} onChange={(v) => c.s.set((q) => ({ ...q, heights: { ...(q.heights ?? DEFAULT_HEIGHTS), enabled: v } }))} />
        <Slider label="X superior" value={(p.heights ?? DEFAULT_HEIGHTS).xUpper} min={7.5} max={12} step={0.1} unit=" mm" digits={1} onChange={(v) => c.s.set((q) => ({ ...q, heights: { ...(q.heights ?? DEFAULT_HEIGHTS), xUpper: v } }), "xu")} testid="sl-xu" />
        <Slider label="X inferior" value={(p.heights ?? DEFAULT_HEIGHTS).xLower} min={7.5} max={12} step={0.1} unit=" mm" digits={1} onChange={(v) => c.s.set((q) => ({ ...q, heights: { ...(q.heights ?? DEFAULT_HEIGHTS), xLower: v } }), "xl")} />
      </Section>
      <Section title="Posicionamento artístico (inset / off-set)">
        <Slider label="Incisivo lateral superior (− = inset palatino)" value={(p.artistic ?? DEFAULT_ARTISTIC).upperLateral} min={-1.5} max={1} step={0.05} unit=" mm" digits={2} onChange={(v) => c.s.set((q) => ({ ...q, artistic: { ...(q.artistic ?? DEFAULT_ARTISTIC), upperLateral: v } }), "ia1")} />
        <Slider label="Canino superior (off-set vestibular)" value={(p.artistic ?? DEFAULT_ARTISTIC).upperCanine} min={-1} max={1.5} step={0.05} unit=" mm" digits={2} onChange={(v) => c.s.set((q) => ({ ...q, artistic: { ...(q.artistic ?? DEFAULT_ARTISTIC), upperCanine: v } }), "ia2")} />
        <Slider label="Molares superiores (off-set)" value={(p.artistic ?? DEFAULT_ARTISTIC).upperMolar} min={-1} max={1.5} step={0.05} unit=" mm" digits={2} onChange={(v) => c.s.set((q) => ({ ...q, artistic: { ...(q.artistic ?? DEFAULT_ARTISTIC), upperMolar: v } }), "ia3")} />
        <Slider label="Canino inferior (leve off-set)" value={(p.artistic ?? DEFAULT_ARTISTIC).lowerCanine} min={-1} max={1} step={0.05} unit=" mm" digits={2} onChange={(v) => c.s.set((q) => ({ ...q, artistic: { ...(q.artistic ?? DEFAULT_ARTISTIC), lowerCanine: v } }), "ia4")} />
        <Slider label="Molares inferiores (leve off-set)" value={(p.artistic ?? DEFAULT_ARTISTIC).lowerMolar} min={-1} max={1} step={0.05} unit=" mm" digits={2} onChange={(v) => c.s.set((q) => ({ ...q, artistic: { ...(q.artistic ?? DEFAULT_ARTISTIC), lowerMolar: v } }), "ia5")} />
      </Section>
      <Section title="Proporções e cor">
        <Sel label="Regra de proporção anterior" value={p.proportion} options={o(PROPORTION_LABEL) as Array<[ProportionRule, string]>} onChange={(v) => c.s.set((q) => ({ ...q, proportion: v }))} testid="sel-prop" />
        <Sel label="Cor (escala VITA / Bleach)" value={p.shade} options={[...SHADES.bleach, ...SHADES.vita].map((s) => [s, s] as [string, string])} onChange={(v) => c.s.set((q) => ({ ...q, shade: v }))} />
      </Section>
    </div>
  );
}
