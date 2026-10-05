import { useState } from "react";
import { Sel, Slider, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { ANDREWS_NORMS, mirrorFdi, toothRef } from "../core/anatomy";
import { MATERIALS, materialList, type MaterialId } from "../core/materials";
import { designOf, toWorldMesh, type RestorationKind } from "../core/project";
import { DEFAULT_PREP } from "../core/crown";
import { job } from "./jobs";
import { validateUpload } from "../security/upload";
import { importMesh } from "../core/io";
import { meshToCustom } from "../core/library";
import { ANATOMY_LABEL, DEFAULT_ANATOMY, type AnatomyParams } from "../core/toothSdf";
import { anatomyOf } from "../core/project";
import { isAnterior } from "../core/anatomy";

const KINDS: Array<[RestorationKind, string]> = [["natural", "Dente natural / planejamento"], ["crown", "Coroa total"], ["veneer", "Faceta / laminado"], ["inlay", "Inlay"], ["onlay", "Onlay"], ["pontic", "Pôntico (ponte)"], ["implant-crown", "Coroa sobre implante"], ["provisional", "Provisório"], ["wax", "Enceramento diagnóstico"], ["denture-tooth", "Dente de prótese"]];

export function TeethPanel({ c }: { c: Ctx }) {
  const { project: p, ev } = c.s;
  const f = c.sel;
  const [stats, setStats] = useState<string | null>(null);
  const [scope, setScope] = useState<"tooth" | "type" | "mirror">("type");
  if (!f || !ev.teeth.has(f)) {
    return (<div data-testid="panel-teeth"><h3>Dentes</h3><p className="hint">Clique em um dente no modelo 3D ou no odontograma para editar posição, rotação, torque, dimensões e restauração.</p>
      <div className="card"><div className="t">Atalhos (dente selecionado)</div><div className="tip"><span className="kbd">←</span> <span className="kbd">→</span> mesio-distal · <span className="kbd">↑</span> <span className="kbd">↓</span> vestíbulo-lingual · <span className="kbd">PgUp</span> <span className="kbd">PgDn</span> altura · <span className="kbd">Q</span> <span className="kbd">E</span> rotação · <span className="kbd">T</span> <span className="kbd">G</span> torque · <span className="kbd">Shift</span> = passo fino · <span className="kbd">Ctrl+Z</span> desfaz</div></div></div>);
  }
  const t = ev.teeth.get(f)!, ref = toothRef(f), adj = p.adjust[f] ?? {}, d = designOf(p, f), norm = ANDREWS_NORMS[ref.jaw][ref.type];
  const prep = d.prep ?? DEFAULT_PREP;
  const setD = (patch: Partial<typeof d>) => c.s.set((q) => ({ ...q, designs: { ...q.designs, [f]: { ...designOf(q, f), ...patch } } }));
  const mf = mirrorFdi(f);
  return (
    <div data-testid="panel-teeth">
      <h3>Dente {f} <span className="badge">{ref.name}</span></h3>
      <div className="hint">Largura {fmt(t.dims.md)} · Espessura {fmt(t.dims.bl)} · Altura {fmt(t.dims.h)} mm</div>
      {p.library !== "procedural" && !p.customTeeth?.[f] && (() => {
        const an = anatomyOf(p, ref), ant = isAnterior(ref.type);
        const keys = (Object.keys(ANATOMY_LABEL) as Array<keyof AnatomyParams>).filter((k) => (ant ? ANATOMY_LABEL[k][2] : ANATOMY_LABEL[k][3]));
        const setAn = (k: keyof AnatomyParams, v: number) => c.s.set((q) => {
          const A = { ...(q.anatomy ?? {}) };
          if (scope === "type") A.byType = { ...(A.byType ?? {}), [`${ref.jaw}-${ref.type}`]: { ...(A.byType?.[`${ref.jaw}-${ref.type}`] ?? {}), [k]: v } };
          else { const by = { ...(A.byTooth ?? {}) }; for (const ff of scope === "mirror" ? [f, mf] : [f]) by[ff] = { ...(by[ff] ?? {}), [k]: v }; A.byTooth = by; }
          return { ...q, anatomy: A };
        }, `an${k}${f}${scope}`);
        return (<>
          <h4>Anatomia (escultura)</h4>
          <div className="hint">Ajusta o desenho do dente da biblioteca. A malha é regenerada em segundo plano (alguns segundos).</div>
          <Sel label="Aplicar a" value={scope} options={[["type", `Todos os ${ref.jaw === "upper" ? "superiores" : "inferiores"} deste tipo`], ["tooth", "Só este dente"], ["mirror", "Este dente e o do lado oposto"]]} onChange={setScope} />
          {keys.map((k) => <Slider key={k} label={ANATOMY_LABEL[k][0]} value={an[k]} min={0.4} max={1.8} step={0.05} digits={2} unit="×" onChange={(v) => setAn(k, v)} />)}
          <div className="btns"><button className="btn" onClick={() => c.s.set((q) => { const A = { ...(q.anatomy ?? {}) }; if (A.byType) { const bt = { ...A.byType }; delete bt[`${ref.jaw}-${ref.type}`]; A.byType = bt; } if (A.byTooth) { const bo = { ...A.byTooth }; delete bo[f]; delete bo[mf]; A.byTooth = bo; } return { ...q, anatomy: A }; })}>Voltar ao padrão</button>
            <button className="btn" onClick={() => c.s.set((q) => ({ ...q, anatomy: undefined }))}>Zerar toda a anatomia</button></div>
          <div className="hint" style={{ opacity: 0.7 }}>Padrão = 1,00× em todos ({Object.keys(DEFAULT_ANATOMY).length} parâmetros).</div>
        </>);
      })()}
      <div className="btns">
        <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={c.dragMode} onChange={(e) => c.setDragMode(e.target.checked)} /> arrastar no 3D</label>
        <button className="btn" onClick={() => c.s.set((q) => { const a = { ...q.adjust }; delete a[f]; return { ...q, adjust: a }; })}>Resetar dente</button>
        {ev.teeth.has(mf) && <button className="btn" onClick={() => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [mf]: { ...(q.adjust[f] ?? {}), dx: -(q.adjust[f]?.dx ?? 0), tip: q.adjust[f]?.tip, torque: q.adjust[f]?.torque, rotation: -(q.adjust[f]?.rotation ?? 0), scale: q.adjust[f]?.scale, scaleMd: q.adjust[f]?.scaleMd, scaleH: q.adjust[f]?.scaleH, dy: q.adjust[f]?.dy, dz: q.adjust[f]?.dz } } }))}>Espelhar → {mf}</button>}
      </div>
      <h4>Posição</h4>
      <Slider label="Mesio-distal (→ esquerda do paciente)" value={adj.dx ?? 0} min={-4} max={4} step={0.05} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), dx: v } } }), `dx${f}`)} testid="sl-dx" />
      <Slider label="Vestíbulo-lingual (anterior +)" value={adj.dy ?? 0} min={-4} max={4} step={0.05} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), dy: v } } }), `dy${f}`)} />
      <Slider label="Altura (cranial +)" value={adj.dz ?? 0} min={-3} max={3} step={0.05} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), dz: v } } }), `dz${f}`)} />
      <h4>Orientação (norma de Andrews: tip {norm.tip}° · torque {norm.torque}°)</h4>
      <Slider label="Angulação / tip (Δ)" value={adj.tip ?? 0} min={-20} max={20} step={0.5} unit="°" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), tip: v } } }), `tip${f}`)} />
      <Slider label="Inclinação / torque (Δ)" value={adj.torque ?? 0} min={-25} max={25} step={0.5} unit="°" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), torque: v } } }), `tq${f}`)} />
      <Slider label="Rotação" value={adj.rotation ?? 0} min={-40} max={40} step={0.5} unit="°" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), rotation: v } } }), `rot${f}`)} />
      <div className="hint">Tip efetivo {fmt(t.pose.tip, 1)}° · torque efetivo {fmt(t.pose.torque, 1)}°</div>
      <h4>Dimensões</h4>
      <Slider label="Largura (mesio-distal)" value={adj.scaleMd ?? 1} min={0.7} max={1.3} step={0.01} digits={2} unit="×" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), scaleMd: v } } }), `smd${f}`)} />
      <Slider label="Altura da coroa" value={adj.scaleH ?? 1} min={0.7} max={1.3} step={0.01} digits={2} unit="×" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), scaleH: v } } }), `sh${f}`)} />
      <Slider label="Escala geral" value={adj.scale ?? 1} min={0.7} max={1.3} step={0.01} digits={2} unit="×" onChange={(v) => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [f]: { ...(q.adjust[f] ?? {}), scale: v } } }), `sc${f}`)} />
      <h4>Biblioteca personalizada</h4>
      <div className="hint">Use um STL/OBJ/PLY de dente (x = distal, y = vestibular, z = oclusal) no lugar do dente paramétrico. O modelo é ajustado às dimensões do dente.</div>
      <div className="btns">
        <label className="btn" style={{ cursor: "pointer" }}>Importar STL deste dente…<input type="file" accept=".stl,.obj,.ply" hidden data-testid="file-tooth" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const v = await validateUpload(file, "mesh"); if (!v.ok) throw new Error(v.reason); const m = importMesh(file.name, v.data); c.s.set((q) => ({ ...q, customTeeth: { ...(q.customTeeth ?? {}), [f]: meshToCustom(m, file.name) } })); c.toast(`Modelo ${file.name} aplicado ao dente ${f}.`); } catch (err) { c.toast(String(err)); } }} /></label>
        {p.customTeeth?.[f] && <button className="btn d" onClick={() => c.s.set((q) => { const ct = { ...(q.customTeeth ?? {}) }; delete ct[f]; return { ...q, customTeeth: ct }; })}>Voltar ao paramétrico</button>}
      </div>
      {p.customTeeth?.[f] && <div className="hint">Modelo personalizado: {p.customTeeth[f].name}</div>}
      <h4>Restauração e material</h4>
      <Sel label="Tipo" value={d.kind} options={KINDS} onChange={(v) => setD({ kind: v })} testid="sel-kind" />
      <Sel label="Material" value={d.material} options={materialList().map((m) => [m.id, m.name] as [MaterialId, string])} onChange={(v) => setD({ material: v })} />
      <div className="hint">{MATERIALS[d.material].brandsRef}. {MATERIALS[d.material].note}</div>
      {d.kind !== "natural" && d.kind !== "wax" && (<>
        <Slider label="Redução axial do preparo" value={prep.axial} min={0.2} max={2} step={0.05} unit=" mm" onChange={(v) => setD({ prep: { ...prep, axial: v } })} />
        <Slider label="Redução oclusal / incisal" value={prep.occlusal} min={0.3} max={3} step={0.05} unit=" mm" onChange={(v) => setD({ prep: { ...prep, occlusal: v } })} />
        <Slider label="Conicidade total das paredes" value={prep.taperDeg} min={0} max={30} step={1} unit="°" onChange={(v) => setD({ prep: { ...prep, taperDeg: v } })} />
        <Sel label="Término" value={prep.finish} options={[["chamfer", "Chanfro"], ["shoulder", "Ombro arredondado"], ["featheredge", "Bisel"], ["knife", "Lâmina de faca"]]} onChange={(v) => setD({ prep: { ...prep, finish: v } })} />
        <div className="btns"><button className="btn p" data-testid="btn-thickness" onClick={async () => {
          c.setBusy("Gerando preparo, casca e mapa de espessura 3D…");
          const r = await job({ kind: "crown", project: p, fdi: f, spec: prep });
          c.setBusy(null);
          if (!r.ok || !r.meshes) return c.toast(r.error ?? "Falha");
          c.setExtra("crown-shell", { id: "crown-shell", mesh: toWorldMesh(t, r.meshes.shell), color: "#f2e6c8", opacity: 0.9 });
          c.setExtra("crown-prep", { id: "crown-prep", mesh: toWorldMesh(t, r.meshes.prep), color: "#c9884f" });
          c.setHideTeeth(true);
          const s = (r.data as { stats: { minAxial: number; meanAxial: number; minOcclusal: number; meanOcclusal: number } }).stats;
          setStats(`Espessura axial mín. ${fmt(s.minAxial, 2)} mm (média ${fmt(s.meanAxial, 2)}) · oclusal mín. ${fmt(s.minOcclusal, 2)} mm (média ${fmt(s.meanOcclusal, 2)}) · mín. do material: ${fmt(MATERIALS[d.material].min.axialPosterior)} / ${fmt(MATERIALS[d.material].min.occlusal)} mm`);
        }}>Verificar espessura 3D</button>
          <button className="btn" onClick={() => { c.setExtra("crown-shell", null); c.setExtra("crown-prep", null); c.setHideTeeth(false); setStats(null); }}>Voltar ao modelo</button></div>
        {stats && <div className="card i"><div className="t">Mapa de espessura</div><div className="m">{stats}</div></div>}
      </>)}
    </div>
  );
}
