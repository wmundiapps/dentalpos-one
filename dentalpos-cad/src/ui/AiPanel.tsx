import { useState } from "react";
import { sevClass } from "./atoms";
import type { Ctx } from "./ctx";
import { autoCorrect, claudeProvider, explain, llmReview } from "../core/ai";
import type { Issue, Severity } from "../core/rules";

export function AiPanel({ c }: { c: Ctx }) {
  const { report: r, project: p } = c.s;
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [llm, setLlm] = useState<string>("");
  const [key, setKey] = useState(() => { try { return sessionStorage.getItem("dpcad-llm") ?? ""; } catch { return ""; } });
  const list = r.issues.filter((i) => (filter === "all" ? i.severity !== "ok" : i.severity === filter));
  const fixAll = () => {
    const res = autoCorrect(p, { minSeverity: "info" });
    c.s.set(() => res.project);
    c.toast(`IA aplicou ${res.applied.length} correção(ões): erros ${res.before.counts.error}→${res.after.counts.error}, avisos ${res.before.counts.warning}→${res.after.counts.warning}.`);
  };
  const show = (i: Issue) => { setOpen(open === i.id ? null : i.id); c.setHighlight(i.teeth); if (i.teeth[0]) c.setSel(i.teeth[0]); };
  return (
    <div data-testid="panel-ai">
      <h3>IA — alertas e correções</h3>
      <div className="score">
        <div><b style={{ color: r.overall >= 85 ? "var(--ok)" : r.overall >= 65 ? "var(--warn)" : "var(--err)" }} data-testid="score">{r.overall}</b>qualidade</div>
        <div><b style={{ color: "var(--err)" }}>{r.counts.error}</b>erros</div>
        <div><b style={{ color: "var(--warn)" }}>{r.counts.warning}</b>avisos</div>
        <div><b style={{ color: "var(--ok)" }}>{r.counts.ok}</b>ok</div>
      </div>
      <div className="btns">
        <button className="btn p" data-testid="btn-fixall" onClick={fixAll} disabled={!r.issues.some((i) => i.fix && i.severity !== "ok")}>✨ Corrigir tudo automaticamente</button>
      </div>
      <div className="btns">{(["all", "error", "warning", "info", "ok"] as const).map((f) => <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "pendências" : f === "error" ? "erros" : f === "warning" ? "avisos" : f === "info" ? "dicas" : "ok"}</button>)}</div>
      {list.length === 0 && <div className="card o"><div className="t">Nada pendente 🎉</div><div className="tip">Nenhum alerta neste filtro.</div></div>}
      {list.map((i) => (
        <div key={i.id} className={`card ${sevClass(i.severity)}`} data-testid="issue" onClick={() => show(i)} style={{ cursor: "pointer" }}>
          <div className="t">{i.title} {i.teeth.length > 0 && i.teeth.length < 5 && <span className="badge">{i.teeth.join(" · ")}</span>}</div>
          <div className="m">{i.message}</div>
          {i.target && <div className="tip">Meta: {i.target}</div>}
          {open === i.id && <div className="tip" style={{ color: "#c3d0e0", whiteSpace: "pre-wrap" }}>{explain(i)}</div>}
          {i.fix && i.severity !== "ok" && <div className="btns"><button className="btn g" onClick={(e) => { e.stopPropagation(); c.s.set(i.fix!.apply); }}>Corrigir: {i.fix.label}</button></div>}
        </div>
      ))}
      <h4>Revisão com IA generativa (opcional)</h4>
      <p className="hint">Usa a API Messages do Claude diretamente do seu navegador, com a sua chave (guardada só nesta sessão). Sem chave, as correções locais acima continuam funcionando.</p>
      <input type="password" placeholder="Chave da API Anthropic (sk-ant-…)" value={key} onChange={(e) => { setKey(e.target.value); try { sessionStorage.setItem("dpcad-llm", e.target.value); } catch { /* */ } }} />
      <div className="btns"><button className="btn" disabled={!key} onClick={async () => { c.setBusy("Consultando IA…"); try { setLlm(await llmReview(claudeProvider({ apiKey: key }), p, r)); } catch (e) { setLlm(`Falha: ${e instanceof Error ? e.message : e}`); } c.setBusy(null); }}>Pedir revisão do caso</button></div>
      {llm && <div className="card i"><div className="m" style={{ whiteSpace: "pre-wrap" }}>{llm}</div></div>}
    </div>
  );
}
