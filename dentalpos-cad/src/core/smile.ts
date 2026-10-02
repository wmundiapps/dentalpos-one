// Smile design: projeção frontal dos dentes, mapeamento para a foto, análise facial (forma da face) e regras fotográficas.
import { type Vec3, dist, toDeg, clamp, round } from "./math";
import { FACE_TO_FORM, type FaceShape, type ToothForm } from "./profiles";
import type { CadProject, Evaluated, PhotoLandmarks } from "./project";
import type { Issue } from "./rules";
import { toothRef } from "./anatomy";

type P2 = [number, number];

export function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export interface FrontShape { fdi: number; jaw: "upper" | "lower"; outline: P2[]; edgeZ: number; incisalPts: P2[] }
/** Silhueta frontal (x direita→esquerda do paciente, z para cima) de cada dente, em mm. Usa apenas vértices voltados ao vestíbulo. */
export function frontShapes(ev: Evaluated, only?: number[]): FrontShape[] {
  const out: FrontShape[] = [];
  for (const t of ev.teeth.values()) {
    if (only && !only.includes(t.fdi)) continue;
    if (t.ref.index > 6) continue; // até 1º molar (corredor bucal)
    const pts: P2[] = [];
    const pos = t.mesh.positions, nrm = t.mesh.normals!;
    for (let i = 0; i < pos.length; i += 3) if (nrm[i + 1] > -0.1) pts.push([pos[i], pos[i + 2]]);
    out.push({ fdi: t.fdi, jaw: t.ref.jaw, outline: convexHull(pts), edgeZ: t.lm.incisalMid[2], incisalPts: [] });
  }
  return out;
}

// ---------------- Mapeamento para a foto ----------------
export interface SmileMap {
  pxPerMm: number;
  rollDeg: number; // inclinação da linha interpupilar na imagem (graus)
  originPx: P2;    // posição do ponto (x=0, z=zRef)
  zRef: number;
  toPx: (x: number, z: number) => P2;
}
export function smileMap(p: CadProject, ev: Evaluated): SmileMap | null {
  const lm = p.photo?.landmarks;
  if (!lm?.pupilR || !lm.pupilL) return null;
  const ipdMm = p.patient.ipdMm ?? 63;
  const ipdPx = dist([...lm.pupilR, 0], [...lm.pupilL, 0]);
  const pxPerMm = (ipdPx / ipdMm) * p.smile.scale;
  const roll = Math.atan2(lm.pupilL[1] - lm.pupilR[1], lm.pupilL[0] - lm.pupilR[0]);
  const rot = roll + (p.smile.cantDeg * Math.PI) / 180;
  const mx = lm.facialMidTop && lm.facialMidBottom ? (lm.facialMidTop[0] + lm.facialMidBottom[0]) / 2 : (lm.pupilR[0] + lm.pupilL[0]) / 2;
  const my = lm.facialMidTop && lm.facialMidBottom ? (lm.facialMidTop[1] + lm.facialMidBottom[1]) / 2 : (lm.pupilR[1] + lm.pupilL[1]) / 2;
  const lip = lm.upperLipMid ?? lm.mouth?.[0] ?? [mx, my + ipdPx];
  const c = ev.teeth.get(11) ?? ev.teeth.get(21);
  const zRef = c ? c.lm.incisalMid[2] : 0;
  const ox = (lm.facialMidTop && lm.facialMidBottom ? mx : lip[0]) + p.smile.offsetXmm * pxPerMm;
  const oy = lip[1] + (p.smile.incisalDisplayMm - p.smile.offsetZmm) * pxPerMm;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const toPx = (x: number, z: number): P2 => {
    const dx = x * pxPerMm, dy = -(z - zRef) * pxPerMm;
    return [ox + dx * cs - dy * sn, oy + dx * sn + dy * cs];
  };
  return { pxPerMm, rollDeg: toDeg(rot), originPx: [ox, oy], zRef, toPx };
}

/** polígono padrão da boca a partir das comissuras e lábios, se o usuário não desenhou o contorno */
export function defaultMouthPolygon(lm: PhotoLandmarks): P2[] | null {
  if (!lm.commissureR || !lm.commissureL || !lm.upperLipMid || !lm.lowerLipMid) return null;
  const poly: P2[] = [lm.commissureR];
  const N = 12;
  const q = (a: P2, c: P2, b: P2, t: number): P2 => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const ctrlU: P2 = [(lm.commissureR[0] + lm.commissureL[0]) / 2, lm.upperLipMid[1] * 2 - (lm.commissureR[1] + lm.commissureL[1]) / 2];
  const ctrlL: P2 = [(lm.commissureR[0] + lm.commissureL[0]) / 2, lm.lowerLipMid[1] * 2 - (lm.commissureR[1] + lm.commissureL[1]) / 2];
  for (let i = 1; i < N; i++) poly.push(q(lm.commissureR, ctrlU, lm.commissureL, i / N));
  poly.push(lm.commissureL);
  for (let i = N - 1; i > 0; i--) poly.push(q(lm.commissureR, ctrlL, lm.commissureL, i / N));
  return poly;
}

// ---------------- Forma da face ----------------
export interface FaceAnalysis { shape: FaceShape; lengthWidth: number; jawRatio: number; foreheadRatio: number; recommendedForm: ToothForm; why: string }
export function analyzeFace(lm: PhotoLandmarks): FaceAnalysis | null {
  if (!lm.zygR || !lm.zygL || !lm.chin || !lm.forehead) return null;
  const zyg = Math.hypot(lm.zygL[0] - lm.zygR[0], lm.zygL[1] - lm.zygR[1]);
  const len = Math.hypot(lm.chin[0] - lm.forehead[0], lm.chin[1] - lm.forehead[1]);
  const jaw = lm.gonR && lm.gonL ? Math.hypot(lm.gonL[0] - lm.gonR[0], lm.gonL[1] - lm.gonR[1]) : zyg * 0.82;
  const lw = len / zyg, jr = jaw / zyg;
  let shape: FaceShape;
  if (lw >= 1.5) shape = jr > 0.9 ? "elongated" : "elongated";
  else if (jr < 0.7) shape = "inverted-triangle";
  else if (jr > 0.95 && lw < 1.32) shape = "square";
  else if (jr > 0.92 && lw >= 1.32) shape = "triangular";
  else if (lw < 1.22) shape = "round";
  else if (jr < 0.8 && lw > 1.3) shape = "diamond";
  else shape = "oval";
  const rec = FACE_TO_FORM[shape];
  return { shape, lengthWidth: round(lw, 2), jawRatio: round(jr, 2), foreheadRatio: 0, recommendedForm: rec.primary, why: rec.why };
}

// ---------------- Regras fotográficas ----------------
export function analyzePhoto(p: CadProject, ev: Evaluated): Issue[] {
  const out: Issue[] = [];
  const lm = p.photo?.landmarks;
  const map = smileMap(p, ev);
  if (!lm || !map) return out;
  let n = 0;
  const mk = (code: string, severity: Issue["severity"], teeth: number[], title: string, message: string, tip: string, extra: Partial<Issue> = {}): Issue =>
    ({ id: `${code}-ph-${n++}`, code, severity, category: "foto", teeth, title, message, tip, ...extra });
  const pxmm = map.pxPerMm;
  // plano incisal vs linha interpupilar
  if (Math.abs(p.smile.cantDeg) > 1.5) out.push(mk("PH_CANT", Math.abs(p.smile.cantDeg) > 3 ? "error" : "warning", [11, 21], "Plano incisal inclinado", `Plano incisal inclinado ${round(p.smile.cantDeg, 1)}° em relação à linha interpupilar.`, "O plano incisal deve ser paralelo à linha interpupilar (≤1,5°).", { value: p.smile.cantDeg, fix: { label: "Alinhar plano incisal à linha interpupilar", apply: (q) => ({ ...q, smile: { ...q.smile, cantDeg: 0 } }) } }));
  // exibição incisal
  const disp = p.smile.incisalDisplayMm;
  const [lo, hi] = p.patient.sex === "male" ? [0.5, 2.5] : [1.5, 4];
  if (disp < lo || disp > hi) out.push(mk("PH_DISPLAY", "warning", [11, 21], "Exibição incisal em repouso", `Exibição de ${round(disp, 1)} mm (típico ${lo}–${hi} mm para ${p.patient.sex === "male" ? "homens" : "mulheres"}).`, disp < lo ? "Considere aumentar o comprimento dos incisivos centrais." : "Exibição excessiva: avalie encurtar as bordas ou corrigir o lábio.", { value: disp, fix: { label: `Exibição ${(lo + hi) / 2} mm`, apply: (q) => ({ ...q, smile: { ...q.smile, incisalDisplayMm: (lo + hi) / 2 } }) } }));
  // linha média dentária vs facial
  const c11 = ev.teeth.get(11), c21 = ev.teeth.get(21);
  if (c11 && c21 && lm.facialMidTop && lm.facialMidBottom) {
    const dmm = (p.smile.offsetXmm + (c11.lm.mesialContact[0] + c21.lm.mesialContact[0]) / 2);
    if (Math.abs(dmm) > 1) out.push(mk("PH_MIDLINE", Math.abs(dmm) > 2 ? "error" : "warning", [11, 21], "Linha média dentária × facial", `Desvio de ${round(Math.abs(dmm), 1)} mm entre linha média dentária e facial.`, "Centralize pela linha média facial (filtro, glabela, ponta do nariz).", { value: dmm, fix: { label: "Centralizar na linha média facial", apply: (q) => ({ ...q, smile: { ...q.smile, offsetXmm: 0 } }) } }));
  }
  // arco do sorriso: borda dos superiores paralela ao lábio inferior
  if (lm.lowerLipMid && lm.commissureR && lm.commissureL) {
    const cR = ev.teeth.get(13), cL = ev.teeth.get(23), c = c11 ?? c21;
    if (cR && cL && c) {
      const edgeCan = (cR.lm.incisalMid[2] + cL.lm.incisalMid[2]) / 2, edgeCen = c.lm.incisalMid[2];
      const arc = edgeCan - edgeCen; // positivo: canino mais cervical que centrais (arco consonante)
      if (arc < -0.2) out.push(mk("PH_ARC", "warning", [13, 23, 11, 21], "Arco do sorriso reverso", `Caninos ${round(-arc, 1)} mm mais incisais que os centrais (arco invertido).`, "Arco consonante: bordas dos superiores acompanham a curvatura do lábio inferior."));
      else if (arc > 1.5) out.push(mk("PH_ARC", "info", [13, 23], "Arco do sorriso muito acentuado", `Caninos ${round(arc, 1)} mm mais cervicais que centrais.`, "Arco levemente curvo (0,5–1,0 mm) é considerado ideal."));
    }
    // corredor bucal
    const cr = ev.teeth.get(14), cl = ev.teeth.get(24);
    if (cr && cl) {
      const spanPx = Math.abs(lm.commissureL[0] - lm.commissureR[0]);
      const spanMm = spanPx / pxmm;
      const teethSpan = Math.abs(cl.lm.facialEdge[0] - cr.lm.facialEdge[0]) + 2 * 1.5;
      const corr = clamp((spanMm - teethSpan) / spanMm, 0, 1) * 100;
      if (corr > 18) out.push(mk("PH_CORRIDOR", "warning", [14, 24], "Corredor bucal amplo", `Corredor bucal ≈ ${round(corr, 0)}% (ideal 2–15%).`, "Alargue o arco superior ou amplie pré-molares (ou use sorrisos mais largos)."));
      else out.push(mk("PH_CORRIDOR_OK", "ok", [14, 24], "Corredor bucal", `≈ ${round(corr, 0)}% (ideal 2–15%).`, ""));
    }
  }
  return out;
}

export function recommendedFormForFace(shape: FaceShape) { return FACE_TO_FORM[shape]; }
export { toothRef };
export type { Vec3 };
