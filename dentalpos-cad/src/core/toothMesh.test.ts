import { describe, it, expect } from "vitest";
import { allFdi, toothRef, MEAN_DIMS } from "./anatomy";
import { generateTooth } from "./toothMesh";
import { DEFAULT_PROFILE, styleModifiers } from "./profiles";
import { checkWatertight, volume, bounds } from "./mesh";

describe("gerador de dentes", () => {
  it("gera malha estanque e com volume plausível para todos os dentes", () => {
    const mods = styleModifiers(DEFAULT_PROFILE);
    for (const fdi of allFdi(true)) {
      const ref = toothRef(fdi);
      const t = generateTooth({ ref, dims: MEAN_DIMS[ref.jaw][ref.type], mods });
      const w = checkWatertight(t.mesh);
      expect(w.watertight, `FDI ${fdi}: ${JSON.stringify(w)}`).toBe(true);
      const v = volume(t.mesh);
      expect(v).toBeGreaterThan(100);
      expect(v).toBeLessThan(900);
      const b = bounds(t.mesh);
      expect(b.size[2]).toBeGreaterThan(5);
    }
  });
});
