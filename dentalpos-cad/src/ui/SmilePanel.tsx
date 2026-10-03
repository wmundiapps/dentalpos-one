import { Check, Slider, fmt } from "./atoms";
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
  const load = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { c.setPhotoUrl(url); c.s.set((q) => ({ ...q, photo: { name: file.name, width: img.naturalWidth, height: img.naturalHeight, landmarks: {} } })); setTimeout(() => detect(url), 50); };
    img.src = url;
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
        <Slider label="Exibição incisal em repouso" value={p.smile.incisalDisplayMm} min={-2} max={6} step={0.1} unit=" mm" onChange={(v) => c.s.set((q) => ({ ...q, smile: { ...q.smile, incisalDisplayMm: v } }), "disp")} testid="sl-display" />
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
