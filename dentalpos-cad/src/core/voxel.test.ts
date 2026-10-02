import { describe, it, expect } from "vitest";
import { gridFor, rasterizeSolid, sdfFromOccupancy, sdfOffset, sdfSubtract, surfaceNets, sdfVolume, sdfCylinder } from "./voxel";
import { generateTooth } from "./toothMesh";
import { DEFAULT_PROFILE, styleModifiers } from "./profiles";
import { MEAN_DIMS, toothRef } from "./anatomy";
import { volume, checkWatertight } from "./mesh";

describe("voxel/SDF", () => {
  it("reconstrói dente com volume ~ original e oferece offsets", () => {
    const ref = toothRef(11);
    const t = generateTooth({ ref, dims: MEAN_DIMS.upper.central, mods: styleModifiers(DEFAULT_PROFILE) });
    const g = gridFor([t.mesh], 0.25, 3);
    const occ = rasterizeSolid(g, [t.mesh]);
    const s = sdfFromOccupancy(g, occ);
    const v0 = volume(t.mesh), v1 = sdfVolume(g, s);
    expect(Math.abs(v1 - v0) / v0).toBeLessThan(0.06);
    const shell = sdfSubtract(sdfOffset(s, 1), s);
    const m = surfaceNets(g, shell, 0);
    expect(m.indices.length).toBeGreaterThan(100);
    expect(volume(m)).toBeGreaterThan(0);
    const bore = sdfCylinder(g, [0, 0, -5], [0, 0, 15], 1);
    const holed = surfaceNets(g, sdfSubtract(sdfOffset(s, 1), bore), 0);
    expect(checkWatertight(holed, 1e-3).watertight).toBe(true);
  });
});
