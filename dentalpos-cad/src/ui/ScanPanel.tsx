import { useRef, useState } from "react";
import * as THREE from "three";
import { Check, Section, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { loadSTLFile } from "../scan/engine/meshLoader";
import { validateUpload } from "../security/upload";
import { fixStlHeader } from "../core/io";
import { diagnoseMesh, type MeshDiagnosticResult } from "../scan/engine/meshDiagnostics";
import { repairMesh } from "../scan/engine/meshRepair";
import { exportGeometryToSTL } from "../scan/engine/stlExporter";
import { analyzeToothThickness, type ThicknessAnalysisResult } from "../scan/engine/toothThicknessAnalysis";
import { analyzeContactMap, type ContactMapResult } from "../scan/engine/toothContactMap";
import { analyzePreparationFit, type PreparationFitResult } from "../scan/engine/toothPreparationFit";
import { alignCrownToArch, bestInsertionAxis, marginCurve, orientFromLandmarks, type MultiIcpResult } from "../core/scan";
import type { Mesh } from "../core/mesh";
import type { Vec3 } from "../core/math";

type Kind = "work" | "antagonist" | "bite" | "crown";
const LABEL: Record<Kind, string> = { work: "Arcada de trabalho (preparo)", antagonist: "Antagonista", bite: "Registro de mordida", crown: "Coroa de CAD externo (ex.: exocad)" };
const COLOR: Record<Kind, string> = { work: "#c9b48a", antagonist: "#8fb4d9", bite: "#d98f8f", crown: "#f4ead2" };
interface Scan { geometry: THREE.BufferGeometry; fileName: string; diag: MeshDiagnosticResult | null; visible?: boolean }
// os escaneamentos ficam fora do estado do projeto (são grandes) e vivem enquanto a página estiver aberta
const store: Partial<Record<Kind, Scan>> = {};
export const getScans = () => store;
export const getManualMargin = () => margin;
export const meshOfScan = (k: Kind): Mesh | null => { const s = store[k]; return s ? toMesh(s.geometry) : null; };
let margin: Vec3[] = [];
let landmarks: Vec3[] = [];

const toMesh = (g: THREE.BufferGeometry): Mesh => {
  const p = g.getAttribute("position");
  const positions = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { positions[i * 3] = p.getX(i); positions[i * 3 + 1] = p.getY(i); positions[i * 3 + 2] = p.getZ(i); }
  const idx = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: p.count }, (_, i) => i);
  return { positions, indices: idx };
};
const asThree = (m: Mesh) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
};

export function ScanPanel({ c }: { c: Ctx }) {
  const [, tick] = useState(0);
  const refresh = () => tick((n) => n + 1);
  const [mode, setMode] = useState<"none" | "orient" | "margin">("none");
  const [insertion, setInsertion] = useState<{ undercut: number; vertical: number; axis: Vec3 } | null>(null);
  const [thick, setThick] = useState<ThicknessAnalysisResult | null>(null);
  const [contact, setContact] = useState<ContactMapResult | null>(null);
  const [fit, setFit] = useState<PreparationFitResult | null>(null);
  const inputs = useRef<Partial<Record<Kind, HTMLInputElement | null>>>({});
  const { project: p, ev } = c.s;
  const t = c.sel ? ev.teeth.get(c.sel) : null;

  const show = (k: Kind) => { const s = store[k]; c.setExtra(`scan-${k}`, s && s.visible !== false ? { id: `scan-${k}`, mesh: toMesh(s.geometry), color: COLOR[k], opacity: k === "bite" ? 0.7 : 1 } : null); };
  const drawLines = () => {
    const ls = [];
    if (margin.length > 1) ls.push({ id: "margin", pts: marginCurve(margin, 8).polyline, color: "#ff5d5d", closed: true });
    c.setLines("scan", ls.length ? ls : null);
  };
  const load = async (k: Kind, file: File) => {
    try {
      c.setBusy(`Carregando ${file.name}…`);
      const v = await validateUpload(file, "mesh"); if (!v.ok) throw new Error(`${file.name}: ${v.reason}`);
      const l = await loadSTLFile(new File([fixStlHeader(v.data)], file.name));
      if (l.width < 1e-3 && l.height < 1e-3 && l.depth < 1e-3) throw new Error(`${file.name}: arquivo vazio ou corrompido (${l.triangles.toLocaleString("pt-BR")} triângulos, mas todos os vértices valem zero). Exporte o STL novamente do scanner/CAD.`);
      const geometry = l.geometry; geometry.computeVertexNormals();
      store[k] = { geometry, fileName: file.name, diag: null };
      show(k); c.setHideTeeth(true); setTimeout(() => c.fitView(), 150); c.toast(`${LABEL[k]}: ${l.triangles.toLocaleString("pt-BR")} triângulos (${fmt(l.width)}×${fmt(l.height)}×${fmt(l.depth)} mm).`);
    } catch (e) { c.toast(e instanceof Error ? e.message : String(e)); }
    c.setBusy(null); refresh();
  };
  const startPick = (m: "orient" | "margin") => {
    setMode(m);
    if (m === "orient") landmarks = [];
    c.pickHandler.current = (pt, id) => {
      if (!id.startsWith("scan-")) return;
      if (m === "margin") { margin = [...margin, pt]; drawLines(); refresh(); return; }
      landmarks = [...landmarks, pt];
      c.toast(`Ponto ${landmarks.length}/3 marcado.`);
      if (landmarks.length === 3) {
        const o = orientFromLandmarks(landmarks[0], landmarks[1], landmarks[2]);
        const M = new THREE.Matrix4().set(o.T.R[0], o.T.R[1], o.T.R[2], o.T.t[0], o.T.R[3], o.T.R[4], o.T.R[5], o.T.t[1], o.T.R[6], o.T.R[7], o.T.R[8], o.T.t[2], 0, 0, 0, 1);
        for (const k of Object.keys(store) as Kind[]) { store[k]!.geometry.applyMatrix4(M); store[k]!.geometry.computeVertexNormals(); show(k); }
        margin = []; drawLines();
        c.pickHandler.current = null; setMode("none");
        c.s.set((q) => ({ ...q, arches: { ...q.arches, [kindJaw()]: { ...q.arches[kindJaw()], width: Math.round(o.width * 2) / 2, depth: Math.round(o.depth * 2) / 2 } } }));
        c.toast(`Escaneamento orientado ao projeto. Arco ${kindJaw() === "upper" ? "superior" : "inferior"} ajustado: largura ${fmt(o.width)} mm, profundidade ${fmt(o.depth)} mm.`);
      }
    };
  };
  const autoCenter = () => {
    const ref = store.work ?? store.antagonist; if (!ref) return c.toast("Importe uma arcada.");
    const g = ref.geometry; g.computeBoundingBox(); const bb = g.boundingBox!;
    const pos = g.getAttribute("position"); let cy = 0; for (let i = 0; i < pos.count; i++) cy += pos.getY(i); cy /= pos.count;
    const anteriorPlus = cy > (bb.min.y + bb.max.y) / 2; // o centroide do arco fica do lado anterior (fechado)
    const flip = !anteriorPlus;
    const tx = -(bb.min.x + bb.max.x) / 2, ty = flip ? bb.min.y : -bb.max.y;
    for (const k of Object.keys(store) as Kind[]) {
      const geo = store[k]!.geometry;
      if (flip) { geo.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1)); const idx = geo.index; if (idx) { const a = idx.array as Uint32Array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } idx.needsUpdate = true; } else { const pa = geo.getAttribute("position"); for (let i = 0; i + 2 < pa.count; i += 3) { const x = pa.getX(i + 1), y = pa.getY(i + 1), z = pa.getZ(i + 1); pa.setXYZ(i + 1, pa.getX(i + 2), pa.getY(i + 2), pa.getZ(i + 2)); pa.setXYZ(i + 2, x, y, z); } } }
      geo.applyMatrix4(new THREE.Matrix4().makeTranslation(tx, ty, 0)); geo.computeVertexNormals(); show(k);
    }
    setTimeout(() => c.fitView(), 150);
    c.toast(`Escaneamento centralizado (x ${fmt(tx)} mm, y ${fmt(ty)} mm); anterior em +Y.`);
  };
  const kindJaw = (): "upper" | "lower" => (c.sel && c.sel >= 30 ? "lower" : "upper");
  const stop = () => { c.pickHandler.current = null; setMode("none"); };
  const diagnose = (k: Kind) => { const s = store[k]; if (!s) return; s.diag = diagnoseMesh(s.geometry); refresh(); };
  const repair = (k: Kind) => {
    const s = store[k]; if (!s) return;
    const r = repairMesh(s.geometry); s.geometry = r.geometry; s.geometry.computeVertexNormals(); s.diag = diagnoseMesh(s.geometry); show(k);
    c.toast(`Reparo: ${r.removedDuplicateTriangles} duplicados e ${r.removedDegenerateTriangles} degenerados removidos.`); refresh();
  };
  const toothThree = () => (t ? asThree(t.mesh) : null);
  const run = (what: "thick" | "contact" | "fit") => {
    const tm = toothThree(); if (!tm) return c.toast("Selecione um dente do projeto.");
    c.setBusy("Analisando…");
    setTimeout(() => {
      try {
        if (what === "thick") setThick(analyzeToothThickness(tm, { minimumThickness: 0.5, warningThickness: 0.8 }));
        if (what === "contact") { const a = store.antagonist; if (!a) throw new Error("Importe o antagonista."); setContact(analyzeContactMap(tm, new THREE.Mesh(a.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))); }
        if (what === "fit") { const w = store.work; if (!w) throw new Error("Importe a arcada de trabalho."); setFit(analyzePreparationFit(tm, new THREE.Mesh(w.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))); }
      } catch (e) { c.toast(e instanceof Error ? e.message : String(e)); }
      c.setBusy(null);
    }, 30);
  };
  const analyseInsertion = () => {
    const w = store.work; if (!w) return c.toast("Importe a arcada de trabalho.");
    c.setBusy("Procurando o melhor eixo de inserção…");
    setTimeout(() => { const m = toMesh(w.geometry); const r = bestInsertionAxis(m, [0, 0, 1], 30); setInsertion({ undercut: r.undercut, vertical: r.undercutAtVertical, axis: r.axis }); c.setBusy(null); }, 30);
  };
  const [icp, setIcp] = useState<MultiIcpResult | null>(null);
  const crownBackup = useRef<THREE.BufferGeometry | null>(null);
  const alignCrown = () => {
    const w = store.work, cr = store.crown; if (!w || !cr) return c.toast("Importe a arcada de trabalho e a coroa.");
    crownBackup.current = cr.geometry.clone();
    c.setBusy("Alinhando a coroa ao arco (ICP com várias partidas)… 0%");
    const a = toMesh(w.geometry), m = toMesh(cr.geometry);
    let worker: Worker | null = null;
    if (location.protocol !== "file:") { try { worker = new Worker(new URL("./icpWorker.ts", import.meta.url), { type: "module" }); } catch { worker = null; } }
    if (!worker) { // sem Web Worker (ex.: HTML aberto do disco): executa na thread principal
      setTimeout(() => {
        const r = alignCrownToArch(m, a, {});
        setIcp(r);
        const M = new THREE.Matrix4().set(r.T.R[0], r.T.R[1], r.T.R[2], r.T.t[0], r.T.R[3], r.T.R[4], r.T.R[5], r.T.t[1], r.T.R[6], r.T.R[7], r.T.R[8], r.T.t[2], 0, 0, 0, 1);
        cr.geometry.applyMatrix4(M); cr.geometry.computeVertexNormals(); show("crown"); setTimeout(() => c.fitView(), 100);
        c.setBusy(null); refresh(); c.toast(r.confident ? `Coroa alinhada (erro médio ${fmt(r.rms, 2)} mm).` : `Alinhamento aproximado (erro médio ${fmt(r.rms, 2)} mm). Confira visualmente.`);
      }, 50);
      return;
    }
    worker.onmessage = (e: MessageEvent<{ progress?: number; done?: MultiIcpResult }>) => {
      if (e.data.progress !== undefined) c.setBusy(`Alinhando a coroa ao arco (ICP com várias partidas)… ${Math.round(e.data.progress * 100)}%`);
      if (e.data.done) {
        const r = e.data.done; worker!.terminate(); setIcp(r);
        const M = new THREE.Matrix4().set(r.T.R[0], r.T.R[1], r.T.R[2], r.T.t[0], r.T.R[3], r.T.R[4], r.T.R[5], r.T.t[1], r.T.R[6], r.T.R[7], r.T.R[8], r.T.t[2], 0, 0, 0, 1);
        cr.geometry.applyMatrix4(M); cr.geometry.computeVertexNormals(); show("crown"); setTimeout(() => c.fitView(), 100);
        c.setBusy(null); refresh();
        c.toast(r.confident ? `Coroa alinhada (erro médio ${fmt(r.rms, 2)} mm).` : `Alinhamento aproximado (erro médio ${fmt(r.rms, 2)} mm, ${fmt(r.coverage * 100, 0)} % da face interna encostada). Confira visualmente.`);
      }
    };
    worker.onerror = () => { worker!.terminate(); c.setBusy(null); c.toast("Falha ao executar o alinhamento."); };
    worker.postMessage({ crown: m, arch: a }, [m.positions.buffer, m.indices.buffer, a.positions.buffer, a.indices.buffer]);
  };
  const kinds: Kind[] = ["work", "antagonist", "bite", "crown"];
  return (
    <div data-testid="panel-scan">
      <h3>Escaneamento e restauração</h3>
      <p className="hint">Motor trazido do DentalPos One (STL, diagnóstico/reparo, preparo, contato, espessura), ligado ao projeto de arco e às regras clínicas deste módulo.</p>
      <Section title="Arquivos STL">
        {kinds.map((k) => (
          <div key={k} className="card">
            <div className="t">{LABEL[k]} {store[k] && <span className="badge o">{store[k]!.fileName}</span>}</div>
            <input ref={(el) => { inputs.current[k] = el; }} type="file" accept=".stl" hidden data-testid={`file-scan-${k}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) load(k, f); e.target.value = ""; }} />
            <div className="btns">
              <button className="btn" onClick={() => inputs.current[k]?.click()}>{store[k] ? "Trocar…" : "Importar STL…"}</button>
              {store[k] && <><button className="btn" data-testid={`vis-${k}`} onClick={() => { store[k]!.visible = store[k]!.visible === false; show(k); refresh(); }}>{store[k]!.visible === false ? "Mostrar" : "Ocultar"}</button><button className="btn" onClick={() => diagnose(k)}>Diagnosticar</button><button className="btn" onClick={() => repair(k)}>Reparar</button><button className="btn" onClick={() => exportGeometryToSTL(store[k]!.geometry, `${k}-reparado.stl`)}>Exportar</button><button className="btn d" onClick={() => { delete store[k]; show(k); refresh(); }}>Remover</button></>}
            </div>
            {store[k]?.diag && (() => { const d = store[k]!.diag!; return (<div className={`card ${d.healthy ? "o" : "w"}`}><div className="m">{d.triangles.toLocaleString("pt-BR")} triângulos · {d.shells} parte(s) · {d.openEdges} arestas abertas · {d.nonManifoldEdges} não-manifold · {d.duplicateTriangles} duplicados · {d.degenerateTriangles} degenerados</div>{d.warnings.map((w, i) => <div key={i} className="tip">⚠ {w}</div>)}{d.healthy && <div className="tip">Malha íntegra.</div>}</div>); })()}
          </div>
        ))}
      </Section>
      <Section title="Orientação ao projeto">
        <div className="btns"><button className="btn g" data-testid="btn-autocenter" disabled={!store.work && !store.antagonist} onClick={autoCenter}>Centralizar automaticamente</button></div>
        <div className="hint">Marque no escaneamento: 1) molar direito, 2) molar esquerdo, 3) borda do incisivo central. O escaneamento é levado ao referencial do projeto e o arco ({kindJaw() === "upper" ? "superior" : "inferior"}) assume a largura/profundidade medidas.</div>
        <div className="btns">{mode === "orient" ? <button className="btn d" onClick={stop}>Cancelar marcação</button> : <button className="btn p" data-testid="btn-orient" disabled={!store.work && !store.antagonist} onClick={() => startPick("orient")}>Marcar 3 pontos</button>}</div>
      </Section>
      <Section title="Alinhar coroa externa ao arco (ICP)">
        <div className="hint">Procura em várias posições onde a face interna da coroa encosta no escaneamento e refina por ICP. Pode levar alguns minutos em arcadas de ~300 mil triângulos.</div>
        <div className="btns">
          <button className="btn p" data-testid="btn-icp" disabled={!store.work || !store.crown} onClick={alignCrown}>Alinhar coroa (ICP)</button>
          <button className="btn" disabled={!crownBackup.current} onClick={() => { if (store.crown && crownBackup.current) { store.crown.geometry = crownBackup.current; crownBackup.current = null; show("crown"); setIcp(null); refresh(); } }}>Desfazer</button>
        </div>
        {icp && <div className={`card ${icp.confident ? "o" : "w"}`}><div className="t">{icp.confident ? "Alinhamento bom" : "Alinhamento aproximado — confira"}</div><div className="m">Erro médio {fmt(icp.rms, 2)} mm · {fmt(icp.coverage * 100, 0)} % dos pontos internos a menos de 0,25 mm</div>{!icp.confident && <div className="tip">A coroa de CAD tem folga de cimento e espaçador, então não encosta 100 %. Abaixo de ~80 % de contato, valide visualmente; se o arco não tiver o preparo desta coroa, o resultado não é confiável.</div>}</div>}
      </Section>
      <Section title="Linha de término">
        <div className="hint">Clique pontos ao longo do término no preparo ({margin.length} pontos). A curva é suavizada e fechada.</div>
        <div className="btns">
          {mode === "margin" ? <button className="btn g" onClick={stop}>Concluir</button> : <button className="btn p" disabled={!store.work} onClick={() => startPick("margin")}>Marcar término</button>}
          <button className="btn" onClick={() => { margin = margin.slice(0, -1); drawLines(); refresh(); }} disabled={!margin.length}>Desfazer ponto</button>
          <button className="btn d" onClick={() => { margin = []; drawLines(); refresh(); }} disabled={!margin.length}>Limpar</button>
        </div>
        {margin.length > 2 && <div className="card i"><div className="m">Perímetro do término: {fmt(marginCurve(margin).length)} mm</div></div>}
      </Section>
      <Section title="Eixo de inserção e áreas em sombra">
        <div className="btns"><button className="btn" onClick={analyseInsertion}>Calcular melhor eixo</button></div>
        {insertion && <div className={`card ${insertion.undercut < 0.15 ? "o" : "w"}`}><div className="m">Área em sombra: {fmt(insertion.vertical * 100, 0)}% (vertical) → {fmt(insertion.undercut * 100, 0)}% no melhor eixo.</div><div className="tip">Eixo sugerido: [{insertion.axis.map((v) => fmt(v, 2)).join("; ")}]</div></div>}
      </Section>
      <Section title={`Análises do dente ${c.sel ?? "…"} do projeto`}>
        {!t && <div className="hint">Selecione um dente no odontograma.</div>}
        <div className="btns">
          <button className="btn" disabled={!t} title="Mede a distância entre faces opostas da malha: útil para cascas/coroas ocas importadas" onClick={() => run("thick")}>Espessura da malha</button>
          <button className="btn" disabled={!t || !store.antagonist} onClick={() => run("contact")}>Contato c/ antagonista</button>
          <button className="btn" disabled={!t || !store.work} onClick={() => run("fit")}>Ajuste ao preparo</button>
        </div>
        {thick && <div className={`card ${thick.manufacturingSafe ? "o" : "e"}`}><div className="t">Espessura</div><div className="m">mín. {fmt(thick.minimumThickness, 2)} · média {fmt(thick.averageThickness, 2)} · máx. {fmt(thick.maximumThickness, 2)} mm</div><div className="tip">{thick.criticalPoints} pontos críticos · {thick.warningPoints} em atenção · {thick.safePoints} seguros — {thick.manufacturingSafe ? "seguro para fabricação" : "revisar antes de fabricar"}</div></div>}
        {contact && <div className="card i"><div className="t">Contato com antagonista</div><div className="m">distância mín. {fmt(contact.minimumDistance, 2)} mm · colisão {contact.collisionPoints} · forte {contact.strongContactPoints} · ideal {contact.idealContactPoints} · leve {contact.lightContactPoints} · folga {contact.clearancePoints}</div></div>}
        {fit && <div className={`card ${fit.fitted ? "o" : "w"}`}><div className="t">Ajuste ao preparo</div><div className="m">Deslocamento sugerido [{fit.movement.x.toFixed(2)}; {fit.movement.y.toFixed(2)}; {fit.movement.z.toFixed(2)}] mm</div>
          <div className="btns"><button className="btn g" onClick={() => c.s.adjust(c.sel!, { dx: (p.adjust[c.sel!]?.dx ?? 0) + fit.movement.x, dy: (p.adjust[c.sel!]?.dy ?? 0) + fit.movement.y, dz: (p.adjust[c.sel!]?.dz ?? 0) + fit.movement.z }, "fit")}>Aplicar ao dente</button></div></div>}
      </Section>
      <Check label="Mostrar dentes do projeto sobre o escaneamento" checked={!c.hideTeeth} onChange={(v) => c.setHideTeeth(!v)} />
    </div>
  );
}
