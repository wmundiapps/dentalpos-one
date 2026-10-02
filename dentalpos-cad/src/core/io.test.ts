import { describe, it, expect } from "vitest";
import { exportSTL, importSTL, makeZip, crc32, exportOBJ, importOBJ, exportPLY, importPLY } from "./io";
import { generateTooth } from "./toothMesh";
import { DEFAULT_PROFILE, styleModifiers } from "./profiles";
import { MEAN_DIMS, toothRef } from "./anatomy";
import { triCount, volume, transformMesh } from "./mesh";
import { kabsch, rotZ, rotX, mMul, rigidApply } from "./math";
import { icp, bestInsertionAxis, orientFromLandmarks } from "./scan";
import { compensateSintering, nestInDisc, DISCS, millingReach, planCamJob } from "./cam";
import { designCrown, DEFAULT_PREP } from "./crown";

const tooth = (f: number) => generateTooth({ ref: toothRef(f), dims: MEAN_DIMS[toothRef(f).jaw][toothRef(f).type], mods: styleModifiers(DEFAULT_PROFILE) });

describe("E/S, scan, CAM, coroa", () => {
  it("round-trip STL/OBJ/PLY", () => {
    const m = tooth(16).mesh;
    const s = importSTL(exportSTL(m));
    expect(triCount(s)).toBe(triCount(m));
    expect(Math.abs(volume(s) - volume(m)) / volume(m)).toBeLessThan(0.001);
    expect(triCount(importOBJ(exportOBJ(m)))).toBe(triCount(m));
    expect(triCount(importPLY(exportPLY(m)))).toBe(triCount(m));
    const z = makeZip([{ name: "a.stl", data: exportSTL(m) }]);
    expect(z[0]).toBe(0x50);
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });
  it("Kabsch/ICP recuperam transformação", () => {
    const m = tooth(11).mesh;
    const T = { R: mMul(rotZ(12), rotX(-7)), t: [3, -2, 1] as [number, number, number] };
    const moved = transformMesh(m, T);
    const pts = [0, 50, 100, 150, 200].map((i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]] as [number, number, number]);
    const K = kabsch(pts, pts.map((p) => rigidApply(T, p)));
    expect(K.t[0]).toBeCloseTo(3, 3);
    const r = icp(m, moved, { R: rotZ(8), t: [2, -1, 0.5] }, 40);
    expect(r.rms).toBeLessThan(0.15);
  });
  it("eixo de inserção, orientação, sinterização, nesting, fresabilidade", () => {
    const m = tooth(16).mesh;
    const ax = bestInsertionAxis(m);
    expect(ax.undercut).toBeLessThanOrEqual(ax.undercutAtVertical + 1e-9);
    const o = orientFromLandmarks([-26, -30, 5], [26, -30, 5], [0, 0, 5]);
    expect(o.width).toBeCloseTo(52, 3);
    const s = compensateSintering(m, 1.25);
    expect(volume(s) / volume(m)).toBeCloseTo(1.25 ** 3, 1);
    const nest = nestInDisc([...Array(10)].map((_, i) => ({ id: `u${i}`, mesh: m, radius: 8, height: 10 })), DISCS[1]);
    expect(nest.placed.length).toBe(10);
    expect(millingReach(m, 0.5, 0.3).unreachableMm3).toBeGreaterThanOrEqual(0);
    const plan = planCamJob([{ id: "u1", mesh: m, material: "zirconia-ml" }, { id: "u2", mesh: tooth(26).mesh, material: "zirconia-ml" }]);
    expect(plan.items.length).toBe(2);
  });
  it("coroa sobre preparo: espessura coerente", () => {
    const r = designCrown(tooth(16), { ...DEFAULT_PREP, axial: 1.2, occlusal: 1.6 }, "zirconia-ml", 0.3);
    console.log({ ...r.stats, thinPoints: r.stats.thinPoints.length });
    expect(r.stats.meanAxial).toBeGreaterThan(0.6);
    expect(volume(r.shell)).toBeGreaterThan(100);
  });
});
