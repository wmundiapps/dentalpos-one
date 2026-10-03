import { useEffect, useState } from "react";
import { Check, Section, Sel, Slider, download, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import { job } from "./jobs";
import { getManualMargin, getScans, meshOfScan } from "./ScanPanel";
import { restorations } from "./restoreStore";
import { DEFAULT_RESTORATION, type RestorationParams, type RestorationReport } from "../core/restoration";
import { MATERIALS, type MaterialId } from "../core/materials";
import { exportSTL } from "../core/io";
import { isAnterior } from "../core/anatomy";
import type { Vec3 } from "../core/math";

const MAT_OPTIONS: MaterialId[] = ["zirconia-ml", "emax-cad", "emax-press", "zirconia-ht", "zirconia-st", "pmma", "composite-cad", "hybrid-ceramic", "feldspathic"];
const circle = (c: Vec3, r = 1.4, n = 24): Array<[number, number, number]> => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * 2 * Math.PI), c[1] + r * Math.sin((i / n) * 2 * Math.PI), c[2] + 0.2]);

export function RestorePanel({ c }: { c: Ctx }) {
  const { project: p, ev } = c.s;
  const scans = getScans();
  const [fdi, setFdi] = useState<number>(c.sel ?? 16);
  const [pick, setPick] = useState<Vec3 | null>(null);
  const [picking, setPicking] = useState(false);
  const [material, setMaterial] = useState<MaterialId>("zirconia-ml");
  const [marginMode, setMarginMode] = useState<"auto" | "manual">("auto");
  const [par, setPar] = useState<RestorationParams>(DEFAULT_RESTORATION);
  const [prog, setProg] = useState<{ stage: string; p: number } | null>(null);
  const [, tick] = useState(0);
  const cur = restorations.get(fdi) ?? null;
  const upd = (patch: Partial<RestorationParams>) => setPar((q) => ({ ...q, ...patch }));
  useEffect(() => { if (c.sel && p.fdis.includes(c.sel)) setFdi(c.sel); }, [c.sel, p.fdis]);

  const ref = ev.teeth.get(fdi)?.ref;
  const mat = MATERIALS[material];
  const presetFromMaterial = () => {
    const ant = ref ? isAnterior(ref.type) : false;
    upd({ cementGap: mat.cementGap, minThicknessAxial: ant ? mat.min.axialAnterior : mat.min.axialPosterior, minThicknessOcclusal: ant ? mat.min.incisal : mat.min.occlusal });
  };
  useEffect(presetFromMaterial, [material, fdi]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPick = () => {
    if (!scans.work) return c.toast("Importe a arcada de trabalho (preparo) na aba Escaneamento.");
    setPicking(true);
    c.pickHandler.current = (pt, id) => {
      if (id !== "scan-work") return;
      setPick(pt); setPicking(false); c.pickHandler.current = null;
      c.setLines("restore-pick", [{ id: "pick", pts: circle(pt), color: "#ffb454", closed: true }]);
      c.toast("Preparo marcado. Ajuste os parâmetros e gere a restauração.");
    };
  };
  const showResult = (r: typeof cur) => {
    if (!r) { c.setExtra("restore-crown", null); c.setExtra("restore-cavity", null); c.setLines("restore-margin", null); return; }
    c.setExtra("restore-crown", { id: "restore-crown", mesh: r.crown, color: "#f1e7cf" });
    c.setLines("restore-margin", r.margin.length ? [{ id: "m", pts: r.margin, color: "#ff5d5d", closed: true }] : null);
  };
  const run = async () => {
    const scan = meshOfScan("work"); if (!scan) return c.toast("Importe a arcada de trabalho (preparo) na aba Escaneamento.");
    if (!pick) return c.toast("Marque o preparo (botão “Marcar o preparo”).");
    const tooth = ev.teeth.get(fdi)?.model; if (!tooth) return c.toast("Dente inexistente no projeto.");
    const manual = getManualMargin();
    c.setBusy("Gerando restauração…");
    setProg({ stage: "iniciando", p: 0 });
    const r = await job({ kind: "restore", scan, antagonist: meshOfScan("antagonist") ?? undefined, pick, tooth, params: par, margin: marginMode === "manual" && manual.length >= 6 ? manual : undefined }, (stage, pr) => { setProg({ stage, p: pr }); c.setBusy(`Restauração: ${stage} (${Math.round(pr * 100)} %)`); });
    c.setBusy(null); setProg(null);
    if (!r.ok || !r.meshes?.crown) return c.toast(r.error ?? "Falha ao gerar a restauração.");
    const d = r.data as { report: RestorationReport; margin: Vec3[] };
    restorations.set(fdi, { fdi, crown: r.meshes.crown, cavity: r.meshes.cavity, margin: d.margin as Array<[number, number, number]>, material, report: d.report, toCam: true });
    showResult(restorations.get(fdi)!); tick((n) => n + 1);
    c.setHideTeeth(true);
    c.toast(d.report.warnings.length ? `Restauração gerada com ${d.report.warnings.length} aviso(s) — confira o relatório.` : "Restauração gerada e verificada.");
  };
  const rep = cur?.report;
  const okCls = (ok: boolean) => (ok ? "o" : "w");
  return (
    <div data-testid="panel-restore">
      <h3>Restauração a partir do escaneamento</h3>
      <p className="hint">Fluxo completo: escaneamentos → preparo → término automático → eixo de inserção → dente da biblioteca ajustado ao espaço → folga de cimento → contatos → oclusão → espessura → STL e fresagem. Valores de referência; confira clinicamente antes de produzir.</p>
      <Section title="1 · Escaneamentos">
        <div className="card i"><div className="m">Arcada de trabalho: <b>{scans.work ? scans.work.fileName : "não importada"}</b><br />Antagonista: <b>{scans.antagonist ? scans.antagonist.fileName : "não importado (a oclusão não será verificada)"}</b></div><div className="tip">Importe e oriente os arquivos na aba “Escaneamento (STL)”.</div></div>
      </Section>
      <Section title="2 · Dente e preparo">
        <Sel label="Dente a restaurar (FDI)" value={String(fdi)} options={p.fdis.map((f) => [String(f), `${f} — ${ev.teeth.get(f)?.ref.name ?? ""}`] as [string, string])} onChange={(v) => setFdi(parseInt(v))} testid="sel-restore-fdi" />
        <Sel label="Material" value={material} options={MAT_OPTIONS.map((m) => [m, MATERIALS[m].name] as [MaterialId, string])} onChange={setMaterial} />
        <div className="btns"><button className={`btn ${picking ? "p" : ""}`} data-testid="btn-restore-pick" onClick={startPick}>{picking ? "Clique no preparo…" : pick ? "Marcar o preparo novamente" : "Marcar o preparo"}</button></div>
        {pick && <div className="hint">Ponto do preparo: [{pick.map((v) => v.toFixed(1)).join("; ")}] mm</div>}
      </Section>
      <Section title="3 · Parâmetros">
        <Sel label="Linha de término" value={marginMode} options={[["auto", "Automática (IA geométrica)"], ["manual", "Manual (marcada na aba Escaneamento)"]]} onChange={setMarginMode} />
        <div className="row2">
          <Slider label="Folga de cimento" value={par.cementGap} min={0} max={0.2} step={0.01} unit=" mm" digits={2} onChange={(v) => upd({ cementGap: v })} />
          <Slider label="Espaçador começa a" value={par.spacerStart} min={0} max={2} step={0.1} unit=" mm" digits={1} onChange={(v) => upd({ spacerStart: v })} />
        </div>
        <div className="row2">
          <Slider label="Espessura axial mín." value={par.minThicknessAxial} min={0.3} max={2} step={0.05} unit=" mm" digits={2} onChange={(v) => upd({ minThicknessAxial: v })} />
          <Slider label="Espessura oclusal mín." value={par.minThicknessOcclusal} min={0.4} max={3} step={0.05} unit=" mm" digits={2} onChange={(v) => upd({ minThicknessOcclusal: v })} />
        </div>
        <Slider label="Folga com o antagonista" value={par.antagonistClearance} min={0} max={0.5} step={0.01} unit=" mm" digits={2} onChange={(v) => upd({ antagonistClearance: v })} />
        <Slider label="Deslocar término ao longo do eixo" value={par.marginOffset} min={-1} max={1} step={0.05} unit=" mm" digits={2} onChange={(v) => upd({ marginOffset: v })} />
        <Slider label="Giro da coroa" value={par.yawDeg} min={-30} max={30} step={0.5} unit="°" onChange={(v) => upd({ yawDeg: v })} />
        <div className="row2">
          <Slider label="Deslocamento mésio-distal" value={par.shiftMD} min={-2} max={2} step={0.05} unit=" mm" digits={2} onChange={(v) => upd({ shiftMD: v })} />
          <Slider label="Deslocamento vest.-lingual" value={par.shiftFB} min={-2} max={2} step={0.05} unit=" mm" digits={2} onChange={(v) => upd({ shiftFB: v })} />
        </div>
        <div className="row2">
          <Slider label="Largura (×)" value={par.scaleMd} min={0.8} max={1.2} step={0.01} digits={2} onChange={(v) => upd({ scaleMd: v })} />
          <Slider label="Altura (×)" value={par.scaleH} min={0.8} max={1.2} step={0.01} digits={2} onChange={(v) => upd({ scaleH: v })} />
        </div>
        <Check label="Ajustar largura/altura ao espaço entre vizinhos e antagonista" checked={par.autoFit} onChange={(v) => upd({ autoFit: v })} />
        <Check label="Inverter mesial/distal (se o dente saiu virado)" checked={par.flipMesial} onChange={(v) => upd({ flipMesial: v })} />
        <Sel label="Qualidade (resolução da grade)" value={String(par.resolution)} options={[["0.2", "Rápida (0,20 mm)"], ["0.14", "Padrão (0,14 mm)"], ["0.12", "Alta (0,12 mm)"], ["0.08", "Máxima (0,08 mm)"]]} onChange={(v) => upd({ resolution: parseFloat(v) })} />
      </Section>
      <Section title="4 · Gerar">
        <div className="btns"><button className="btn p" data-testid="btn-restore-run" onClick={run} disabled={!!prog}>Gerar restauração</button></div>
        {prog && <div className="hint">{prog.stage} — {Math.round(prog.p * 100)} %</div>}
      </Section>
      {cur && rep && (<Section title={`5 · Verificação — dente ${cur.fdi}`}>
        <div className={`card ${rep.warnings.length ? "w" : "o"}`} data-testid="restore-report">
          <div className="t">{rep.warnings.length ? `${rep.warnings.length} aviso(s)` : "Sem avisos"} · volume {fmt(rep.volumeMm3, 0)} mm³ · {rep.triangles.toLocaleString("pt-BR")} triângulos</div>
          {rep.warnings.map((w, i) => <div className="m" key={i}>⚠ {w}</div>)}
        </div>
        <table><tbody>
          <tr><td>Término</td><td>{fmt(rep.marginLengthMm)} mm · {rep.marginPoints} pts</td><td className="hint">ajuste médio {fmt(rep.marginFit.meanGap, 2)} · máx. {fmt(rep.marginFit.maxGap, 2)} mm</td></tr>
          <tr><td>Eixo de inserção</td><td>{rep.axis.map((v) => v.toFixed(2)).join("; ")}</td><td className="hint">sombra {fmt(rep.axisUndercutPct, 1)} %</td></tr>
          <tr><td>Espaço mesial / distal / oclusal</td><td>{fmt(rep.space.mesial)} / {fmt(rep.space.distal)} / {fmt(rep.space.occlusal)} mm</td><td className="hint">escala L×A {fmt(rep.scale.md, 2)}×{fmt(rep.scale.h, 2)}</td></tr>
          <tr className={okCls(rep.thickness.minAxial >= rep.thickness.requiredAxial * 0.85)}><td>Espessura axial</td><td>mín. {fmt(rep.thickness.minAxial, 2)} · média {fmt(rep.thickness.meanAxial, 2)} mm</td><td className="hint">exigido {fmt(rep.thickness.requiredAxial, 2)}</td></tr>
          <tr><td>Espessura oclusal</td><td>mín. {fmt(rep.thickness.minOcclusal, 2)} · média {fmt(rep.thickness.meanOcclusal, 2)} mm</td><td className="hint">exigido {fmt(rep.thickness.requiredOcclusal, 2)}</td></tr>
          <tr><td>Contatos proximais (folga)</td><td>mesial {fmt(rep.contacts.mesialGap, 2)} · distal {fmt(rep.contacts.distalGap, 2)} mm</td><td className="hint">≤ 0 = contato</td></tr>
          <tr><td>Oclusão</td><td>{rep.occlusion.hasAntagonist ? `folga mín. ${fmt(rep.occlusion.minClearance, 2)} mm · contato ${fmt((rep.occlusion.contactFraction ?? 0) * 100, 0)} %` : "sem antagonista"}</td><td className="hint">superfície plana {fmt(rep.flatOcclusalPct, 0)} %</td></tr>
        </tbody></table>
        <Check label="Mostrar coroa" checked={true} onChange={() => showResult(cur)} />
        <div className="btns">
          <button className="btn g" data-testid="btn-restore-stl" onClick={() => download(`${p.name}-coroa-${cur.fdi}.stl`, exportSTL(cur.crown, `coroa-${cur.fdi}`))}>Exportar coroa (STL)</button>
          <button className="btn" onClick={() => cur.cavity && download(`${p.name}-intaglio-${cur.fdi}.stl`, exportSTL(cur.cavity, `intaglio-${cur.fdi}`))} disabled={!cur.cavity}>Exportar intaglio (STL)</button>
          <button className="btn" onClick={() => { cur.toCam = !cur.toCam; tick((n) => n + 1); }}>{cur.toCam ? "✓ Incluída na fresagem" : "Incluir na fresagem"}</button>
          <button className="btn" onClick={() => { restorations.delete(fdi); showResult(null); tick((n) => n + 1); }}>Descartar</button>
        </div>
        <div className="hint">Na aba “Materiais / CAM”, as restaurações incluídas entram no planejamento do disco (compensação de sinterização, pinos e nesting).</div>
      </Section>)}
    </div>
  );
}
