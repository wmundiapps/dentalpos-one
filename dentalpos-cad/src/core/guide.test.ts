import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { analyze } from "./rules";
import { buildSurgicalGuide, defaultImplant, implantAxis } from "./guide";
import { volume, checkWatertight } from "./mesh";
import { analyzeFace, smileMap, frontShapes } from "./smile";
import { dist } from "./math";

describe("guia cirúrgico", () => {
  it("implante padrão alinhado ao eixo protético; regras de distância e inclinação", () => {
    let p = createProject();
    const ev = evaluate(p);
    const i46 = defaultImplant(ev, 46)!, i45 = defaultImplant(ev, 45)!;
    p = { ...p, implants: [i46] };
    expect(analyze(p).issues.filter((i) => i.category === "implante")).toHaveLength(0);
    p = { ...p, implants: [{ ...i46, tiltBL: 28 }, { ...i45, x: i46.x + 5, y: i46.y }] };
    const codes = analyze(p).issues.map((i) => i.code);
    expect(codes).toContain("IMP_TILT");
    expect(codes).toContain("IMP_IMP");
    p = { ...p, implants: [{ ...i46, boneWidth: 5.5, canalDistance: 1.0, boneHeight: 9, length: 10 }] };
    const c2 = analyze(p).issues.map((i) => i.code);
    expect(c2).toContain("IMP_BONE_W"); expect(c2).toContain("IMP_CANAL"); expect(c2).toContain("IMP_BONE_H");
  });
  it("gera guia com furo e manga", () => {
    let p = createProject();
    const ev = evaluate(p);
    p = { ...p, implants: [defaultImplant(ev, 46)!, defaultImplant(ev, 36)!] };
    const t0 = Date.now();
    const g = buildSurgicalGuide(p, ev, "lower", { resolution: 0.6 });
    console.log("guia ms", Date.now() - t0, "tris", g.guide.indices.length / 3);
    expect(volume(g.guide)).toBeGreaterThan(1000);
    expect(g.sleeves.indices.length).toBeGreaterThan(0);
    // eixo do implante alinhado: manga na linha do eixo
    const ax = implantAxis(p.implants[0], ev);
    expect(Math.abs(ax[2])).toBeGreaterThan(0.7);
    expect(checkWatertight(g.sleeves).watertight).toBe(true);
  });
});

describe("sorriso", () => {
  it("mapeia mm→px pela distância interpupilar e classifica a face", () => {
    const p = createProject();
    p.photo = { name: "x", width: 900, height: 1100, landmarks: { pupilR: [345, 425], pupilL: [555, 425], upperLipMid: [450, 790], lowerLipMid: [450, 842], commissureR: [320, 812], commissureL: [580, 812], facialMidTop: [450, 330], facialMidBottom: [450, 1040], forehead: [450, 180], chin: [450, 1040], zygR: [232, 540], zygL: [668, 540], gonR: [262, 860], gonL: [638, 860] } };
    const ev = evaluate(p);
    const m = smileMap(p, ev)!;
    expect(m.pxPerMm).toBeCloseTo(210 / 63, 3);
    const a = m.toPx(0, m.zRef), b = m.toPx(10, m.zRef);
    expect(dist([a[0], a[1], 0], [b[0], b[1], 0])).toBeCloseTo(10 * m.pxPerMm, 2);
    expect(frontShapes(ev).length).toBe(24);
    const f = analyzeFace(p.photo.landmarks)!;
    expect(["oval", "elongated", "round", "diamond"]).toContain(f.shape);
  });
});
