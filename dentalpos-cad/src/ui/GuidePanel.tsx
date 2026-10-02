import { useState } from "react";
import { Section, Sel, Slider, download, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { job } from "./jobs";
import { defaultImplant, IMPLANT_SYSTEMS, implantAxis, systemById, GUIDE_LIMITS } from "../core/guide";
import { toothRef } from "../core/anatomy";
import { exportSTL } from "../core/io";
import { cylinderMesh } from "../core/primitives";
import { add, scale } from "../core/math";
import { mergeMeshes } from "../core/mesh";
import type { Evaluated, ImplantPlan } from "../core/project";

export function implantMeshes(p: ImplantPlan[], ev: Evaluated) {
  if (!p.length) return null;
  return mergeMeshes(p.map((i) => {
    const ax = implantAxis(i, ev), P: [number, number, number] = [i.x, i.y, i.z];
    return mergeMeshes([cylinderMesh(add(P, scale(ax, -i.length)), P, i.diameter * 0.42, i.diameter / 2, 18), cylinderMesh(P, add(P, scale(ax, i.sleeveOffset + 6)), 0.35, 0.35, 8)]);
  }));
}

export function GuidePanel({ c }: { c: Ctx }) {
  const { project: p, ev, report } = c.s;
  const [opts, setOpts] = useState({ thickness: 2.5, tissueGap: 0.12, collar: 2, reach: 8 });
  const [jaw, setJaw] = useState<"upper" | "lower">("lower");
  const [info, setInfo] = useState<Array<{ fdi: number; drillKeyMm: number; depthMm: number; diameter: number }>>([]);
  const upd = (id: string, patch: Partial<ImplantPlan>) => c.s.set((q) => ({ ...q, implants: q.implants.map((i) => (i.id === id ? { ...i, ...patch } : i)) }), `imp${id}`);
  const sync = (list: ImplantPlan[]) => { const m = implantMeshes(list, ev); c.setExtra("implants-plan", m ? { id: "implants-plan", mesh: m, color: "#ffb454" } : null); };
  const addImp = () => {
    const f = c.sel; if (!f) return c.toast("Selecione primeiro o dente do sítio do implante.");
    if (p.implants.some((i) => i.fdi === f)) return c.toast("Já existe implante neste sítio.");
    const i = defaultImplant(ev, f, "generic"); if (!i) return;
    const list = [...p.implants, i];
    c.s.set((q) => ({ ...q, implants: list, designs: { ...q.designs, [f]: { ...(q.designs[f] ?? { material: "zirconia-ml" }), kind: "implant-crown", material: q.designs[f]?.material ?? "zirconia-ml" } } }));
    setJaw(toothRef(f).jaw); sync(list);
  };
  const gen = async () => {
    if (!p.implants.length) return c.toast("Planeje ao menos um implante.");
    c.setBusy("Gerando guia cirúrgico (casca, colares e mangas)…");
    const r = await job({ kind: "guide", project: p, jaw, opts });
    c.setBusy(null);
    if (!r.ok || !r.meshes) return c.toast(r.error ?? "Falha");
    c.setExtra("guide", { id: "guide", mesh: r.meshes.guide, color: "#7fd0ff", opacity: 0.6 });
    c.setExtra("sleeves", { id: "sleeves", mesh: r.meshes.sleeves, color: "#d9dde3" });
    setInfo(r.data as typeof info); c.toast("Guia gerado.");
  };
  const issues = report.issues.filter((i) => i.category === "implante");
  return (
    <div data-testid="panel-guide">
      <h3>Guia cirúrgico para implantes</h3>
      <p className="hint">Selecione o dente do sítio no odontograma e clique em “Planejar implante”. Dados de CBCT (osso, canal, seio) são opcionais e ativam as verificações de segurança.</p>
      <div className="btns"><button className="btn p" data-testid="btn-addimplant" onClick={addImp}>Planejar implante no dente {c.sel ?? "…"}</button></div>
      {p.implants.map((i) => {
        const sys = systemById(i.system);
        return (
          <div key={i.id} className="card" data-testid="implant-card">
            <div className="t">Implante {i.fdi} <button className="btn d" style={{ float: "right", padding: "2px 8px" }} onClick={() => { const list = p.implants.filter((x) => x.id !== i.id); c.s.set((q) => ({ ...q, implants: list })); sync(list); }}>remover</button></div>
            <Sel label="Sistema / kit" value={i.system} options={IMPLANT_SYSTEMS.map((s) => [s.id, s.name] as [string, string])} onChange={(v) => { upd(i.id, { system: v, sleeveOffset: systemById(v).defaultOffset }); }} />
            <div className="row2">
              <Sel label="Diâmetro" value={String(i.diameter)} options={sys.diameters.map((d) => [String(d), `${d} mm`] as [string, string])} onChange={(v) => upd(i.id, { diameter: parseFloat(v) })} />
              <Sel label="Comprimento" value={String(i.length)} options={sys.lengths.map((d) => [String(d), `${d} mm`] as [string, string])} onChange={(v) => upd(i.id, { length: parseFloat(v) })} />
            </div>
            <Slider label="Inclinação mesio-distal (em relação ao eixo protético)" value={i.tiltMD} min={-25} max={25} step={0.5} unit="°" onChange={(v) => { upd(i.id, { tiltMD: v }); }} />
            <Slider label="Inclinação vestíbulo-lingual (em relação ao eixo protético)" value={i.tiltBL} min={-25} max={25} step={0.5} unit="°" onChange={(v) => { upd(i.id, { tiltBL: v }); }} />
            <Slider label="Profundidade da plataforma (z)" value={i.z} min={i.z - 5} max={i.z + 5} step={0.1} unit=" mm" digits={1} onChange={(v) => upd(i.id, { z: v })} />
            <Slider label="Chave da broca (base da manga → plataforma)" value={i.sleeveOffset} min={2} max={14} step={0.5} unit=" mm" onChange={(v) => upd(i.id, { sleeveOffset: v })} />
            <details><summary className="hint" style={{ cursor: "pointer" }}>Dados do CBCT (opcional)</summary>
              {([["boneWidth", "Largura óssea V-L (mm)"], ["boneHeight", "Altura óssea disponível (mm)"], ["canalDistance", "Distância ao canal mandibular (mm)"], ["sinusDistance", "Distância ao seio maxilar (mm)"], ["mentalDistance", "Distância ao forame mentual (mm)"]] as const).map(([k, l]) => (
                <div className="field" key={k}><label><span>{l}</span></label><input type="number" step="0.1" value={i[k] ?? ""} placeholder="não informado" onChange={(e) => upd(i.id, { [k]: e.target.value === "" ? undefined : parseFloat(e.target.value) } as Partial<ImplantPlan>)} /></div>
              ))}
            </details>
          </div>
        );
      })}
      {issues.length > 0 && <Section title="Verificações de segurança">{issues.map((i) => (<div key={i.id} className={`card ${i.severity === "error" ? "e" : i.severity === "warning" ? "w" : "i"}`}><div className="t">{i.title}</div><div className="m">{i.message}</div><div className="tip">{i.tip}</div>{i.fix && <div className="btns"><button className="btn" onClick={() => { c.s.set(i.fix!.apply); }}>{i.fix.label}</button></div>}</div>))}</Section>}
      <Section title="Geração da guia">
        <Sel label="Arcada" value={jaw} options={[["upper", "Superior"], ["lower", "Inferior"]]} onChange={setJaw} />
        <Slider label={`Espessura da guia (mín. ${GUIDE_LIMITS.guideThickness} mm)`} value={opts.thickness} min={1.5} max={4} step={0.1} unit=" mm" onChange={(v) => setOpts({ ...opts, thickness: v })} />
        <Slider label="Folga tecidual / dental" value={opts.tissueGap} min={0.05} max={0.4} step={0.01} digits={2} unit=" mm" onChange={(v) => setOpts({ ...opts, tissueGap: v })} />
        <Slider label="Colar de reforço da manga" value={opts.collar} min={0} max={5} step={0.5} unit=" mm" onChange={(v) => setOpts({ ...opts, collar: v })} />
        <div className="btns">
          <button className="btn p" data-testid="btn-guide" onClick={gen}>Gerar guia cirúrgico</button>
          <button className="btn" onClick={() => { const g = c.extras.guide; if (g) download(`${p.name}-guia.stl`, exportSTL(g.mesh, "guia")); else c.toast("Gere a guia primeiro."); }}>Guia (STL)</button>
          <button className="btn" onClick={() => { c.setExtra("guide", null); c.setExtra("sleeves", null); setInfo([]); }}>Limpar guia</button>
          <button className="btn" onClick={() => { const g = c.extras.sleeves; if (g) download(`${p.name}-mangas.stl`, exportSTL(g.mesh, "mangas")); }}>Mangas (STL)</button>
        </div>
        {info.length > 0 && <table><thead><tr><th>Sítio</th><th>Ø</th><th>Prof.</th><th>Chave</th></tr></thead><tbody>{info.map((x) => <tr key={x.fdi}><td>{x.fdi}</td><td>{fmt(x.diameter)}</td><td>{fmt(x.depthMm)} mm</td><td>{fmt(x.drillKeyMm)} mm</td></tr>)}</tbody></table>}
      </Section>
    </div>
  );
}
