import { useEffect } from "react";
import { fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { ANDREWS_NORMS } from "../core/anatomy";
import type { Issue } from "../core/rules";
import { PointIndex, type Mesh } from "../core/mesh";
import type { Vec3 } from "../core/math";
import type { Evaluated } from "../core/project";

export function contactColors(ev: Evaluated): Map<number, Float32Array> {
  const out = new Map<number, Float32Array>();
  const mk = (jaw: "upper" | "lower") => {
    const ts = [...ev.teeth.values()].filter((t) => t.ref.jaw === jaw);
    const pos: number[] = [], idx: number[] = [];
    for (const t of ts) { const o = pos.length / 3; pos.push(...t.mesh.positions); for (const i of t.mesh.indices) idx.push(i + o); }
    return { m: { positions: new Float32Array(pos), indices: new Uint32Array(idx) } as Mesh, ts };
  };
  const up = mk("upper"), lo = mk("lower");
  const loIdx = new PointIndex(lo.m, 1.5), upIdx = new PointIndex(up.m, 1.5);
  const color = (d: number | null): [number, number, number] => d === null ? [0.9, 0.86, 0.75] : d < 0.15 ? [0.95, 0.15, 0.15] : d < 0.5 ? [0.98, 0.55, 0.12] : d < 1.0 ? [0.95, 0.9, 0.2] : d < 2 ? [0.4, 0.85, 0.4] : [0.9, 0.86, 0.75];
  for (const [set, other] of [[up, loIdx], [lo, upIdx]] as const) {
    for (const t of set.ts) {
      const col = new Float32Array(t.mesh.positions.length);
      for (let i = 0; i < t.mesh.positions.length / 3; i++) {
        const p: Vec3 = [t.mesh.positions[i * 3], t.mesh.positions[i * 3 + 1], t.mesh.positions[i * 3 + 2]];
        const n: Vec3 = [t.mesh.normals![i * 3], t.mesh.normals![i * 3 + 1], t.mesh.normals![i * 3 + 2]];
        const towards = t.ref.jaw === "upper" ? -n[2] : n[2];
        let d: number | null = null;
        if (towards > 0.15) { const nn = other.nearest(p, 2); d = nn ? nn.dist : null; }
        const [r, g, b] = color(d); col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      }
      out.set(t.fdi, col);
    }
  }
  return out;
}

const KEYS = [
  { n: 1, title: "1ª chave — Relação interarcos", codes: ["K1_MOLAR", "K1_OK", "K1_CANINE"], hint: "Cúspide MV do 1º molar superior no sulco entre MV e média do 1º molar inferior; canino superior na ameia canino/PM inferior." },
  { n: 2, title: "2ª chave — Angulação da coroa (tip)", codes: ["K2_TIP"], hint: "Porção gengival da coroa mais distal que a incisal (positiva)." },
  { n: 3, title: "3ª chave — Inclinação da coroa (torque)", codes: ["K3_TORQUE"], hint: "Incisivos superiores +; posteriores inferiores progressivamente negativos." },
  { n: 4, title: "4ª chave — Rotações", codes: ["K4_ROT"], hint: "Nenhum dente rotacionado." },
  { n: 5, title: "5ª chave — Contatos firmes", codes: ["K5_GAP", "K5_OVERLAP"], hint: "Sem espaços e sem sobreposição." },
  { n: 6, title: "6ª chave — Plano oclusal", codes: ["SPEE_DEEP", "SPEE_WARN", "SPEE_REV", "SPEE_OK"], hint: "Curva de Spee plana a ≤ 1,5 mm." },
];
const worst = (is: Issue[]) => (is.some((i) => i.severity === "error") ? "e" : is.some((i) => i.severity === "warning") ? "w" : "o");

export function OcclusionPanel({ c }: { c: Ctx }) {
  const { report: r, project: p, ev } = c.s;
  const m = r.meas;
  useEffect(() => {
    if (c.colorMode === "contact") return;
    return undefined;
  }, [c.colorMode]);
  return (
    <div data-testid="panel-occlusion">
      <h3>Oclusão — 6 chaves de Andrews</h3>
      {KEYS.map((k) => {
        const is = r.issues.filter((i) => k.codes.includes(i.code));
        const w = is.length ? worst(is) : "o";
        return (<div key={k.n} className={`card ${w}`}><div className="t">{k.title} <span className={`badge ${w}`}>{w === "o" ? "OK" : w === "w" ? "atenção" : "corrigir"}</span></div><div className="tip">{k.hint}</div>{is.filter((i) => i.severity !== "ok").slice(0, 3).map((i) => <div className="m" key={i.id}>• {i.message}</div>)}</div>);
      })}
      <h4>Medidas</h4>
      <table><tbody>
        <tr><td>Overjet</td><td>{fmt(m.overjet)} mm</td><td className="hint">1–3</td></tr>
        <tr><td>Overbite</td><td>{fmt(m.overbite)} mm ({fmt(m.overbitePct, 0)}%)</td><td className="hint">1–3 (20–30%)</td></tr>
        <tr><td>Curva de Spee (profundidade)</td><td>{fmt(m.speeDepth.max)} mm</td><td className="hint">0–1,5</td></tr>
        <tr><td>Curva de Wilson (raio)</td><td>{fmt(m.wilsonRadius, 0)} mm</td><td className="hint">60–250</td></tr>
        <tr><td>Linha média sup × inf</td><td>{fmt(m.midlineDev)} mm</td><td className="hint">≤ 1</td></tr>
        <tr><td>Relação molar D / E</td><td>{fmt(m.molar.R)} / {fmt(m.molar.L)} mm</td><td className="hint">±1</td></tr>
        <tr><td>Bolton anterior / total</td><td>{fmt(m.bolton.anterior)}% / {fmt(m.bolton.overall)}%</td><td className="hint">77,2 / 91,3</td></tr>
        <tr><td>Largura intercanina sup / inf</td><td>{fmt(m.archWidthIntercanine.upper)} / {fmt(m.archWidthIntercanine.lower)} mm</td><td className="hint"></td></tr>
        <tr><td>Largura intermolar sup / inf</td><td>{fmt(m.archWidthIntermolar.upper)} / {fmt(m.archWidthIntermolar.lower)} mm</td><td className="hint"></td></tr>
      </tbody></table>
      <div className="btns">
        <button className={`btn ${c.colorMode === "contact" ? "p" : ""}`} data-testid="btn-contactmap" onClick={() => c.setColorMode(c.colorMode === "contact" ? "shade" : "contact")}>Mapa de contatos oclusais</button>
      </div>
      {c.colorMode === "contact" && <div className="hint">Vermelho &lt; 0,15 mm (contato) · laranja &lt; 0,5 · amarelo &lt; 1,0 · verde &lt; 2,0 mm.</div>}
      <h4>Angulação e inclinação por dente</h4>
      <table><thead><tr><th>Dente</th><th>Tip</th><th>norma</th><th>Torque</th><th>norma</th><th>Rot.</th></tr></thead><tbody>
        {[...ev.teeth.values()].sort((a, b) => a.fdi - b.fdi).map((t) => { const n = ANDREWS_NORMS[t.ref.jaw][t.ref.type]; const et = Math.abs(t.pose.tip - n.tip), eq = Math.abs(t.pose.torque - n.torque); return (<tr key={t.fdi} style={{ cursor: "pointer" }} onClick={() => c.setSel(t.fdi)}><td>{t.fdi}</td><td className={et > 6 ? "e" : et > 3 ? "w" : ""}>{fmt(t.pose.tip, 0)}°</td><td className="hint">{n.tip}°</td><td className={eq > 7 ? "e" : eq > 3 ? "w" : ""}>{fmt(t.pose.torque, 0)}°</td><td className="hint">{n.torque}°</td><td className={Math.abs(t.pose.rotation) > 3 ? "w" : ""}>{fmt(t.pose.rotation, 0)}°</td></tr>); })}
      </tbody></table>
      <p className="hint">Dentes com valores fora da faixa ±3° (tip/torque) aparecem em amarelo e ±6–7° em vermelho. Clique na linha para selecionar. Overjet atual do projeto: {fmt(p.occlusion.overjet)} mm (alvo configurado).</p>
    </div>
  );
}
