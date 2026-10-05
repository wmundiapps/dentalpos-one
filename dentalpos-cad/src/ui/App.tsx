import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { useCadStore } from "./store";
import { Viewer3D, type ColorMode, type ExtraMesh, type LineSet } from "./Viewer3D";
import { SmileView, type LmKey } from "./SmileView";
import { CasePanel } from "./CasePanel";
import { TeethPanel } from "./TeethPanel";
import { OcclusionPanel, contactColors } from "./OcclusionPanel";
import { SmilePanel } from "./SmilePanel";
import { WaxPanel } from "./WaxPanel";
import { GuidePanel, implantMeshes } from "./GuidePanel";
import { CamPanel } from "./CamPanel";
import { anatomyOf } from "../core/project";
import { ensureSculpted } from "./sculptLoader";
import { validateUpload } from "../security/upload";
import { RestorePanel } from "./RestorePanel";
import { ScanPanel } from "./ScanPanel";
import { ReportPanel } from "./ReportPanel";
import { AiPanel } from "./AiPanel";
import { download } from "./atoms";
import type { Ctx, SmileTool } from "./ctx";
import { mirrorFdi, toothRef } from "../core/anatomy";
import type { Severity } from "../core/rules";
import { createProject, type CadProject } from "../core/project";
import { parseProject, serializeProject } from "../core/io";
import { cylinderMesh } from "../core/primitives";
import { mergeMeshes } from "../core/mesh";

type Tab = "case" | "teeth" | "occlusion" | "smile" | "scan" | "restore" | "wax" | "guide" | "cam" | "ai" | "report";
const TABS: Array<[Tab, string, string]> = [["case", "◎", "Caso e biblioteca"], ["teeth", "🦷", "Dentes"], ["occlusion", "⚖", "Oclusão (Andrews)"], ["smile", "☺", "Sorriso / foto"], ["scan", "▦", "Escaneamento (STL)"], ["restore", "◉", "Restauração (coroa)"], ["wax", "✎", "Enceramento / mockup"], ["guide", "⌖", "Guia cirúrgico"], ["cam", "⚙", "Materiais / CAM"], ["ai", "✨", "IA e alertas"], ["report", "▤", "Relatório"]];
const UPPER = [17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27], LOWER = [47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37];

export interface AppProps { initialProject?: CadProject; onProjectChange?: (p: CadProject) => void; persist?: boolean; apiRef?: React.MutableRefObject<{ getProject: () => CadProject; setProject: (p: CadProject) => void } | null> }
export default function App({ initialProject, onProjectChange, persist = true, apiRef }: AppProps = {}) {
  const s = useCadStore(initialProject, persist);
  useEffect(() => { onProjectChange?.(s.project); }, [s.project, onProjectChange]);
  useEffect(() => { if (apiRef) apiRef.current = { getProject: () => s.project, setProject: (p) => s.replace(p) }; });
  const [tab, setTab] = useState<Tab>("case");
  const [sel, setSel] = useState<number | null>(null);
  const [extras, setExtras] = useState<Record<string, ExtraMesh>>({});
  const [lineSets, setLineSets] = useState<Record<string, LineSet[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [hideTeeth, setHideTeeth] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("shade");
  const [dragMode, setDragMode] = useState(false);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [showUpper, setShowUpper] = useState(true), [showLower, setShowLower] = useState(true);
  const [guides, setGuides] = useState(true);
  const [view, setView] = useState({ name: "iso", nonce: 0 });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<SmileTool>("move");
  const [sym, setSym] = useState(true);
  const [showDesign, setShowDesign] = useState(true), [split, setSplit] = useState<number | null>(null), [showGrid, setShowGrid] = useState(true);
  const pickHandler = useRef<((p: [number, number, number], id: string) => void) | null>(null);
  const toastTimer = useRef<number | null>(null);

  const toast = useCallback((m: string) => { setMsg(m); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setMsg(null), 5200); }, []);
  const setExtra = useCallback((id: string, e: ExtraMesh | null) => setExtras((x) => { const n = { ...x }; if (e) n[id] = e; else delete n[id]; return n; }), []);
  const setLines = useCallback((id: string, l: LineSet[] | null) => setLineSets((x) => { const n = { ...x }; if (l) n[id] = l; else delete n[id]; return n; }), []);

  // implantes planejados sempre refletem o projeto
  useEffect(() => { const m = implantMeshes(s.project.implants, s.ev); setExtra("implants-plan", m ? { id: "implants-plan", mesh: m, color: "#ffb454" } : null); }, [s.project.implants, s.ev, setExtra]);

  const severity = useMemo(() => {
    const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
    const m = new Map<number, Severity>();
    for (const i of s.report.issues) for (const t of i.teeth) { const cur = m.get(t); if (!cur || rank[i.severity] < rank[cur]) m.set(t, i.severity); }
    return m;
  }, [s.report]);
  const [gumLite, setGumLite] = useState(true);
  const gumMeshes = useMemo<ExtraMesh[]>(() => {
    if (!gumLite || hideTeeth) return [];
    const out: ExtraMesh[] = [];
    for (const jaw of ["upper", "lower"] as const) {
      if ((jaw === "upper" && !showUpper) || (jaw === "lower" && !showLower)) continue;
      const ts = [...s.ev.teeth.values()].filter((t) => t.ref.jaw === jaw).sort((a, b) => a.pose.arcPos - b.pose.arcPos);
      const apical = jaw === "upper" ? 1 : -1;
      const pts = ts.map((t) => [t.lm.cervicalCenter[0], t.lm.cervicalCenter[1] - 0.2, t.lm.cervicalCenter[2] + apical * 1.2] as [number, number, number]);
      if (pts.length < 2) continue;
      out.push({ id: `gum-${jaw}`, mesh: mergeMeshes(pts.slice(0, -1).map((p, i) => cylinderMesh(p, pts[i + 1], 3.4, 3.4, 14))), color: "#d98a93", opacity: 0.97 });
    }
    return out;
  }, [gumLite, hideTeeth, showUpper, showLower, s.ev]);
  const vertexColors = useMemo(() => (colorMode === "contact" ? contactColors(s.ev) : undefined), [colorMode, s.ev]);

  const lines = useMemo<LineSet[]>(() => {
    const out: LineSet[] = Object.values(lineSets).flat();
    if (guides && (tab === "occlusion" || tab === "case")) {
      const low = [...s.ev.teeth.values()].filter((t) => t.ref.jaw === "lower").sort((a, b) => a.pose.arcPos - b.pose.arcPos);
      const up = [...s.ev.teeth.values()].filter((t) => t.ref.jaw === "upper").sort((a, b) => a.pose.arcPos - b.pose.arcPos);
      out.push({ id: "lower-arch", pts: low.map((t) => t.lm.incisalMid), color: "#4da3ff" });
      out.push({ id: "upper-arch", pts: up.map((t) => t.lm.incisalMid), color: "#ffb454" });
      out.push({ id: "midline", pts: [[0, 12, -12], [0, 12, 14], [0, -2, 14]], color: "#ffffff" });
    }
    return out;
  }, [lineSets, guides, tab, s.ev]);

  // atalhos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); s.redo(); return; }
      if (!sel) return;
      const st = e.shiftKey ? 0.05 : 0.25, sa = e.shiftKey ? 0.5 : 2;
      const a = s.project.adjust[sel] ?? {};
      const m: Record<string, Partial<typeof a>> = {
        ArrowLeft: { dx: (a.dx ?? 0) - st }, ArrowRight: { dx: (a.dx ?? 0) + st }, ArrowUp: { dy: (a.dy ?? 0) + st }, ArrowDown: { dy: (a.dy ?? 0) - st },
        PageUp: { dz: (a.dz ?? 0) + st }, PageDown: { dz: (a.dz ?? 0) - st }, q: { rotation: (a.rotation ?? 0) - sa }, e: { rotation: (a.rotation ?? 0) + sa },
        t: { torque: (a.torque ?? 0) + sa }, g: { torque: (a.torque ?? 0) - sa }, r: { tip: (a.tip ?? 0) + sa }, f: { tip: (a.tip ?? 0) - sa },
      };
      const patch = m[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (patch) { e.preventDefault(); s.adjust(sel, patch, `kb${sel}`); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [sel, s]);

  /** edição direta do sorriso na foto: deltas em mm/graus/fatores; espelha no dente contralateral se "simétrico" */
  const editTooth = (fdi: number, d: { dx?: number; dz?: number; dy?: number; sh?: number; smd?: number; tip?: number; rot?: number; torque?: number }, key: string) => {
    const apply = (adj: NonNullable<typeof s.project.adjust[number]>, sgn: number) => ({
      ...adj, dx: (adj.dx ?? 0) + (d.dx ?? 0) * sgn, dy: (adj.dy ?? 0) + (d.dy ?? 0), dz: (adj.dz ?? 0) + (d.dz ?? 0),
      scaleH: Math.min(1.4, Math.max(0.6, (adj.scaleH ?? 1) * (1 + (d.sh ?? 0)))), scaleMd: Math.min(1.4, Math.max(0.6, (adj.scaleMd ?? 1) * (1 + (d.smd ?? 0)))),
      tip: (adj.tip ?? 0) + (d.tip ?? 0), rotation: (adj.rotation ?? 0) + (d.rot ?? 0) * sgn, torque: (adj.torque ?? 0) + (d.torque ?? 0),
    });
    s.set((q) => {
      const adjust = { ...q.adjust, [fdi]: apply(q.adjust[fdi] ?? {}, 1) };
      const mf = mirrorFdi(fdi);
      if (sym && q.fdis.includes(mf) && mf !== fdi) adjust[mf] = apply(q.adjust[mf] ?? {}, -1);
      return { ...q, adjust };
    }, key);
  };
  const moveSmile = (dxMm: number, dzMm: number, dCant: number) => s.set((q) => ({ ...q, smile: { ...q.smile, offsetXmm: q.smile.offsetXmm + dxMm, offsetZmm: q.smile.offsetZmm + dzMm, cantDeg: q.smile.cantDeg + dCant } }), "smv");
  useEffect(() => { if (s.project.library !== "procedural") ensureSculpted(s.project.fdis, s.ev.mods, (f) => anatomyOf(s.project, toothRef(f))); }, [s.project.fdis, s.project.library, s.ev.mods, s.project.anatomy]);
  const smileUi = { activeKey, setActiveKey, showDesign, setShowDesign, split, setSplit, showGrid, setShowGrid, zoom, setZoom, tool, setTool, sym, setSym };
  const fitView = () => setView((v) => ({ name: "fit", nonce: v.nonce + 1 }));
  const ctx: Ctx = { fitView, s, sel, setSel, extras, setExtra, setLines, busy, setBusy, toast, photoUrl, setPhotoUrl, hideTeeth, setHideTeeth, colorMode, setColorMode, dragMode, setDragMode, setHighlight, pickHandler, smileUi };

  const setLandmark = (key: LmKey | "mouth", pt: [number, number]) => {
    s.set((q) => (q.photo ? { ...q, photo: { ...q.photo, landmarks: { ...q.photo.landmarks, [key]: pt } } } : q));
    const order = ["pupilR", "pupilL", "facialMidTop", "facialMidBottom", "upperLipMid", "lowerLipMid", "commissureR", "commissureL", "forehead", "chin", "zygR", "zygL", "gonR", "gonL", "mouth"];
    const nx = order[order.indexOf(key) + 1]; setActiveKey(nx ?? null);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const smileTab = tab === "smile";
  const resetView = (name: string) => {
    setView((v) => ({ name, nonce: v.nonce + 1 }));
    setShowUpper(name !== "lower"); setShowLower(name !== "upper");
  };

  return (
    <div className="app">
      <div className="top">
        <div className="brand">🦷 <span><b>DentalPos</b> CAD <small>v0.1 · módulo independente</small></span></div>
        <input type="text" value={s.project.name} onChange={(e) => s.set((q) => ({ ...q, name: e.target.value }), "name")} style={{ width: 220 }} aria-label="Nome do caso" />
        <div className="sp" />
        <button className="btn" onClick={s.undo} disabled={!s.canUndo} title="Ctrl+Z" data-testid="btn-undo">↶ Desfazer</button>
        <button className="btn" onClick={s.redo} disabled={!s.canRedo}>↷ Refazer</button>
        <button className="btn" onClick={() => { s.replace(createProject({}, "Novo caso")); setExtras({}); setSel(null); setPhotoUrl(null); }} data-testid="btn-new">Novo</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Abrir…</button>
        <input ref={fileRef} type="file" accept=".json,.dpcad" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const v = await validateUpload(f, "project"); if (!v.ok) throw new Error(v.reason); s.replace(parseProject(new TextDecoder().decode(v.data))); toast("Projeto aberto."); } catch (err) { toast(String(err)); } }} />
        <button className="btn p" onClick={() => download(`${s.project.name}.dpcad.json`, serializeProject(s.project), "application/json")}>Salvar</button>
      </div>
      <div className="main">
        <div className="nav" data-testid="nav">
          {TABS.map(([k, ico, label], i) => (<Fragment key={k}><button className={tab === k ? "on" : ""} onClick={() => setTab(k)} data-testid={`tab-${k}`}><span className="ico">{ico}</span><span>{label}</span></button>{i === 8 || i === 9 ? <hr /> : null}</Fragment>))}
        </div>
        <div className="center">
          <div className="stage">
            {smileTab ? (
              <div className="smile-wrap"><SmileView project={s.project} ev={s.ev} photoUrl={photoUrl} showDesign={showDesign} split={split} showGrid={showGrid} zoom={zoom} activeKey={activeKey as LmKey | "mouth" | null} tool={tool} sym={sym} selected={sel} onSelectTooth={(f) => setSel(f)} onEditTooth={editTooth} onMoveSmile={moveSmile}
                onLandmark={setLandmark} onMouthFinish={(poly) => { s.set((q) => (q.photo ? { ...q, photo: { ...q.photo, landmarks: { ...q.photo.landmarks, mouth: poly } } } : q)); setActiveKey(null); toast("Contorno da boca definido."); }} />
                {!s.project.photo && <div style={{ position: "absolute", color: "var(--muted)", textAlign: "center" }}>Carregue uma foto frontal do sorriso ou use a foto de exemplo →</div>}
              </div>
            ) : (<>
              <Viewer3D ev={s.ev} shade={s.project.shade} selected={sel} onSelect={(f) => { setSel(f); setHighlight([]); if (f && tab === "case") setTab("teeth"); }} onDrag={(f, dx, dy) => { const a = s.project.adjust[f] ?? {}; s.adjust(f, { dx: (a.dx ?? 0) + dx, dy: (a.dy ?? 0) + dy }, `drag${f}`); }}
                showUpper={showUpper} showLower={showLower} colorMode={colorMode} severity={severity} vertexColors={vertexColors} extras={[...Object.values(extras), ...gumMeshes]} lines={lines} view={view} dragMode={dragMode} hideTeeth={hideTeeth} highlightTeeth={highlight}
                onPickPoint={(p, id) => pickHandler.current?.(p, id)} />
              <div className="hudbar"><div className="hud">
                {[["fit", "Enquadrar"], ["front", "Frontal"], ["left", "Esquerda"], ["right", "Direita"], ["upper", "Oclusal sup."], ["lower", "Oclusal inf."], ["iso", "3/4"]].map(([k, l]) => <button key={k} className="chip" onClick={() => resetView(k)} data-testid={`view-${k}`}>{l}</button>)}
              </div>
              <div className="hud r">
                <button className={`chip ${showUpper ? "on" : ""}`} onClick={() => setShowUpper(!showUpper)}>Superior</button>
                <button className={`chip ${showLower ? "on" : ""}`} onClick={() => setShowLower(!showLower)}>Inferior</button>
                <button className={`chip ${colorMode === "severity" ? "on" : ""}`} onClick={() => setColorMode(colorMode === "severity" ? "shade" : "severity")}>Cor por alerta</button>
                <button className={`chip ${colorMode === "ghost" ? "on" : ""}`} onClick={() => setColorMode(colorMode === "ghost" ? "shade" : "ghost")}>Transparência</button>
                <button className={`chip ${guides ? "on" : ""}`} onClick={() => setGuides(!guides)}>Linhas-guia</button>
                <button className={`chip ${gumLite ? "on" : ""}`} onClick={() => setGumLite(!gumLite)}>Gengiva</button>
              </div></div>
            </>)}
            {busy && <div className="busy"><div><span className="spin" />{busy}</div></div>}
          </div>
          <div>
            <div className="alerts" data-testid="alerts">
              <b style={{ color: s.report.overall >= 85 ? "var(--ok)" : "var(--warn)" }}>Qualidade {s.report.overall}</b>
              {s.report.issues.filter((i) => i.severity === "error" || i.severity === "warning").slice(0, 12).map((i) => (<div key={i.id} className={`alert ${i.severity === "error" ? "e" : "w"}`} title={i.message} onClick={() => { setTab("ai"); setHighlight(i.teeth); if (i.teeth[0]) setSel(i.teeth[0]); }}>{i.severity === "error" ? "⛔" : "⚠"} {i.title}</div>))}
              {s.report.counts.error + s.report.counts.warning === 0 && <span className="hint">Nenhum alerta — projeto dentro das regras clínicas.</span>}
            </div>
            <div className="odonto" data-testid="odonto">
              {[UPPER, LOWER].map((row, ri) => (
                <div className="row" key={ri}>{row.map((f, i) => {
                  const sv = severity.get(f), d = s.project.designs[f];
                  return (<Fragment key={f}>{i === 7 && <div className="mid" />}<div className={`tooth ${sel === f ? "sel" : ""} ${sv === "error" ? "e" : sv === "warning" ? "w" : sv === "info" ? "i" : ""}`} data-testid={`tooth-${f}`} onClick={() => { setSel(f); setHighlight([]); if (tab === "case" || tab === "ai") setTab("teeth"); }}>{f}{d && d.kind !== "natural" && <span className="k">{d.kind === "crown" ? "C" : d.kind === "veneer" ? "F" : d.kind === "pontic" ? "P" : d.kind === "implant-crown" ? "I" : "•"}</span>}</div></Fragment>);
                })}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="side">
          {tab === "case" && <CasePanel c={ctx} />}
          {tab === "teeth" && <TeethPanel c={ctx} />}
          {tab === "occlusion" && <OcclusionPanel c={ctx} />}
          {tab === "smile" && <SmilePanel c={ctx} />}
          {tab === "scan" && <ScanPanel c={ctx} />}
          {tab === "restore" && <RestorePanel c={ctx} />}
          {tab === "wax" && <WaxPanel c={ctx} />}
          {tab === "guide" && <GuidePanel c={ctx} />}
          {tab === "cam" && <CamPanel c={ctx} />}
          {tab === "ai" && <AiPanel c={ctx} />}
          {tab === "report" && <ReportPanel c={ctx} />}
        </div>
      </div>
      {msg && <div className="toast" data-testid="toast">{msg}</div>}
    </div>
  );
}
export type { CadProject };
