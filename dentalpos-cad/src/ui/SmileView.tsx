import { useEffect, useMemo, useRef, useState } from "react";
import type { CadProject, Evaluated, PhotoLandmarks } from "../core/project";
import { defaultMouthPolygon, frontShapes, smileMap } from "../core/smile";
import { shadeRgb } from "../core/materials";

type P2 = [number, number];
export type LmKey = keyof Omit<PhotoLandmarks, "mouth">;
export const LM_STEPS: Array<{ key: LmKey | "mouth"; label: string; hint: string }> = [
  { key: "pupilR", label: "Pupila direita do paciente", hint: "Lado esquerdo da imagem" },
  { key: "pupilL", label: "Pupila esquerda do paciente", hint: "Lado direito da imagem" },
  { key: "facialMidTop", label: "Linha média facial — alto (glabela)", hint: "Entre as sobrancelhas" },
  { key: "facialMidBottom", label: "Linha média facial — baixo (filtro/mento)", hint: "Centro do queixo" },
  { key: "upperLipMid", label: "Borda inferior do lábio superior (centro)", hint: "Onde os dentes começam a aparecer" },
  { key: "lowerLipMid", label: "Borda superior do lábio inferior (centro)", hint: "" },
  { key: "commissureR", label: "Comissura direita (do paciente)", hint: "Canto da boca" },
  { key: "commissureL", label: "Comissura esquerda (do paciente)", hint: "Canto da boca" },
  { key: "forehead", label: "Topo da testa (linha do cabelo)", hint: "Para análise do formato do rosto" },
  { key: "chin", label: "Ponta do queixo (mento)", hint: "" },
  { key: "zygR", label: "Zigoma direito (mais largo)", hint: "" },
  { key: "zygL", label: "Zigoma esquerdo", hint: "" },
  { key: "gonR", label: "Ângulo da mandíbula direito", hint: "" },
  { key: "gonL", label: "Ângulo da mandíbula esquerdo", hint: "" },
  { key: "mouth", label: "Contorno interno da boca (polígono)", hint: "Clique vários pontos; duplo clique/Enter conclui" },
];

export interface SmileRenderOpts { img: HTMLImageElement | null; w: number; h: number; showDesign: boolean; split: number | null; showGrid: boolean; showLandmarks: boolean; activeKey: string | null; mouthDraft: P2[] }

export function drawSmile(ctx: CanvasRenderingContext2D, p: CadProject, ev: Evaluated, o: SmileRenderOpts) {
  const { w, h, img } = o;
  ctx.clearRect(0, 0, w, h);
  if (img) ctx.drawImage(img, 0, 0, w, h); else { ctx.fillStyle = "#1b2635"; ctx.fillRect(0, 0, w, h); }
  const lm = p.photo?.landmarks;
  const map = smileMap(p, ev);
  if (lm && map && o.showDesign) {
    const mouth = lm.mouth && lm.mouth.length > 2 ? lm.mouth : defaultMouthPolygon(lm);
    ctx.save();
    if (o.split !== null) { ctx.beginPath(); ctx.rect(o.split * w, 0, w - o.split * w, h); ctx.clip(); }
    if (mouth) { ctx.beginPath(); mouth.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.clip(); ctx.fillStyle = "rgba(34,16,18,0.96)"; ctx.fillRect(0, 0, w, h); }
    ctx.globalAlpha = p.smile.opacity;
    const [r, g, b] = shadeRgb(p.shade);
    const shapes = frontShapes(ev).sort((a, c) => (a.jaw === c.jaw ? Math.abs(c.fdi % 10) - Math.abs(a.fdi % 10) : a.jaw === "lower" ? -1 : 1));
    const cx = map.originPx[0];
    for (const s of shapes) {
      const pts = s.outline.map(([x, z]) => map.toPx(x, z));
      if (pts.length < 3) continue;
      const ys = pts.map((q) => q[1]), top = Math.min(...ys), bot = Math.max(...ys);
      const grad = ctx.createLinearGradient(0, s.jaw === "upper" ? top : bot, 0, s.jaw === "upper" ? bot : top);
      const inc = `rgb(${Math.min(255, r + 14)},${Math.min(255, g + 18)},${Math.min(255, b + 26)})`;
      grad.addColorStop(0, `rgb(${r - 14},${g - 20},${b - 28})`); grad.addColorStop(0.55, `rgb(${r},${g},${b})`); grad.addColorStop(1, inc);
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      const xm = pts.reduce((sm, q) => sm + q[0], 0) / pts.length;
      const dark = Math.min(0.5, Math.abs(xm - cx) / (map.pxPerMm * 38));
      ctx.fillStyle = `rgba(30,16,12,${dark * 0.6})`; ctx.fill();
      ctx.lineWidth = Math.max(0.6, map.pxPerMm * 0.07); ctx.strokeStyle = "rgba(95,70,45,0.65)"; ctx.stroke();
      // brilho
      const mx = pts.reduce((sm, q) => sm + q[0], 0) / pts.length, my = top + (bot - top) * 0.38;
      const rg = ctx.createRadialGradient(mx - (bot - top) * 0.1, my, 0, mx, my, (bot - top) * 0.45);
      rg.addColorStop(0, "rgba(255,255,255,0.35)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg; ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (o.split !== null) { ctx.strokeStyle = "#4da3ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.split * w, 0); ctx.lineTo(o.split * w, h); ctx.stroke(); }
  // grade / marcos
  if (lm && map && o.showGrid) {
    ctx.save(); ctx.lineWidth = 1.2;
    // linha interpupilar
    if (lm.pupilR && lm.pupilL) { ctx.strokeStyle = "rgba(77,163,255,.85)"; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(...lm.pupilR); ctx.lineTo(...lm.pupilL); ctx.stroke(); }
    ctx.setLineDash([]);
    if (lm.facialMidTop && lm.facialMidBottom) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(...lm.facialMidTop); ctx.lineTo(...lm.facialMidBottom); ctx.stroke(); }
    // plano incisal e proporções áureas
    const c = ev.teeth.get(11) ?? ev.teeth.get(21);
    if (c) {
      const edge = c.lm.incisalMid[2];
      const a = map.toPx(-30, edge), b = map.toPx(30, edge);
      ctx.strokeStyle = "rgba(255,210,90,.9)"; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      ctx.strokeStyle = "rgba(255,210,90,.55)";
      for (const t of ev.teeth.values()) {
        if (t.ref.jaw !== "upper" || t.ref.index > 3) continue;
        for (const x of [t.lm.mesialContact[0], t.lm.distalContact[0]]) { const u = map.toPx(x, edge + 14), v = map.toPx(x, edge - 3); ctx.beginPath(); ctx.moveTo(...u); ctx.lineTo(...v); ctx.stroke(); }
      }
    }
    ctx.restore();
  }
  if (lm && o.showLandmarks) {
    const pts: Array<[string, P2 | undefined]> = (Object.entries(lm) as Array<[string, P2 | P2[] | undefined]>).filter(([k]) => k !== "mouth").map(([k, v]) => [k, v as P2 | undefined]);
    for (const [k, v] of pts) { if (!v) continue; ctx.fillStyle = k === o.activeKey ? "#ffb454" : "#4da3ff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(v[0], v[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (lm.mouth) { ctx.strokeStyle = "#7bd88f"; ctx.lineWidth = 1.5; ctx.beginPath(); lm.mouth.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.stroke(); }
  }
  if (o.mouthDraft.length) { ctx.strokeStyle = "#7bd88f"; ctx.fillStyle = "#7bd88f"; ctx.beginPath(); o.mouthDraft.forEach((q, i) => { (i ? ctx.lineTo(...q) : ctx.moveTo(...q)); }); ctx.stroke(); for (const q of o.mouthDraft) { ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, Math.PI * 2); ctx.fill(); } }
}

export function SmileView(props: {
  project: CadProject; ev: Evaluated; photoUrl: string | null; showDesign: boolean; split: number | null; showGrid: boolean;
  zoom?: number; activeKey: LmKey | "mouth" | null; onLandmark: (key: LmKey | "mouth", pt: P2, finish?: boolean) => void; onMouthFinish: (poly: P2[]) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [draft, setDraft] = useState<P2[]>([]);
  const dims = props.project.photo ? { w: props.project.photo.width, h: props.project.photo.height } : { w: 900, h: 1100 };
  useEffect(() => { if (!props.photoUrl) { setImg(null); return; } const i = new Image(); i.onload = () => setImg(i); i.src = props.photoUrl; }, [props.photoUrl]);
  useEffect(() => { if (props.activeKey !== "mouth") setDraft([]); }, [props.activeKey]);
  const opts = useMemo(() => ({ img, w: dims.w, h: dims.h, showDesign: props.showDesign, split: props.split, showGrid: props.showGrid, showLandmarks: true, activeKey: props.activeKey, mouthDraft: draft }), [img, dims.w, dims.h, props.showDesign, props.split, props.showGrid, props.activeKey, draft]);
  useEffect(() => { const c = ref.current; if (!c) return; c.width = dims.w; c.height = dims.h; drawSmile(c.getContext("2d")!, props.project, props.ev, opts); }, [props.project, props.ev, opts, dims.w, dims.h]);
  const lmk = props.project.photo?.landmarks;
  const mc = lmk?.upperLipMid && lmk.lowerLipMid ? [(lmk.upperLipMid[0] + lmk.lowerLipMid[0]) / 2, (lmk.upperLipMid[1] + lmk.lowerLipMid[1]) / 2] : [dims.w / 2, dims.h * 0.72];
  const mouthOrigin = `${(mc[0] / dims.w) * 100}% ${(mc[1] / dims.h) * 100}%`;
  const pt = (e: React.MouseEvent): P2 => { const r = ref.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * dims.w, ((e.clientY - r.top) / r.height) * dims.h]; };
  return (
    <canvas ref={ref} className="smile-canvas" data-testid="smile-canvas"
      onClick={(e) => {
        if (!props.activeKey) return;
        const p = pt(e);
        if (props.activeKey === "mouth") setDraft((d) => [...d, p]); else props.onLandmark(props.activeKey, p);
      }}
      onDoubleClick={() => { if (props.activeKey === "mouth" && draft.length > 2) { props.onMouthFinish(draft); setDraft([]); } }}
      style={{ cursor: props.activeKey ? "crosshair" : "default", transform: props.zoom && props.zoom > 1 ? `scale(${props.zoom})` : undefined, transformOrigin: mouthOrigin }} />
  );
}
