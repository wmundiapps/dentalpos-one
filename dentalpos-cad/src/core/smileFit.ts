// IA do sorriso: usa os pontos da foto (marcados à mão ou detectados) para dimensionar e posicionar o projeto.
import type { CadProject, Evaluated } from "./project";
import { evaluate } from "./project";
import { smileMap, analyzeFace, type SmileMap } from "./smile";
import { clamp, round } from "./math";
import type { Issue } from "./rules";

export interface SmileFitOptions {
  /** exposição gengival desejada no sorriso (mm acima da margem do lábio superior) */
  gumShowMm: number;
  /** distância da borda incisal ao lábio inferior (+ = afastada); 0 = toca levemente */
  lipTouchMm: number;
  /** corredor bucal-alvo (% da largura entre comissuras) */
  corridorPct: number;
  /** distância intercaninos (ponta a ponta) = ratio × distância interpupilar */
  intercanineIpdRatio: number;
  applyFaceForm: boolean;
}
export const DEFAULT_FIT: SmileFitOptions = { gumShowMm: 0.5, lipTouchMm: 0, corridorPct: 8, intercanineIpdRatio: 0.54, applyFaceForm: true };

/** coordenadas do plano dos dentes (x mm, z mm relativo à borda do central) de um ponto da foto */
export function photoToTooth(map: SmileMap, q: [number, number]): { x: number; z: number } {
  const rot = (map.rollDeg * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
  const du = q[0] - map.originPx[0], dv = q[1] - map.originPx[1];
  return { x: (du * cs + dv * sn) / map.pxPerMm, z: (du * sn - dv * cs) / map.pxPerMm };
}

export interface SmileMetrics { lipOpeningMm: number; gumShowMm: number | null; lipGapMm: number | null; commissureSpanMm: number | null; corridorPct: number | null; intercanineMm: number | null; intercanineTarget: number | null }
export function smileMetrics(p: CadProject, ev: Evaluated, o: Partial<SmileFitOptions> = {}): SmileMetrics | null {
  const lm = p.photo?.landmarks, map = smileMap(p, ev);
  if (!lm || !map || !lm.upperLipMid || !lm.lowerLipMid) return null;
  const ft = { ...DEFAULT_FIT, ...o };
  const up = photoToTooth(map, lm.upperLipMid), lo = photoToTooth(map, lm.lowerLipMid);
  const c = [11, 21].map((f) => ev.teeth.get(f)).filter((t): t is NonNullable<typeof t> => !!t);
  let gum: number | null = null, gap: number | null = null;
  if (c.length) {
    const zen = c.reduce((s, t) => s + t.lm.cervicalCenter[2], 0) / c.length - map.zRef;
    gum = zen - up.z; // zênite acima da margem do lábio = gengiva exposta
    gap = 0 - lo.z; // borda incisal (z=0) − lábio inferior: positivo = borda acima do lábio (afastada)
  }
  let span: number | null = null, corr: number | null = null, ic: number | null = null;
  if (lm.commissureR && lm.commissureL) {
    const a = photoToTooth(map, lm.commissureR), b = photoToTooth(map, lm.commissureL);
    span = Math.abs(b.x - a.x);
    const cr = ev.teeth.get(15), cl = ev.teeth.get(25);
    if (cr && cl) corr = clamp((span - (Math.abs(cl.lm.facialEdge[0] - cr.lm.facialEdge[0]) + 6)) / span, 0, 1) * 100;
  }
  const k1 = ev.teeth.get(13), k2 = ev.teeth.get(23);
  if (k1 && k2) ic = Math.abs(k2.lm.incisalMid[0] - k1.lm.incisalMid[0]);
  const ipd = p.patient.ipdMm ?? 63;
  return { lipOpeningMm: Math.abs(up.z - lo.z), gumShowMm: gum, lipGapMm: gap, commissureSpanMm: span, corridorPct: corr, intercanineMm: ic, intercanineTarget: ft.intercanineIpdRatio * ipd };
}

export interface SmileFitResult { project: CadProject; notes: string[]; metrics: SmileMetrics | null; ok: boolean }

/** Ajusta posição, alturas (X), largura do arco e forma ao sorriso da foto. */
export function fitSmileToPhoto(p0: CadProject, opt: Partial<SmileFitOptions> = {}): SmileFitResult {
  const o = { ...DEFAULT_FIT, ...opt };
  const notes: string[] = [];
  const lm = p0.photo?.landmarks;
  if (!lm?.pupilR || !lm.pupilL || !lm.upperLipMid || !lm.lowerLipMid) return { project: p0, notes: ["Faltam pupilas e/ou lábios na foto: use a detecção por IA ou marque os pontos."], metrics: null, ok: false };
  let p: CadProject = { ...p0, smile: { ...p0.smile, scale: 1, cantDeg: 0, offsetXmm: 0, offsetZmm: 0 }, heights: { ...(p0.heights ?? { enabled: true, xUpper: 9.5, xLower: 9 }), enabled: true } };
  // forma do rosto → forma dos dentes
  const face = o.applyFaceForm ? analyzeFace(lm) : null;
  if (face) { p = { ...p, form: face.recommendedForm, patient: { ...p.patient, face: face.shape } }; notes.push(`Rosto ${face.shape} → forma dos dentes "${face.recommendedForm}".`); }
  // calibra pela distância interpupilar; plano incisal paralelo à linha interpupilar (a foto é projetada já girada)
  notes.push(`Escala calibrada pela distância interpupilar (${p.patient.ipdMm ?? 63} mm); plano incisal paralelo à linha interpupilar; linha média dentária = facial.`);
  let ev = evaluate(p);
  let map = smileMap(p, ev)!;
  const up = photoToTooth(map, lm.upperLipMid), lo = photoToTooth(map, lm.lowerLipMid);
  const D = Math.abs(up.z - lo.z); // abertura labial central (mm)
  // posição vertical: borda incisal toca levemente o lábio inferior
  p = { ...p, smile: { ...p.smile, incisalDisplayMm: round(D + o.lipTouchMm, 2) } };
  notes.push(`Abertura labial central ${round(D, 1)} mm; bordas incisais posicionadas ${o.lipTouchMm === 0 ? "tocando levemente" : `a ${o.lipTouchMm} mm de`} o lábio inferior.`);
  // altura (X) para exibir a gengiva-alvo: zênite do central a gumShow acima do lábio superior
  let clamped = false;
  for (let i = 0; i < 4; i++) {
    ev = evaluate(p); map = smileMap(p, ev)!;
    const m = smileMetrics(p, ev, o); if (!m || m.gumShowMm === null) break;
    const dx = o.gumShowMm - m.gumShowMm;
    if (Math.abs(dx) < 0.05) break;
    const h = p.heights!; const nx = clamp(h.xUpper + dx, 8.2, 11.6); clamped = nx !== h.xUpper + dx;
    p = { ...p, heights: { ...h, xUpper: round(nx, 2), xLower: round(nx - 0.5, 2) } };
  }
  notes.push(`Esquema de alturas: X superior = ${p.heights!.xUpper} mm → central ${round(p.heights!.xUpper + 0.5, 1)} mm, lateral ${p.heights!.xUpper} mm, canino ${round(p.heights!.xUpper + 0.5, 1)} mm.${clamped ? " (limitado a 8,2–11,6 mm — verifique a dinâmica labial)" : ""}`);
  // corredor bucal
  for (let i = 0; i < 4; i++) {
    ev = evaluate(p);
    const m = smileMetrics(p, ev, o); if (!m || m.corridorPct === null || m.commissureSpanMm === null) break;
    const err = (m.corridorPct - o.corridorPct) / 100 * m.commissureSpanMm; // mm de largura a ganhar (+ = alargar)
    if (Math.abs(err) < 0.3) break;
    const ar = p.arches.upper;
    p = { ...p, arches: { ...p.arches, upper: { ...ar, width: round(clamp(ar.width + err * 0.9, 42, 56), 1) } } };
  }
  ev = evaluate(p);
  const fin = smileMetrics(p, ev, o);
  if (fin?.corridorPct != null) notes.push(`Corredor bucal ≈ ${round(fin.corridorPct, 0)} % (alvo ${o.corridorPct} %); arco superior ${p.arches.upper.width} mm.`);
  if (fin?.intercanineMm != null && fin.intercanineTarget) notes.push(`Distância intercaninos ${round(fin.intercanineMm, 1)} mm (referência pelas pupilas: ${round(fin.intercanineTarget, 1)} mm).`);
  return { project: p, notes, metrics: fin, ok: true };
}

/** Regras da linha do sorriso (usam a foto): gengiva, toque no lábio inferior, corredor bucal, intercaninos/pupilas, cant. */
export function analyzeSmileLine(p: CadProject, ev: Evaluated): Issue[] {
  const out: Issue[] = [];
  const m = smileMetrics(p, ev);
  if (!m) return out;
  let n = 0;
  const mk = (code: string, severity: Issue["severity"], teeth: number[], title: string, message: string, tip: string, extra: Partial<Issue> = {}): Issue =>
    ({ id: `${code}-sl-${n++}`, code, severity, category: "foto", teeth, title, message, tip, ...extra });
  const fit = (label: string, patch: Partial<SmileFitOptions> = {}) => ({ label, apply: (q: CadProject) => fitSmileToPhoto(q, patch).project });
  if (m.gumShowMm !== null) {
    const g = m.gumShowMm;
    if (g > 2) out.push(mk("PH_GUM", "warning", [11, 21], "Sorriso gengival", `Gengiva exposta ≈ ${round(g, 1)} mm (ideal 0–1 mm).`, "Reduza a altura das coroas anteriores/X ou reavalie lábio/gengiva (aumento coronário, toxina).", { value: g, fix: fit("Ajustar alturas ao sorriso") }));
    else if (g < -0.6) out.push(mk("PH_GUM", "warning", [11, 21], "Linha do sorriso baixa", `Zênite ${round(-g, 1)} mm abaixo da margem do lábio superior: coroas ficam curtas ou o lábio cobre a gengiva.`, "O ideal é aparecer levemente a gengiva (0–1 mm) no sorriso.", { value: g, fix: fit("Ajustar alturas ao sorriso") }));
    else out.push(mk("PH_GUM_OK", "ok", [11, 21], "Linha do sorriso", `Gengiva exposta ≈ ${round(g, 1)} mm (ideal 0–1 mm).`, ""));
  }
  if (m.lipGapMm !== null) {
    const gp = m.lipGapMm;
    if (gp > 1.2) out.push(mk("PH_LIPTOUCH", "warning", [11, 21, 13, 23], "Bordas incisais afastadas do lábio inferior", `Há ${round(gp, 1)} mm entre a borda dos incisivos/caninos e o lábio inferior.`, "No sorriso, incisivos e caninos devem tocar levemente o lábio inferior.", { value: gp, fix: fit("Posicionar bordas sobre o lábio inferior") }));
    else if (gp < -0.8) out.push(mk("PH_LIPTOUCH", "info", [11, 21], "Bordas incisais cobertas pelo lábio inferior", `Bordas ${round(-gp, 1)} mm abaixo da margem do lábio inferior.`, "Toque leve é o ideal; cobertura excessiva esconde o comprimento incisal.", { value: gp, fix: fit("Posicionar bordas sobre o lábio inferior") }));
    else out.push(mk("PH_LIPTOUCH_OK", "ok", [11, 21], "Contato com o lábio inferior", `Distância ${round(gp, 1)} mm (toque leve).`, ""));
  }
  if (m.intercanineMm !== null && m.intercanineTarget) {
    const r = m.intercanineMm / m.intercanineTarget;
    if (Math.abs(r - 1) > 0.12) out.push(mk("PH_CANINE_PUPIL", "info", [13, 23], "Posição dos caninos × pupilas", `Distância intercaninos ${round(m.intercanineMm, 1)} mm; a referência pela distância interpupilar sugere ≈ ${round(m.intercanineTarget, 1)} mm.`, "Os caninos superiores têm como referência a distância interpupilar (proporção ≈ 0,54).", { value: m.intercanineMm }));
  }
  return out;
}
