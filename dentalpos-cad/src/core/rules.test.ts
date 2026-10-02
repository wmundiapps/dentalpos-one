import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { analyze, proportionTargets } from "./rules";

describe("regras", () => {
  it("projeto padrão: lista achados", () => {
    const p = createProject();
    const r = analyze(p);
    for (const i of r.issues) console.log(i.severity.padEnd(7), i.code.padEnd(12), i.title, "|", i.message);
    console.log(r.scores, r.overall, JSON.stringify({ spee: r.meas.speeDepth, wilson: r.meas.wilsonRadius, mol: r.meas.molar, can: r.meas.canine, bolton: r.meas.bolton, app: [11,12,13].map(f=>r.meas.apparent[f].toFixed(2)) }));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(proportionTargets("golden")!.lat).toBeCloseTo(0.618);
  });
  it("detecta e corrige problemas induzidos", () => {
    let p = createProject();
    p = { ...p, adjust: { 12: { rotation: 20, dx: 1.5 }, 21: { torque: 25 } }, occlusion: { ...p.occlusion, overjet: 6, overbite: -1 } };
    const r = analyze(p);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("K4_ROT");
    expect(codes).toContain("OB_OPEN");
    expect(evaluate(p).teeth.size).toBe(28);
  });
});
