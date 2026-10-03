// Mapeia os 68 pontos faciais (padrão dlib) para os marcos usados no simulador de sorriso. Função pura — testável sem modelo.
import type { PhotoLandmarks } from "../core/project";

export type P2 = [number, number];
const mean = (pts: P2[]): P2 => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/** reta x = a + b·y (ajuste por mínimos quadrados) — linha média facial robusta à inclinação da cabeça */
function fitMidline(pts: P2[]): { a: number; b: number } {
  const n = pts.length; let sy = 0, sx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sy += y; sx += x; syy += y * y; sxy += x * y; }
  const den = n * syy - sy * sy;
  const b = Math.abs(den) < 1e-9 ? 0 : (n * sxy - sx * sy) / den;
  return { a: (sx - b * sy) / n, b };
}

export interface FaceMetrics { ipdPx: number; rollDeg: number; mouthWidthPx: number; mouthOpenPx: number }
/** pts: 68 pontos [x,y] em pixels da imagem (índices dlib). */
export function landmarksFrom68(pts: P2[]): { landmarks: PhotoLandmarks; metrics: FaceMetrics } {
  if (pts.length < 68) throw new Error("São necessários 68 pontos faciais.");
  const idx = (a: number, b: number) => pts.slice(a, b + 1);
  const pupilR = mean(idx(36, 41)), pupilL = mean(idx(42, 47)); // olho direito do paciente = esquerda da imagem
  const mid = fitMidline([pts[27], pts[28], pts[29], pts[30], pts[33], pts[51], pts[62], pts[66], pts[57], pts[8]]);
  const xAt = (y: number): number => mid.a + mid.b * y;
  const glabella = mean([pts[21], pts[22]]);
  const chin = pts[8];
  const subnasale = pts[33];
  const third = chin[1] - subnasale[1];
  const trichionY = glabella[1] - third * 1.0; // terços faciais: tríquio–glabela ≈ subnasal–mento
  const landmarks: PhotoLandmarks = {
    pupilR, pupilL,
    facialMidTop: [xAt(glabella[1]), glabella[1]],
    facialMidBottom: [xAt(chin[1]), chin[1]],
    upperLipMid: pts[62], lowerLipMid: pts[66],
    commissureR: pts[48], commissureL: pts[54],
    mouth: idx(60, 67),
    forehead: [xAt(trichionY), trichionY], chin: [xAt(chin[1]), chin[1]],
    zygR: pts[0], zygL: pts[16], gonR: pts[5], gonL: pts[11],
  };
  const dx = pupilL[0] - pupilR[0], dy = pupilL[1] - pupilR[1];
  return {
    landmarks,
    metrics: {
      ipdPx: Math.hypot(dx, dy), rollDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
      mouthWidthPx: Math.hypot(pts[54][0] - pts[48][0], pts[54][1] - pts[48][1]), mouthOpenPx: Math.hypot(pts[66][0] - pts[62][0], pts[66][1] - pts[62][1]),
    },
  };
}
