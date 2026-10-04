import { useState } from "react";
import { validateUpload, sanitizeImage } from "../security/upload";
import { checkExplicit } from "../security/nsfw";
import { Check, Slider, fmt } from "./atoms";
import { fitSmileToPhoto, smileMetrics, DEFAULT_FIT, type SmileFitOptions } from "../core/smileFit";
import { toothRef } from "../core/anatomy";
import type { SmileTool } from "./ctx";
import type { Ctx } from "./ctx";
import { LM_STEPS } from "./SmileView";
import { makeSampleFace } from "./sampleFace";
import { analyzeFace } from "../core/smile";
import { detectFace } from "../ai/faceAi";
import { FACE_LABEL, FORM_LABEL } from "../core/profiles";

export function SmilePanel({ c }: { c: Ctx }) {
  const { project: p } = c.s;
  const lm = p.photo?.landmarks ?? {};
  const face = analyzeFace(lm);
  const ui = c.smileUi;
  const [fit, setFit] = useState<SmileFitOptions>(DEFAULT_FIT);
  const [notes, setNotes] = useState<string[]>([]);
  const metrics = p.photo ? smileMetrics(p, c.s.ev, fit) : null;
  const runFit = () => {
    const r = fitSmileToPhoto(p, fit);
    setNotes(r.notes);
    if (r.ok) { c.s.set(() => r.project); c.toast("Sorriso ajustado à foto pela IA. Refine na foto arrastando os dentes."); } else c.toast(r.notes[0]);
  };
  const selF = c.sel && p.fdis.includes(c.sel) ? c.sel : null;
  const adj = selF ? p.adjust[selF] ?? {} : {};
  const setAdj = (patch: Record<string, number>, key: string) => selF && c.s.set((q) => {
    const a = { ...q.adjust, [selF]: { ...(q.adjust[selF] ?? {}), ...patch } };
    return { ...q, adjust: a };
  }, `${key}${selF}`);
  const TOOLS: Array<[SmileTool, string, string]> = [["move", "✥ Mover", "Arraste o dente: posição horizontal e altura"], ["size", "⇕ Tamanho", "Arraste: ↕ altura, ↔ largura (ou use a roda do mouse; Shift = largura)"], ["tilt", "∠ Inclinar", "Arraste ↔ para inclinar (angulação)"], ["rotate", "⟳ Girar", "Arraste ↔ para girar o dente"], ["smile", "◫ Sorriso", "Arraste para mover todo o sorriso; Shift+arrastar inclina o plano"]];
  const load = async (file: File) => {
    c.setBusy("Verificando a imagem (formato, conteúdo e segurança)…");
    try {
      const v = await validateUpload(file, "image");
      if (!v.ok) throw new Error(v.reason);
      const clean = await sanitizeImage(v.data, v.mime ?? "image/jpeg");
      const verdict = await checkExplicit(clean.canvas);
      if (verdict.blocked) throw new Error("Imagem bloqueada: conteúdo impróprio detectado. Envie apenas fotos clínicas do paciente.");
      const url = URL.createObjectURL(clean.blob);
      c.setPhotoUrl(url); c.s.set((q) => ({ ...q, photo: { name: file.name.replace(/[^\w.\- ]/g, "_"), width: clean.width, height: clean.height, landmarks: {} } }));
      c.setBusy(null);
      setTimeout(() => detect(url), 50);
    } catch (e) { c.setBusy(null); c.toast(e instanceof Error ? e.message : String(e)); }
  };
  const detect = async (url?: string | null) => {
    const src = url ?? c.photoUrl; if (!src) return c.toast("Carregue uma foto primeiro.");
    c.setBusy("IA: localizando rosto, pupilas, lábios e linha média (processamento local)…");
    try {
      const img = new Image(); img.src = src; await img.decode();
      const r = await detectFace(img);
      if (!r) { c.toast("Rosto não encontrado. Use foto frontal com o rosto inteiro, bem iluminada, ou marque os pontos manualmente."); }
      else {
        c.s.set((q) => ({ ...q, photo: q.photo ? { ...q.photo, landmarks: { ...q.photo.landmarks, ...r.landmarks } } : q.photo }));
        ui.setActiveKey(null);
        c.toast(`IA: ${Object.keys(r.landmarks).length} marcos definidos (confiança ${(r.score * 100).toFixed(0)} %). Confira e ajuste se necessário.`);
      }
    } catch (e) { c.toast(`Falha na IA: ${e instanceof Error ? e.message : e}`); }
    c.setBusy(null);
  };
  const done = (k: string) => (k === "mouth" ? !!lm.mouth?.length : !!(lm as Record<string, unknown>)[k]);
  return (
    <div data-testid="panel-smile">
      <h3>Simulador de sorriso</h3>
      <p className="hint">Carregue uma foto frontal do sorriso (use sempre fotos do paciente com consentimento — nada é enviado a servidores). A escala é calibrada pela distância interpupilar.</p>
      <div className="btns">
        <label className="btn p" style={{ cursor: "pointer" }}>Carregar foto…<input type="file" accept="image/*" hidden data-testid="file-photo" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        <button className="btn" data-testid="btn-sample" onClick={() => { const s = makeSampleFace(); c.setPhotoUrl(s.url); c.s.set((q) => ({ ...q, photo: { name: "exemplo-ilustrado", width: s.width, height: s.height, landmarks: s.landmarks } })); ui.setActiveKey(null); c.toast("Foto ilustrativa carregada com marcos prontos."); }}>Usar foto de exemplo</button>
      </div>
      {p.photo && (<>
        <label>Distância interpupilar (mm)</label>
        <input type="number" value={p.patient.ipdMm ?? 63} min={50} max={80} onChange={(e) => c.s.set((q) => ({ ...q, patient: { ...q.patient, ipdMm: parseFloat(e.target.value) || 63 } }))} />
        <div className="btns"><button className="btn p" data-testid="btn-detect" onClick={() => detect()}>✨ Detectar pontos com IA</button></div>
        <h4>IA: ajustar o sorriso à foto</h4>
        <p className="hint">Usa pupilas, lábios e comissuras para definir: altura das coroas (esquema X), bordas tocando levemente o lábio inferior, leve exposição gengival, corredor bucal, linha média e forma dos dentes pelo rosto.</p>
        <Slider label="Gengiva exposta no sorriso (alvo)" value={fit.gumShowMm} min={-1} max={2.5} step={0.1} unit=" mm" onChange={(v) => setFit({ ...fit, gumShowMm: v })} />
        <Slider label="Distância borda incisal ↔ lábio inferior" value={fit.lipTouchMm} min={-1} max={2} step={0.1} unit=" mm" onChange={(v) => setFit({ ...fit, lipTouchMm: v })} />
        <Slider label="Corredor bucal (alvo)" value={fit.corridorPct} min={0} max={20} step={1} unit=" %" onChange={(v) => setFit({ ...fit, corridorPct: v })} />
        <div className="btns"><button className="btn p" data-testid="btn-fit" onClick={runFit}>🪄 Ajustar sorriso à foto (IA)</button></div>
        {metrics && <div className="hint" data-testid="smile-metrics">Gengiva exposta {fmt(metrics.gumShowMm)} mm · bordas ↔ lábio inferior {fmt(metrics.lipGapMm)} mm · corredor bucal {fmt(metrics.corridorPct, 0)} % · intercaninos {fmt(metrics.intercanineMm)} mm (ref. pupilas {fmt(metrics.intercanineTarget)} mm)</div>}
        {notes.length > 0 && <div className="card o"><div className="t">O que a IA ajustou</div>{notes.map((n, i) => <div className="m" key={i}>• {n}</div>)}</div>}
        <h4>Editar dentes e sorriso na foto</h4>
        <div className="btns">{TOOLS.map(([k, l, t]) => <button key={k} className={`btn ${ui.tool === k ? "p" : ""}`} title={t} data-testid={`tool-${k}`} onClick={() => ui.setTool(k)}>{l}</button>)}</div>
        <div className="hint">{TOOLS.find((t) => t[0] === ui.tool)?.[2]}. Clique num dente para selecioná-lo.</div>
        <Check label="Editar simetricamente (espelha no dente do lado oposto)" checked={ui.sym} onChange={ui.setSym} />
        {selF ? (<div className="card o" data-testid="sel-tooth"><div className="t">Dente {selF} — {toothRef(selF).name}</div>
          <Slider label="Posição horizontal" value={adj.dx ?? 0} min={-4} max={4} step={0.05} unit=" mm" digits={2} onChange={(v) => setAdj({ dx: v }, "fx")} />
          <Slider label="Altura no plano (cranial +)" value={adj.dz ?? 0} min={-3} max={3} step={0.05} unit=" mm" digits={2} onChange={(v) => setAdj({ dz: v }, "fz")} />
          <Slider label="Altura da coroa" value={adj.scaleH ?? 1} min={0.7} max={1.3} step={0.01} unit="×" digits={2} onChange={(v) => setAdj({ scaleH: v }, "fh")} />
          <Slider label="Largura" value={adj.scaleMd ?? 1} min={0.7} max={1.3} step={0.01} unit="×" digits={2} onChange={(v) => setAdj({ scaleMd: v }, "fw")} />
          <Slider label="Inclinação (angulação)" value={adj.tip ?? 0} min={-15} max={15} step={0.5} unit="°" onChange={(v) => setAdj({ tip: v }, "ft")} />
          <Slider label="Rotação" value={adj.rotation ?? 0} min={-30} max={30} step={0.5} unit="°" onChange={(v) => setAdj({ rotation: v }, "fr")} />
          <div className="btns"><button className="btn" onClick={() => c.s.set((q) => ({ ...q, adjust: { ...q.adjust, [selF]: {} } }))}>Restaurar dente</button></div></div>) : <div className="hint">Nenhum dente selecionado.</div>}
        <h4>Marcos faciais (ajuste manual, se necessário)</h4>
        <div className="steps" data-testid="steps">
          {LM_STEPS.map((s) => (
            <div key={s.key} className={`step ${ui.activeKey === s.key ? "on" : ""} ${done(s.key) ? "done" : ""}`} title={s.hint} onClick={() => ui.setActiveKey(ui.activeKey === s.key ? null : s.key)}>
              <span>{done(s.key) ? "✓ " : "○ "}{s.label}</span>
            </div>
          ))}
        </div>
        {ui.activeKey && <div className="hint" style={{ marginTop: 6 }}>Marcando: <b>{LM_STEPS.find((s) => s.key === ui.activeKey)?.label}</b>. {LM_STEPS.find((s) => s.key === ui.activeKey)?.hint}</div>}
        <h4>Projeto sobre a foto</h4>
        <Check label="Mostrar dentes projetados" checked={ui.showDesign} onChange={ui.setShowDesign} />
        <Check label="Mostrar linhas-guia (linha interpupilar, média, plano incisal, proporções)" checked={ui.showGrid} onChange={ui.setShowGrid} />
        <Slider label="Zoom no sorriso" value={ui.zoom} min={1} max={4} step={0.1} digits={1} unit="×" onChange={ui.setZoom} />
        <Check label="Comparador antes/depois" checked={ui.split !== null} onChange={(v) => ui.setSplit(v ? 0.5 : null)} />
        {ui.split !== null && <Slider label="Divisão antes | depois" value={ui.split} min={0} max={1} step={0.01} digits={2} onChange={ui.setSplit} />}
        <Slider label="Opacidade dos dentes" value={p.smile.opacity} min={0.2} max={1} step={0.05} digits={2} onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, opacity: v } }), "op")} />
        <Slider label="Borda incisal abaixo do lábio superior" value={p.smile.incisalDisplayMm} min={-2} max={6} step={0.1} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, incisalDisplayMm: v } }), "disp")} testid="sl-display" />
        <Slider label="Deslocamento horizontal" value={p.smile.offsetXmm} min={-6} max={6} step={0.1} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, offsetXmm: v } }), "ox")} />
        <Slider label="Deslocamento vertical" value={p.smile.offsetZmm} min={-4} max={4} step={0.1} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, offsetZmm: v } }), "oz")} />
        <Slider label="Inclinação do plano incisal (cant)" value={p.smile.cantDeg} min={-6} max={6} step={0.1} unit="°" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, cantDeg: v } }), "cant")} />
        <Slider label="Escala" value={p.smile.scale} min={0.85} max={1.2} step={0.005} digits={3} unit="×" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, scale: v } }), "sc")} />
        <div className="btns"><button className="btn" onClick={() => { const cv = document.querySelector<HTMLCanvasElement>("[data-testid=smile-canvas]"); if (cv) { const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `${p.name}-sorriso.png`; a.click(); } }}>Salvar imagem (PNG)</button></div>
        <h4>Análise facial (IA)</h4>
        {face ? (<div className="card o"><div className="t">Face {FACE_LABEL[face.shape]} → dente {FORM_LABEL[face.recommendedForm]}</div><div className="m">Comprimento/largura {fmt(face.lengthWidth, 2)} · mandíbula/zigoma {fmt(face.jawRatio, 2)}</div><div className="tip">{face.why}</div>
          <div className="btns"><button className="btn p" onClick={() => c.s.set((q) => ({ ...q, form: face.recommendedForm, patient: { ...q.patient, face: face.shape } }))}>Aplicar ao projeto</button></div></div>) : <div className="hint">Marque testa, queixo, zigomas e mandíbula para classificar o formato do rosto.</div>}
      </>)}
    </div>
  );
}
