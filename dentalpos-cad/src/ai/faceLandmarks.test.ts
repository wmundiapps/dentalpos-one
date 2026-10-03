import { describe, it, expect } from "vitest";
import { landmarksFrom68, type P2 } from "./faceLandmarks";
import { analyzeFace } from "../core/smile";

/** face sintética de 68 pontos (simétrica, ligeiramente inclinada) */
function synthetic(rollDeg = 0): P2[] {
  const pts: P2[] = new Array(68).fill(0).map(() => [0, 0] as P2);
  const c = 500, r = (rollDeg * Math.PI) / 180;
  const rot = (x: number, y: number): P2 => [c + (x - c) * Math.cos(r) - (y - 500) * Math.sin(r), 500 + (x - c) * Math.sin(r) + (y - 500) * Math.cos(r)];
  const set = (i: number, x: number, y: number) => { pts[i] = rot(x, y); };
  for (let i = 0; i <= 16; i++) { const t = (i - 8) / 8; set(i, c + 230 * t, 520 + 300 * (1 - Math.cos(t * 1.1)) / 0.6 * 0.5 + (1 - Math.abs(t)) * 130); }
  set(0, 270, 360); set(16, 730, 360); set(5, 300, 640); set(11, 700, 640); set(8, 500, 800);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; set(36 + k, 395 + 30 * Math.cos(a), 400 + 12 * Math.sin(a)); set(42 + k, 605 + 30 * Math.cos(a), 400 + 12 * Math.sin(a)); }
  set(21, 450, 360); set(22, 550, 360); set(27, 500, 395); set(28, 500, 430); set(29, 500, 460); set(30, 500, 490); set(33, 500, 520);
  set(48, 410, 640); set(54, 590, 640); set(51, 500, 610); set(57, 500, 700); set(60, 420, 645); set(64, 580, 645);
  set(61, 460, 630); set(62, 500, 628); set(63, 540, 630); set(65, 540, 668); set(66, 500, 672); set(67, 460, 668);
  return pts;
}
describe("marcos faciais a partir de 68 pontos", () => {
  it("mapeia pupilas, boca, linha média e forma do rosto", () => {
    const { landmarks: lm, metrics } = landmarksFrom68(synthetic(0));
    expect(lm.pupilR![0]).toBeCloseTo(395, 0); expect(lm.pupilL![0]).toBeCloseTo(605, 0);
    expect(metrics.ipdPx).toBeCloseTo(210, 0);
    expect(lm.upperLipMid![1]).toBeLessThan(lm.lowerLipMid![1]);
    expect(lm.mouth!.length).toBe(8);
    expect(lm.facialMidTop![0]).toBeCloseTo(500, 0);
    expect(analyzeFace(lm)).not.toBeNull();
  });
  it("estima o giro da cabeça pela linha interpupilar e acompanha a linha média inclinada", () => {
    const { landmarks: lm, metrics } = landmarksFrom68(synthetic(8));
    expect(metrics.rollDeg).toBeCloseTo(8, 0);
    const slope = (lm.facialMidBottom![0] - lm.facialMidTop![0]) / (lm.facialMidBottom![1] - lm.facialMidTop![1]);
    expect(Math.atan(slope) * 180 / Math.PI).toBeCloseTo(-8, 0);
  });
});
