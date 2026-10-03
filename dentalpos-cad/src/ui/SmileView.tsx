import { useEffect, useMemo, useRef, useState } from "react";
import type { CadProject, Evaluated, PhotoLandmarks } from "../core/project";
import { defaultMouthPolygon, frontShapes, smileMap, type SmileMap } from "../core/smile";
import { shadeRgb } from "../core/materials";
import { renderTeethSprite } from "./smileSprite";
import type { SmileTool } from "./ctx";

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

export interface SmileRenderOpts { img: HTMLImageElement | null; w: number; h: number; showDesign: boolean; split: number | null; showGrid: boolean; showLandmarks: boolean; activeKey: string | null; mouthDraft: P2[]; selected?: number | null }

/** gengiva (rosa) entre o lábio e o zênite dos dentes superiores, com papilas — evita "buracos" pretos nas ameias */
function drawGums(ctx: CanvasRenderingContext2D, ev: Evaluated, map: SmileMap, w: number) {
  const ts = [...ev.teeth.values()].filter((t) => t.ref.jaw === "upper" && t.ref.index <= 6).sort((a, b) => a.lm.cervicalCenter[0] - b.lm.cervicalCenter[0]);
  if (ts.length < 2) return;
  const pts: P2[] = [];
  const top = map.toPx(0, map.zRef + 40)[1];
  ts.forEach((t, i) => {
    if (i > 0) {
      const q = ts[i - 1];
      const xc = (q.lm.distalContact[0] + t.lm.mesialContact[0]) / 2 + 0; // ponto de contato (ameia)
      const xm = ((q.lm.cervicalCenter[0] + t.lm.cervicalCenter[0]) / 2 + xc) / 2;
      const z = Math.min(q.lm.cervicalCenter[2], t.lm.cervicalCenter[2]) - (t.ref.index <= 3 && q.ref.index <= 3 ? 2.6 : 1.8);
      pts.push(map.toPx(xm, z));
    }
    pts.push(map.toPx(t.lm.cervicalCenter[0], t.lm.cervicalCenter[2] + 0.2));
  });
  const first = pts[0], last = pts[pts.length - 1];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first[0] - 60, top); ctx.lineTo(first[0] - 60, first[1]); ctx.lineTo(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) { const m: P2 = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2]; ctx.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], m[0], m[1]); }
  ctx.lineTo(last[0], last[1]); ctx.lineTo(last[0] + 60, last[1]); ctx.lineTo(last[0] + 60, top); ctx.closePath();
  const ys = pts.map((q) => q[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  const g = ctx.createLinearGradient(0, lo - map.pxPerMm * 6, 0, hi);
  g.addColorStop(0, "rgb(168,84,92)"); g.addColorStop(0.7, "rgb(206,112,120)"); g.addColorStop(1, "rgb(224,134,138)");
  ctx.fillStyle = g; ctx.fill();
  void w;
  ctx.restore();
}

function drawFlatTeeth(ctx: CanvasRenderingContext2D, p: CadProject, ev: Evaluated, map: SmileMap) {
  const [r, g, b] = shadeRgb(p.shade);
  const shapes = frontShapes(ev).sort((a, c) => (a.jaw === c.jaw ? Math.abs(c.fdi % 10) - Math.abs(a.fdi % 10) : a.jaw === "lower" ? -1 : 1));
  for (const s of shapes) {
    const pts = s.outline.map(([x, z]) => map.toPx(x, z));
    if (pts.length < 3) continue;
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill(); ctx.strokeStyle = "rgba(95,70,45,0.65)"; ctx.stroke();
  }
}

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
    drawGums(ctx, ev, map, w);
    ctx.globalAlpha = p.smile.opacity;
    const sprite = renderTeethSprite(ev, map, p.shade, w, h);
    if (sprite) {
      // escurece em direção aos corredores bucais (profundidade) sem apagar a transparência
      const sx = sprite.getContext("2d")!;
      const mid = map.originPx[0], half = map.pxPerMm * 27;
      const gr = sx.createLinearGradient(mid - half, 0, mid + half, 0);
      gr.addColorStop(0, "rgba(40,18,16,0.55)"); gr.addColorStop(0.22, "rgba(40,18,16,0.12)"); gr.addColorStop(0.5, "rgba(40,18,16,0)"); gr.addColorStop(0.78, "rgba(40,18,16,0.12)"); gr.addColorStop(1, "rgba(40,18,16,0.55)");
      sx.globalCompositeOperation = "source-atop"; sx.fillStyle = gr; sx.fillRect(0, 0, w, h);
      ctx.drawImage(sprite, 0, 0);
    } else drawFlatTeeth(ctx, p, ev, map);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (lm && map && o.showDesign && o.selected) {
    const sh = frontShapes(ev, [o.selected])[0];
    if (sh) { ctx.save(); ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 2.2; ctx.setLineDash([]); ctx.beginPath(); sh.outline.map(([x, z]) => map.toPx(x, z)).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.stroke(); ctx.restore(); }
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
  tool?: SmileTool; sym?: boolean; selected?: number | null; onSelectTooth?: (f: number | null) => void;
  onEditTooth?: (fdi: number, d: { dx?: number; dz?: number; sh?: number; smd?: number; tip?: number; rot?: number }, key: string) => void;
  onMoveSmile?: (dxMm: number, dzMm: number, dCant: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [draft, setDraft] = useState<P2[]>([]);
  const drag = useRef<{ fdi: number | null; last: P2; moved: boolean; sx: number; sy: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dims = props.project.photo ? { w: props.project.photo.width, h: props.project.photo.height } : { w: 900, h: 1100 };
  useEffect(() => { if (!props.photoUrl) { setImg(null); return; } const i = new Image(); i.onload = () => setImg(i); i.src = props.photoUrl; }, [props.photoUrl]);
  useEffect(() => { if (props.activeKey !== "mouth") setDraft([]); }, [props.activeKey]);
  const opts = useMemo(() => ({ img, w: dims.w, h: dims.h, showDesign: props.showDesign, split: props.split, showGrid: props.showGrid, showLandmarks: true, activeKey: props.activeKey, mouthDraft: draft, selected: props.selected ?? null }), [img, dims.w, dims.h, props.showDesign, props.split, props.showGrid, props.activeKey, draft, props.selected]);
  useEffect(() => { const c = ref.current; if (!c) return; c.width = dims.w; c.height = dims.h; drawSmile(c.getContext("2d")!, props.project, props.ev, opts); }, [props.project, props.ev, opts, dims.w, dims.h]);
  const lmk = props.project.photo?.landmarks;
  const mc = lmk?.upperLipMid && lmk.lowerLipMid ? [(lmk.upperLipMid[0] + lmk.lowerLipMid[0]) / 2, (lmk.upperLipMid[1] + lmk.lowerLipMid[1]) / 2] : [dims.w / 2, dims.h * 0.72];
  const mouthOrigin = `${(mc[0] / dims.w) * 100}% ${(mc[1] / dims.h) * 100}%`;
  const pt = (e: { clientX: number; clientY: number }): P2 => { const r = ref.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * dims.w, ((e.clientY - r.top) / r.height) * dims.h]; };
  const hitTest = (q: P2): number | null => {
    const map = smileMap(props.project, props.ev); if (!map) return null;
    const shapes = frontShapes(props.ev).sort((a, b) => (a.jaw === b.jaw ? (a.fdi % 10) - (b.fdi % 10) : a.jaw === "upper" ? -1 : 1));
    for (const sh of shapes) {
      const poly = sh.outline.map(([x, z]) => map.toPx(x, z));
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return sh.fdi;
    }
    return null;
  };
  const toMm = (map: NonNullable<ReturnType<typeof smileMap>>, du: number, dv: number) => {
    const rot = (map.rollDeg * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
    return { x: (du * cs + dv * sn) / map.pxPerMm, z: (du * sn - dv * cs) / map.pxPerMm };
  };
  const tool = props.tool ?? "move";
  const editing = !props.activeKey && props.showDesign && !!props.project.photo;
  const doDrag = (q: P2, e: { shiftKey: boolean }) => {
    const d = drag.current; if (!d) return;
    const map = smileMap(props.project, props.ev); if (!map) return;
    const mm = toMm(map, (q[0] - d.last[0]) * d.sx, (q[1] - d.last[1]) * d.sy);
    d.last = q; d.moved = true;
    if (d.fdi === null || tool === "smile") {
      if (e.shiftKey) props.onMoveSmile?.(0, 0, mm.x * 0.2);
      else props.onMoveSmile?.(mm.x, mm.z, 0);
      return;
    }
    const t = props.ev.teeth.get(d.fdi); if (!t) return;
    const key = `ed${d.fdi}${tool}`;
    if (tool === "move") props.onEditTooth?.(d.fdi, { dx: mm.x, dz: mm.z }, key);
    else if (tool === "size") props.onEditTooth?.(d.fdi, { sh: (t.ref.jaw === "upper" ? mm.z : -mm.z) / t.dims.h, smd: mm.x / t.dims.md }, key);
    else if (tool === "tilt") props.onEditTooth?.(d.fdi, { tip: mm.x * 4 * (t.ref.side === "L" ? -1 : 1) }, key);
    else if (tool === "rotate") props.onEditTooth?.(d.fdi, { rot: mm.x * 6 }, key);
  };
  return (
    <canvas ref={ref} className="smile-canvas" data-testid="smile-canvas"
      onClick={(e) => {
        if (!props.activeKey) return;
        const p = pt(e);
        if (props.activeKey === "mouth") setDraft((d) => [...d, p]); else props.onLandmark(props.activeKey, p);
      }}
      onDoubleClick={() => { if (props.activeKey === "mouth" && draft.length > 2) { props.onMouthFinish(draft); setDraft([]); } }}
      onPointerDown={(e) => {
        if (!editing) return;
        const q = pt(e), f = hitTest(q);
        props.onSelectTooth?.(f);
        const rc = ref.current!.getBoundingClientRect();
        drag.current = { fdi: f, last: [e.clientX, e.clientY], moved: false, sx: dims.w / rc.width, sy: dims.h / rc.height };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => { if (drag.current) doDrag([e.clientX, e.clientY], e); else { const q = pt(e); if (editing) { const f = hitTest(q); if (f !== hover) setHover(f); } } }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={(e) => {
        if (!editing) return;
        const f = hitTest(pt(e)); if (f === null) return;
        const t = props.ev.teeth.get(f); if (!t) return;
        const k = -Math.sign(e.deltaY) * 0.01;
        props.onEditTooth?.(f, e.shiftKey ? { smd: k } : { sh: k }, `wh${f}`);
      }}
      style={{ cursor: props.activeKey ? "crosshair" : editing ? (hover !== null ? (tool === "move" ? "grab" : "ns-resize") : "move") : "default", touchAction: "none", transform: props.zoom && props.zoom > 1 ? `scale(${props.zoom})` : undefined, transformOrigin: mouthOrigin }} />
  );
}
