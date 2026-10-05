import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { analyze } from "./rules";
import { measure } from "./measure";
import { schemeHeight, DEFAULT_HEIGHTS, toothRef } from "./anatomy";

describe("regras clínicas do protocolo", () => {
  const p = createProject();
  const ev = evaluate(p);
  const m = measure(ev);
  it("alturas seguem o esquema X (central X+0,5; lateral X; canino X+0,5; PM X; 1ºM X−0,5; 2ºM X−1)", () => {
    const X = DEFAULT_HEIGHTS.xUpper, hs = ev.mods.heightScale;
    const h = (f: number) => ev.teeth.get(f)!.dims.h / hs;
    expect(h(11)).toBeCloseTo(X + 0.5, 1); expect(h(12)).toBeCloseTo(X, 1); expect(h(13)).toBeCloseTo(X + 0.5, 1);
    expect(h(14)).toBeCloseTo(X, 1); expect(h(16)).toBeCloseTo(X - 0.5, 1); expect(h(17)).toBeCloseTo(X - 1, 1);
    const XL = DEFAULT_HEIGHTS.xLower;
    expect(schemeHeight("lower", toothRef(33).type, DEFAULT_HEIGHTS)).toBeCloseTo(XL + 0.5);
    expect(ev.teeth.get(31)!.dims.h / hs).toBeCloseTo(XL, 1); expect(ev.teeth.get(36)!.dims.h / hs).toBeCloseTo(XL - 0.5, 1);
  });
  it("torque palatino progressivo nos superiores e lingual progressivo nos inferiores", () => {
    const tq = (f: number) => ev.teeth.get(f)!.pose.torque;
    expect(tq(14)).toBeGreaterThan(tq(15)); expect(tq(15)).toBeGreaterThan(tq(16)); expect(tq(16)).toBeGreaterThan(tq(17));
    expect(tq(11)).toBeGreaterThan(0); // anteriores levemente vestibularizados
    expect(tq(34)).toBeGreaterThan(tq(35)); expect(tq(35)).toBeGreaterThan(tq(36)); expect(tq(36)).toBeGreaterThan(tq(37));
  });
  it("overjet e overbite entre 1 e 2 mm; Classe I molar; zênites e cristas sem alerta", () => {
    expect(m.overjet!).toBeGreaterThan(1); expect(m.overjet!).toBeLessThan(2);
    expect(m.overbite!).toBeGreaterThan(1); expect(m.overbite!).toBeLessThan(2);
    expect(Math.abs(m.molar.R!)).toBeLessThan(1);
    const r = analyze(p);
    expect(r.issues.filter((i) => ["ZENITH_CK", "ZENITH_LP", "H_SCHEME"].includes(i.code) && i.severity !== "ok").length).toBe(0);
    expect(r.issues.filter((i) => i.code === "RIDGE" && i.severity === "warning").length).toBe(0);
  });
  it("arco inferior sem lingualização posterior; superior levemente arredondado no posterior", () => {
    const ang = (f: number) => Math.abs((ev.teeth.get(f)!.pose.archTangent * 180) / Math.PI);
    expect(ang(36)).toBeLessThan(84); // posterior retilíneo: não volta para a língua
    expect(ang(36) - ang(34)).toBeLessThan(8);
    expect(ang(17) - ang(15)).toBeGreaterThan(2); // superior continua curvando levemente
    expect(ang(11)).toBeLessThan(20); expect(ang(12)).toBeLessThan(ang(13)); // incisivos pouco curvos, curvatura máxima no canino
  });
  it("posicionamento artístico: lateral superior em inset, canino em leve off-set", () => {
    const base = evaluate({ ...p, artistic: { upperLateral: 0, upperCanine: 0, upperMolar: 0, lowerCanine: 0, lowerMolar: 0 } });
    const dy = (f: number) => ev.teeth.get(f)!.lm.anchor[1] - base.teeth.get(f)!.lm.anchor[1];
    expect(dy(12)).toBeLessThan(-0.2); expect(dy(13)).toBeGreaterThan(-0.1);
  });
});
