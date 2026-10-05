import { describe, it, expect } from "vitest";
import { sculptTooth, DEFAULT_ANATOMY } from "./toothSdf";
import { MEAN_DIMS, toothRef } from "./anatomy";
import { anatomyOf, createProject } from "./project";
import { bounds } from "./mesh";

const gen = (fdi: number, anat = {}) => { const r = toothRef(fdi); return sculptTooth(r, { ...MEAN_DIMS[r.jaw][r.type], res: 0.2, anat }); };
const vol = (m: ReturnType<typeof gen>) => { let v = 0; const P = m.positions; for (let i = 0; i < m.indices.length; i += 3) { const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3; v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; } return Math.abs(v); };

describe("parâmetros de anatomia", () => {
  it("altura das cúspides aprofunda a mesa oclusal (mais relevo) mantendo a altura total", () => {
    const base = bounds(gen(16)).size[2], hi = bounds(gen(16, { cuspHeight: 1.6 })).size[2];
    expect(Math.abs(hi - base)).toBeLessThan(1.2);
    expect(vol(gen(16, { cuspHeight: 1.6 }))).toBeLessThan(vol(gen(16)));
    expect(vol(gen(16, { cuspHeight: 0.5 }))).toBeGreaterThan(vol(gen(16)));
  });
  it("volume das cúspides e espessura incisal mudam o volume do dente", () => {
    expect(vol(gen(16, { cuspWidth: 1.5 }))).toBeGreaterThan(vol(gen(16)));
    expect(vol(gen(11, { edge: 1.8 }))).toBeGreaterThan(vol(gen(11)));
    expect(vol(gen(11, { cingulum: 1.6 }))).toBeGreaterThan(vol(gen(11, { cingulum: 0.5 })));
  });
  it("anatomyOf combina padrão, tipo e dente (dente vence tipo)", () => {
    const p = { ...createProject(), anatomy: { byType: { "upper-molar1": { fossa: 1.4, cuspHeight: 1.2 } }, byTooth: { 16: { cuspHeight: 0.8 } } } };
    expect(anatomyOf(p, toothRef(16))).toMatchObject({ ...DEFAULT_ANATOMY, fossa: 1.4, cuspHeight: 0.8 });
    expect(anatomyOf(p, toothRef(26))).toMatchObject({ fossa: 1.4, cuspHeight: 1.2 });
    expect(anatomyOf(p, toothRef(11))).toEqual(DEFAULT_ANATOMY);
  });
});
