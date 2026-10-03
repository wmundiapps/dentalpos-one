import { useEffect, useRef, useState } from "react";
import { Section, Sel, download, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { job } from "./jobs";
import { DISCS } from "../core/cam";
import { designOf } from "../core/project";
import { MATERIALS } from "../core/materials";
import { exportSTL, makeZip, serializeProject } from "../core/io";
import { mergeMeshes, type Mesh } from "../core/mesh";
import { buildReportHtml } from "./ReportPanel";
import { restorations } from "./restoreStore";

interface Plan { disc: { diameter: number; height: number; label: string }; sinterFactor: number; utilization: number; warnings: string[]; unplaced: string[]; items: Array<{ id: string; x: number; y: number; reach: { unreachableMm3: number; ok: boolean } }> }

export function CamPanel({ c }: { c: Ctx }) {
  const { project: p, ev } = c.s;
  const [disc, setDisc] = useState("auto");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [meshes, setMeshes] = useState<Record<string, Mesh>>({});
  const cv = useRef<HTMLCanvasElement>(null);
  const scanUnits = [...restorations.values()].filter((r) => r.toCam);
  const units = [...ev.teeth.values()].filter((t) => designOf(p, t.fdi).kind !== "natural");
  useEffect(() => {
    const el = cv.current; if (!el || !plan) return;
    const x = el.getContext("2d")!, S = el.width, R = plan.disc.diameter / 2, k = (S / 2 - 8) / R;
    x.clearRect(0, 0, S, S); x.fillStyle = "#0c1623"; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 4, 0, 7); x.fill(); x.strokeStyle = "#4da3ff"; x.stroke();
    for (const it of plan.items) { x.fillStyle = it.reach.ok ? "#cdbf9d" : "#ff8a5c"; x.beginPath(); x.arc(S / 2 + it.x * k, S / 2 - it.y * k, 7 * k * 1.2, 0, 7); x.fill(); x.fillStyle = "#111"; x.font = "10px sans-serif"; x.textAlign = "center"; x.fillText(it.id, S / 2 + it.x * k, S / 2 - it.y * k + 3); }
  }, [plan]);
  const run = async () => {
    c.setBusy("Planejando CAM: compensação, pinos, nesting e fresabilidade…");
    const d = DISCS.find((x) => x.label === disc);
    const r = await job({ kind: "cam", project: p, disc: d, extra: scanUnits.map((r) => ({ id: `R${r.fdi}`, mesh: r.crown, material: r.material })) });
    c.setBusy(null);
    if (!r.ok || !r.meshes) return c.toast(r.error ?? "Falha");
    setPlan(r.data as Plan); setMeshes(r.meshes);
  };
  const exportZip = () => {
    const files: Array<{ name: string; data: string | Uint8Array | ArrayBuffer }> = [];
    for (const t of units) files.push({ name: `design/${t.fdi}.stl`, data: exportSTL(t.mesh, String(t.fdi)) });
    if (plan) for (const it of plan.items) { const m = [meshes[`u${it.id}`], meshes[`s${it.id}`]].filter(Boolean); if (m.length) files.push({ name: `cam/${it.id}-sinter${plan.sinterFactor}.stl`, data: exportSTL(mergeMeshes(m), it.id) }); }
    for (const r of scanUnits) files.push({ name: `design/R${r.fdi}-coroa-escaneamento.stl`, data: exportSTL(r.crown, `R${r.fdi}`) });
    files.push({ name: "projeto.dpcad.json", data: serializeProject(p) });
    files.push({ name: "relatorio.html", data: buildReportHtml(c.s) });
    if (plan) files.push({ name: "cam/job.json", data: JSON.stringify({ disc: plan.disc, sinterFactor: plan.sinterFactor, utilization: plan.utilization, items: plan.items }, null, 2) });
    download(`${p.name}-producao.zip`, makeZip(files), "application/zip");
  };
  return (
    <div data-testid="panel-cam">
      <h3>Materiais e produção (CAM)</h3>
      <p className="hint">Defina o tipo/material de cada dente na aba “Dentes”. Aqui: compensação de sinterização, pinos de fresagem, disposição no disco e checagem de alcance da fresa.</p>
      <Section title={`Restaurações (${units.length + scanUnits.length})`}>
        {scanUnits.length > 0 && <div className="card i"><div className="t">A partir do escaneamento</div>{scanUnits.map((r) => <div className="m" key={r.fdi}>Dente {r.fdi} — {MATERIALS[r.material].name}</div>)}</div>}
        {units.length === 0 && scanUnits.length === 0 ? <div className="hint">Nenhuma restauração definida — selecione dentes e escolha “Coroa”, “Faceta”, etc.</div> : (
          <table><thead><tr><th>Dente</th><th>Tipo</th><th>Material</th></tr></thead><tbody>{units.map((t) => { const d = designOf(p, t.fdi); return <tr key={t.fdi} style={{ cursor: "pointer" }} onClick={() => c.setSel(t.fdi)}><td>{t.fdi}</td><td>{d.kind}</td><td style={{ textAlign: "left" }}>{MATERIALS[d.material].name}</td></tr>; })}</tbody></table>)}
        <div className="btns"><button className="btn" onClick={() => c.s.set((q) => { const designs = { ...q.designs }; for (const f of q.fdis) if (f % 10 <= 3 && f < 30) designs[f] = { kind: "veneer", material: "emax-cad", prep: { axial: 0.5, occlusal: 1.0, finish: "chamfer", taperDeg: 8 } }; return { ...q, designs }; })}>Marcar 6 anteriores superiores como facetas e.max</button>
          <button className="btn" onClick={() => c.s.set((q) => { const designs = { ...q.designs }; for (const f of q.fdis) if (f < 30 && f % 10 >= 4) designs[f] = { kind: "crown", material: "zirconia-ml", prep: { axial: 1.0, occlusal: 1.5, finish: "chamfer", taperDeg: 10 } }; return { ...q, designs }; })}>Posteriores superiores: coroas de zircônia</button></div>
      </Section>
      <Section title="Disco / bloco">
        <Sel label="Disco" value={disc} options={[["auto", "Automático (menor disco)"], ...DISCS.map((d) => [d.label, d.label] as [string, string])]} onChange={setDisc} />
        <div className="btns"><button className="btn p" data-testid="btn-cam" onClick={run}>Planejar fresagem</button><button className="btn g" data-testid="btn-zip" onClick={exportZip}>Exportar pacote de produção (ZIP)</button></div>
      </Section>
      {plan && (<>
        <div className="card i"><div className="t">Disco {plan.disc.label} · fator de sinterização {fmt(plan.sinterFactor, 3)}</div><div className="m">Aproveitamento do disco: {fmt(plan.utilization * 100, 0)}% · {plan.items.length} unidade(s)</div></div>
        <canvas ref={cv} width={300} height={300} style={{ width: "100%", maxWidth: 300 }} />
        {plan.warnings.map((w, i) => <div key={i} className="card w"><div className="m">{w}</div></div>)}
      </>)}
    </div>
  );
}
