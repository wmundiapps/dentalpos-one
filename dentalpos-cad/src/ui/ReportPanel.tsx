import { download, fmt } from "./atoms";
import type { Ctx } from "./ctx";
import type { Store } from "./store";
import { FACE_LABEL, FORM_LABEL, SEX_LABEL, ETHNICITY_LABEL, AGE_LABEL } from "../core/profiles";
import { PROPORTION_LABEL } from "../core/rules";
import { serializeProject } from "../core/io";
import { designOf } from "../core/project";
import { MATERIALS } from "../core/materials";

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const SEV = { error: ["#c62828", "CORRIGIR"], warning: ["#ef8f00", "ATENÇÃO"], info: ["#1565c0", "INFO"], ok: ["#2e7d32", "OK"] } as const;

export function buildReportHtml(s: Store): string {
  const { project: p, report: r } = s;
  const m = r.meas;
  const rows = r.issues.map((i) => `<tr><td><span class="pill" style="background:${SEV[i.severity][0]};color:#fff">${SEV[i.severity][1]}</span></td><td>${esc(i.title)}${i.teeth.length ? ` <small>(${i.teeth.join(", ")})</small>` : ""}</td><td>${esc(i.message)}</td><td>${esc(i.tip)}</td></tr>`).join("");
  const units = s.project.fdis.filter((f) => designOf(p, f).kind !== "natural").map((f) => { const d = designOf(p, f); return `<tr><td>${f}</td><td>${d.kind}</td><td>${esc(MATERIALS[d.material].name)}</td></tr>`; }).join("");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relatório DentalPos CAD — ${esc(p.name)}</title><style>body{font:12px system-ui;margin:24px;color:#111}h1{font-size:20px;margin:0}h2{font-size:14px;border-bottom:2px solid #222;margin-top:18px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}.pill{padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700}.k{display:inline-block;margin-right:18px}</style>
<h1>DentalPos CAD — Relatório do projeto</h1><div>${esc(p.name)} · ${new Date().toLocaleString("pt-BR")}</div>
<h2>Paciente / critérios de desenho</h2><div>Face ${FACE_LABEL[p.patient.face]} · ${SEX_LABEL[p.patient.sex]} · ${ETHNICITY_LABEL[p.patient.ethnicity]} · ${AGE_LABEL[p.patient.age]} · forma dos dentes: ${FORM_LABEL[p.form]} · cor ${p.shade} · proporção: ${PROPORTION_LABEL[p.proportion]}</div>
<h2>Pontuação de qualidade: ${r.overall}/100</h2><div>${(Object.entries(r.scores) as Array<[string, number]>).map(([k, v]) => `<span class="k"><b>${k}</b> ${v}</span>`).join("")}</div>
<h2>Medidas</h2><div>Overjet ${fmt(m.overjet)} mm · Overbite ${fmt(m.overbite)} mm (${fmt(m.overbitePct, 0)}%) · Spee ${fmt(m.speeDepth.max)} mm · Wilson R ${fmt(m.wilsonRadius, 0)} mm · Linha média ${fmt(m.midlineDev)} mm · Molar D/E ${fmt(m.molar.R)}/${fmt(m.molar.L)} mm · Bolton ${fmt(m.bolton.anterior)}% / ${fmt(m.bolton.overall)}%</div>
${units ? `<h2>Restaurações</h2><table><tr><th>Dente</th><th>Tipo</th><th>Material</th></tr>${units}</table>` : ""}
${p.implants.length ? `<h2>Implantes planejados</h2><table><tr><th>Sítio</th><th>Ø</th><th>Comprimento</th><th>Sistema</th></tr>${p.implants.map((i) => `<tr><td>${i.fdi}</td><td>${i.diameter}</td><td>${i.length}</td><td>${i.system}</td></tr>`).join("")}</table>` : ""}
<h2>Achados e recomendações</h2><table><tr><th></th><th>Item</th><th>Medida</th><th>Como corrigir</th></tr>${rows}</table>
<p style="color:#666;margin-top:20px">Gerado automaticamente pelo DentalPos CAD. Ferramenta de apoio à decisão: valores de referência da literatura e dos fabricantes devem ser confirmados pelo profissional responsável. Não substitui o julgamento clínico.</p></html>`;
}

export function ReportPanel({ c }: { c: Ctx }) {
  const html = buildReportHtml(c.s);
  const body = html.replace(/^[\s\S]*?<style>[\s\S]*?<\/style>/, "").replace(/<\/html>$/, "");
  return (
    <div data-testid="panel-report">
      <h3>Relatório</h3>
      <div className="btns">
        <button className="btn p" onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); w.print(); } }}>Imprimir / PDF</button>
        <button className="btn" onClick={() => download(`${c.s.project.name}-relatorio.html`, html, "text/html")}>Baixar HTML</button>
        <button className="btn" onClick={() => download(`${c.s.project.name}.dpcad.json`, serializeProject(c.s.project), "application/json")}>Baixar projeto (.json)</button>
      </div>
      <div className="report" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}
