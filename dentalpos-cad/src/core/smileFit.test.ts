import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { fitSmileToPhoto, smileMetrics } from "./smileFit";
import { analyze } from "./rules";

const photoProject = () => {
  const p = createProject();
  return { ...p, photo: { name: "t", width: 800, height: 900, landmarks: { pupilR: [300, 300] as [number, number], pupilL: [500, 300] as [number, number], upperLipMid: [400, 520] as [number, number], lowerLipMid: [400, 548] as [number, number], commissureR: [310, 535] as [number, number], commissureL: [490, 535] as [number, number], facialMidTop: [400, 250] as [number, number], facialMidBottom: [400, 700] as [number, number] } } };
};

describe("IA do sorriso", () => {
  it("ajusta alturas (X), toque no lábio inferior, gengiva e corredor bucal à foto", () => {
    const r = fitSmileToPhoto(photoProject());
    console.log(r.notes.join("\n"));
    expect(r.ok).toBe(true);
    const m = smileMetrics(r.project, evaluate(r.project))!;
    console.log(JSON.stringify(m));
    expect(Math.abs(m.gumShowMm! - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(m.lipGapMm!)).toBeLessThan(0.2);
    expect(m.corridorPct!).toBeGreaterThan(3); expect(m.corridorPct!).toBeLessThan(14);
    const rep = analyze(r.project);
    console.log(rep.issues.filter((i) => i.severity !== "ok" && i.category === "foto").map((i) => i.code + " " + i.message));
  });
});
