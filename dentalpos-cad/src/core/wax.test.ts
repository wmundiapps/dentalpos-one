import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { buildJawVolume, buildMockupTray, jawMeshes, WaxSculpt } from "./wax";
import { volume, triCount } from "./mesh";

describe("enceramento / mockup", () => {
  it("monta volume do arco superior, bandeja e escultura", () => {
    const ev = evaluate(createProject());
    const t0 = Date.now();
    const v = buildJawVolume(ev, "upper", 0.5);
    const m = jawMeshes(v);
    console.log("grid", v.grid.nx, v.grid.ny, v.grid.nz, "ms", Date.now() - t0, "tris", triCount(m.model));
    expect(volume(m.teeth)).toBeGreaterThan(2500);
    const tray = buildMockupTray(ev, "upper", {}, v);
    console.log("tray tris", triCount(tray.mesh), "vol", volume(tray.mesh).toFixed(0), "ms", Date.now() - t0);
    expect(volume(tray.mesh)).toBeGreaterThan(500);
    const w = WaxSculpt.fromJaw(v);
    const v0 = w.volumeMm3();
    const c = ev.teeth.get(11)!.lm.incisalMid;
    w.add([c[0], c[1] + 0.5, c[2] - 1], 1.5);
    expect(w.volumeMm3()).toBeGreaterThan(v0);
    w.carve([c[0], c[1], c[2] - 1], 1.5);
  });
});
