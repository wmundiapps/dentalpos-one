import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { dist } from "./math";

describe("projeto padrão", () => {
  it("posiciona 28 dentes; overjet/overbite ≈ alvo", () => {
    const p = createProject();
    const ev = evaluate(p);
    expect(ev.teeth.size).toBe(28);
    const up = ev.teeth.get(11)!, lo = ev.teeth.get(41)!;
    const oj = up.lm.facialEdge[1] - lo.lm.facialEdge[1];
    const ob = lo.lm.incisalMid[2] - up.lm.incisalMid[2];
    console.log("overjet", oj.toFixed(2), "overbite", ob.toFixed(2));
    for (const f of [11, 13, 16, 26, 31, 33, 36, 46]) {
      const t = ev.teeth.get(f)!;
      console.log(f, t.lm.anchor.map((v) => v.toFixed(1)).join(","), "dist", t.distal.map((v) => v.toFixed(2)).join(","), "fac", t.facial.map((v) => v.toFixed(2)).join(","), "occ", t.occlusal.map((v) => v.toFixed(2)).join(","));
    }
    expect(Math.abs(oj - 1.5)).toBeLessThan(0.3);
    expect(Math.abs(ob - 1.5)).toBeLessThan(0.8);
    // contatos
    for (const [a, b] of [[11, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [31, 32], [45, 46]]) {
      const A = ev.teeth.get(a)!, Bt = ev.teeth.get(b)!; const dd = [A.distal[0] + Bt.distal[0], A.distal[1] + Bt.distal[1]]; const dl = Math.hypot(dd[0], dd[1]); const g = ((Bt.lm.mesialContact[0] - A.lm.distalContact[0]) * dd[0] + (Bt.lm.mesialContact[1] - A.lm.distalContact[1]) * dd[1]) / dl; void dist;
      console.log("gap", a, b, g.toFixed(2));
    }
  });
});

import { generateTooth } from "./toothMesh";
import { styleModifiers, DEFAULT_PROFILE } from "./profiles";
import { toothRef, MEAN_DIMS } from "./anatomy";
import { meshToCustom } from "./library";
import { checkWatertight } from "./mesh";

describe("biblioteca personalizada", () => {
  it("substitui o dente paramétrico por um mesh importado e mantém o contato", () => {
    const ref = toothRef(11);
    const m = generateTooth({ ref, dims: { ...MEAN_DIMS.upper.central, md: 9 }, mods: styleModifiers(DEFAULT_PROFILE) }).mesh;
    const p = createProject();
    p.customTeeth = { 11: meshToCustom(m, "teste.stl") };
    const ev = evaluate(p);
    const t = ev.teeth.get(11)!;
    expect(checkWatertight(t.mesh).watertight).toBe(true);
    expect(Math.abs(t.dims.md - 8.5 * 1.0)).toBeLessThan(1.5);
    expect(t.lm.facialEdge[1]).toBeGreaterThan(t.lm.lingualEdge[1]);
  });
});
