import { describe, it, expect } from "vitest";
import { createProject, evaluate } from "./project";
import { toothRef } from "./anatomy";
import { styleModifiers } from "./profiles";
import { requestFor, putSculpted, sculptKey } from "./sculptCache";
import { sculptTooth } from "./toothSdf";
import { measure } from "./measure";
import { analyze } from "./rules";

describe("projeto com dentes esculpidos", () => {
  it("posiciona, fecha contatos e mantém as regras", () => {
    const p = createProject();
    const mods = styleModifiers(p.patient, p.form);
    for (const f of p.fdis) { const r = toothRef(f), q = requestFor(r, mods, 0.18); putSculpted(sculptKey(r, mods), sculptTooth(r, q.opts)); }
    const ev = evaluate(p), m = measure(ev);
    console.log("overjet", m.overjet?.toFixed(2), "overbite", m.overbite?.toFixed(2), "molar", m.molar.R?.toFixed(2));
    console.log("gaps", m.contacts.map((c) => `${c.a}-${c.b}:${c.gap.toFixed(2)}`).join(" "));
    const bad = m.contacts.filter((c) => Math.abs(c.gap) > 0.5);
    console.log("fora de ±0,5:", JSON.stringify(bad));
    for (const f of [11, 13, 14, 36]) { const t = ev.teeth.get(f)!; console.log("LM", f, "edgeZ", m.edgeZ[f].toFixed(2), "zen", m.zenith[f].toFixed(2), "cusps", t.lm.cusps.map((c) => c.map((v) => v.toFixed(1)).join(",")).join(" | ")); }
    { const u = ev.teeth.get(13)!, l = ev.teeth.get(43)!, l2 = ev.teeth.get(44)!; console.log("CAN up tip", u.lm.incisalMid.map((v) => v.toFixed(1)).join(","), "43 dis", l.lm.distalContact.map((v) => v.toFixed(1)).join(","), "44 mes", l2.lm.mesialContact.map((v) => v.toFixed(1)).join(","), "43 anchor", l.lm.anchor.map((v) => v.toFixed(1)).join(","), "dist43", l.distal.map((v) => v.toFixed(2)).join(",")); }
    { const evp = evaluate({ ...p, library: "procedural" }); const u = evp.teeth.get(13)!, l = evp.teeth.get(43)!, l2 = evp.teeth.get(44)!; console.log("PROC up tip", u.lm.incisalMid.map((v) => v.toFixed(1)).join(","), "43 dis", l.lm.distalContact.map((v) => v.toFixed(1)).join(","), "44 mes", l2.lm.mesialContact.map((v) => v.toFixed(1)).join(","), "43 anchor", l.lm.anchor.map((v) => v.toFixed(1)).join(",")); }
    const r = analyze(p);
    console.log(r.issues.filter((i) => i.severity === "error" || i.severity === "warning").map((i) => i.severity + " " + i.code + " " + i.message).join("\n"));
    expect(ev.teeth.size).toBe(28);
    expect(r.counts.error).toBe(0);
  }, 240000);
});
