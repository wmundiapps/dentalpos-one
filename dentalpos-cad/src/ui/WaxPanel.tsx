import { useRef, useState } from "react";
import { Check, Section, Slider, download } from "./atoms";
import type { Ctx } from "./ctx";
import { job } from "./jobs";
import { buildJawVolume, WaxSculpt, type JawVolume } from "../core/wax";
import { exportSTL } from "../core/io";
import { mergeMeshes } from "../core/mesh";
import type { Jaw } from "../core/anatomy";

export function WaxPanel({ c }: { c: Ctx }) {
  const { project: p, ev } = c.s;
  const [jaw, setJaw] = useState<Jaw>("upper");
  const [tray, setTray] = useState({ thickness: 2, gap: 0.1, vents: true, coverGingiva: 2 });
  const [sculptOn, setSculptOn] = useState(false);
  const [tool, setTool] = useState<"add" | "carve" | "smooth">("add");
  const [radius, setRadius] = useState(1.6);
  const sculpt = useRef<{ s: WaxSculpt; v: JawVolume } | null>(null);
  const timer = useRef<number | null>(null);
  const toolR = useRef(tool); toolR.current = tool;
  const radiusR = useRef(radius); radiusR.current = radius;

  const refresh = () => {
    if (!sculpt.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { c.setExtra("wax", { id: "wax", mesh: sculpt.current!.s.mesh(), color: "#f0e2c0" }); }, 150);
  };
  const startSculpt = () => {
    c.setBusy("Preparando enceramento digital (volumes SDF)…");
    setTimeout(() => {
      const v = buildJawVolume(ev, jaw, 0.45);
      sculpt.current = { s: WaxSculpt.fromJaw(v), v };
      c.setHideTeeth(true);
      c.setExtra("wax", { id: "wax", mesh: sculpt.current.s.mesh(), color: "#f0e2c0" });
      setSculptOn(true); c.setBusy(null);
      c.pickHandler.current = (pt) => {
        const sc = sculpt.current; if (!sc) return;
        const r = radiusR.current;
        if (toolR.current === "add") sc.s.add([pt[0], pt[1] + 0.4, pt[2]], r); else if (toolR.current === "carve") sc.s.carve(pt, r); else sc.s.smooth(pt, r * 1.5, 0.8);
        refresh();
      };
      c.toast("Modo escultura: clique sobre a cera para adicionar, remover ou alisar.");
    }, 30);
  };
  const run = async (kind: "wax" | "tray") => {
    c.setBusy(kind === "wax" ? "Gerando enceramento e modelo…" : "Gerando bandeja de mockup…");
    const r = kind === "wax" ? await job({ kind: "wax", project: p, jaw, h: 0.4 }) : await job({ kind: "tray", project: p, jaw, opts: tray, h: 0.4 });
    c.setBusy(null);
    if (!r.ok || !r.meshes) return c.toast(r.error ?? "Falha");
    if (kind === "wax") { c.setExtra("gingiva", { id: "gingiva", mesh: r.meshes.gingiva, color: "#d27b82", opacity: 0.92 }); c.toast("Enceramento e gengiva gerados."); }
    else { c.setExtra("tray", { id: "tray", mesh: r.meshes.tray, color: "#7fd0ff", opacity: 0.55 }); c.toast("Bandeja de mockup gerada (STL pronto para impressão)."); }
  };
  const exp = (id: string, name: string) => { const e = c.extras[id]; if (!e) return c.toast("Gere primeiro."); download(`${p.name}-${name}.stl`, exportSTL(e.mesh, name)); };
  return (
    <div data-testid="panel-wax">
      <h3>Enceramento, modelo e mockup</h3>
      <p className="hint">O enceramento digital parte do projeto atual (dentes harmonizados). A bandeja de mockup é a casca sobre o enceramento, com respiros para injeção de resina bisacrílica.</p>
      <div className="field"><label><span>Arcada</span></label><select value={jaw} onChange={(e) => setJaw(e.target.value as Jaw)} data-testid="sel-jaw"><option value="upper">Superior</option><option value="lower">Inferior</option></select></div>
      <div className="btns">
        <button className="btn p" data-testid="btn-wax" onClick={() => run("wax")}>Gerar modelo + gengiva</button>
        <button className="btn" onClick={() => { c.setExtra("gingiva", null); c.setExtra("wax", null); c.setHideTeeth(false); setSculptOn(false); sculpt.current = null; c.pickHandler.current = null; }}>Limpar</button>
      </div>
      <Section title="Escultura de cera">
        <div className="btns">{(["add", "carve", "smooth"] as const).map((t) => (<button key={t} className={`btn ${tool === t ? "p" : ""}`} onClick={() => { setTool(t); }}>{t === "add" ? "＋ Adicionar" : t === "carve" ? "－ Remover" : "≈ Alisar"}</button>))}</div>
        <Slider label="Raio do instrumento" value={radius} min={0.6} max={4} step={0.1} unit=" mm" onChange={setRadius} />
        <div className="btns">
          {!sculptOn ? <button className="btn g" data-testid="btn-sculpt" onClick={startSculpt}>Iniciar escultura</button> : <button className="btn" onClick={() => { setSculptOn(false); c.pickHandler.current = null; c.setHideTeeth(false); c.setExtra("wax", null); }}>Encerrar escultura</button>}
          {sculptOn && <button className="btn" onClick={() => exp("wax", "enceramento")}>Exportar STL</button>}
        </div>
        {sculptOn && <div className="hint">Ferramenta: {tool === "add" ? "adicionar cera" : tool === "carve" ? "remover cera" : "alisar"}. Gire com o mouse; clique para aplicar.</div>}
      </Section>
      <Section title="Bandeja de mockup (guia de transferência)">
        <Slider label="Espessura da casca" value={tray.thickness} min={1} max={4} step={0.1} unit=" mm" onChange={(v) => setTray({ ...tray, thickness: v })} />
        <Slider label="Folga de assentamento" value={tray.gap} min={0} max={0.4} step={0.01} digits={2} unit=" mm" onChange={(v) => setTray({ ...tray, gap: v })} />
        <Slider label="Cobertura gengival" value={tray.coverGingiva} min={0} max={6} step={0.5} unit=" mm" onChange={(v) => setTray({ ...tray, coverGingiva: v })} />
        <Check label="Respiros de injeção (incisivos e caninos)" checked={tray.vents} onChange={(v) => setTray({ ...tray, vents: v })} />
        <div className="btns"><button className="btn p" data-testid="btn-tray" onClick={() => run("tray")}>Gerar bandeja de mockup</button><button className="btn" onClick={() => exp("tray", "mockup-bandeja")}>Exportar STL</button></div>
      </Section>
      <Section title="Exportar">
        <div className="btns"><button className="btn" onClick={() => { const ms = [...ev.teeth.values()].filter((t) => t.ref.jaw === jaw).map((t) => t.mesh); download(`${p.name}-dentes-${jaw}.stl`, exportSTL(mergeMeshes(ms), "dentes")); }}>Dentes da arcada (STL)</button><button className="btn" onClick={() => exp("gingiva", "gengiva")}>Gengiva (STL)</button></div>
      </Section>
    </div>
  );
}
