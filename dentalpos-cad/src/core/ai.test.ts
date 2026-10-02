import { describe, it, expect } from "vitest";
import { createProject } from "./project";
import { analyze } from "./rules";
import { autoCorrect, autoDesign, recommendDesign } from "./ai";

describe("IA local", () => {
  it("corrige problemas induzidos", () => {
    let p = createProject();
    p = { ...p, adjust: { 12: { rotation: 20, tip: 15 }, 21: { torque: 25 }, 45: { dx: 1.8 } }, occlusion: { ...p.occlusion, overjet: 6, overbite: 6.5, speeRadius: 60 } };
    const before = analyze(p);
    const res = autoCorrect(p);
    console.log("antes", before.counts, before.overall, "depois", res.after.counts, res.after.overall, res.applied.map((a) => a.label));
    expect(res.after.counts.error + res.after.counts.warning).toBeLessThan(before.counts.error + before.counts.warning);
    expect(res.after.counts.error).toBe(0);
  });
  it("recomenda por face", () => {
    expect(recommendDesign({ ...createProject().patient, face: "inverted-triangle" }).form).toBe("tapered");
    const r = autoDesign({ face: "square", sex: "male" });
    expect(r.project.form).toBe("square");
    expect(r.correction.after.counts.error).toBe(0);
  });
});
