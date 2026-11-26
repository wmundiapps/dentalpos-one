import type { IntegratedLaboratoryWork } from "../types/operationsHub";

// Impressão da ordem de serviço de um trabalho do laboratório e da fila resumida (o que fazer, paciente, dentista, entrega).

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const dmy = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—");

export const isOpenWork = (w: IntegratedLaboratoryWork) => !["Entregue", "Liberado"].includes(w.status);

// Fila: o que ainda não foi liberado nem entregue, pela data de entrega (sem data vai para o fim).
export function labQueue(works: IntegratedLaboratoryWork[]) {
  return works
    .filter(isOpenWork)
    .sort((a, b) => (a.dueDateISO || "9999-12-31").localeCompare(b.dueDateISO || "9999-12-31") || a.id - b.id);
}

export function whatToDo(w: IntegratedLaboratoryWork) {
  const parts = [w.workType];
  if (w.teeth) parts.push(`dentes ${w.teeth}`);
  if (w.material && w.material !== "A definir") parts.push(w.material);
  if (w.toothShade) parts.push(`cor ${w.toothShade}`);
  return parts.filter(Boolean).join(" · ");
}

function openPrint(title: string, body: string, css: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { window.alert("Libere as janelas pop-up do navegador para imprimir."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}${css}</style></head><body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

export function printLabWorkOrder(w: IntegratedLaboratoryWork) {
  const row = (k: string, v?: string) => `<tr><th>${esc(k)}</th><td>${esc(v || "—")}</td></tr>`;
  const items = (w.receivedItems || []).join(", ");
  const body = `<h1>Ordem de serviço — Laboratório</h1><div class="p">${esc(w.trackingCode)}</div>
<table>${row("Paciente", w.patientName)}${row("Dentista", w.dentistName)}${row("Serviço a ser executado", w.workType)}${row("Dentes / elementos", w.teeth)}${row("Material", w.material)}${row("Cor", [w.toothShade, w.shadeSystem].filter(Boolean).join(" — "))}${row("Observações da cor", w.shadeNotes)}${row("DVO", w.dvo)}${row("Moldagem", w.impressionType)}${row("Acompanha", items)}${row("Técnico responsável", w.responsibleTechnician)}${row("Prioridade", w.priority)}${row("Data de entrada", dmy(w.entryDateISO))}${row("Data de entrega ao dentista", dmy(w.dueDateISO))}${row("Retorno do paciente", dmy(w.patientReturnDateISO))}${row("Próxima ação", w.nextAction)}${row("Observações", w.observations)}</table>
<h2>Recebimento pelo laboratório</h2><p>Recebido por: ______________________________ Data: ____/____/______</p><p>(&nbsp;&nbsp;) Recebido &nbsp;&nbsp; (&nbsp;&nbsp;) Recusado — motivo: ______________________________________________</p>
<p class="f">Emitido em ${new Date().toLocaleString("pt-BR")}. Cole o código ${esc(w.trackingCode)} nas moldeiras e no trabalho.</p>`;
  openPrint(`OS ${w.trackingCode}`, body, "h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin-top:28px}.p{font-size:26px;font-weight:900;margin:8px 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:7px 10px;text-align:left;font-size:14px}th{width:34%;background:#eee}.f{font-size:11px;color:#555;margin-top:24px}");
}

export function printLabQueue(works: IntegratedLaboratoryWork[]) {
  const queue = labQueue([...works]);
  const rows = queue.map((w) => `<tr><td><b>${dmy(w.dueDateISO)}</b></td><td>${esc(w.patientName)}</td><td>${esc(w.dentistName)}</td><td>${esc(whatToDo(w))}${w.nextAction ? `<br><small>Próxima ação: ${esc(w.nextAction)}</small>` : ""}${w.observations ? `<br><small>Obs.: ${esc(w.observations)}</small>` : ""}</td><td>${esc(w.status)}${w.priority === "Urgente" || w.priority === "Alta" ? `<br><b>${esc(w.priority)}</b>` : ""}</td><td>${esc(w.trackingCode)}</td></tr>`).join("");
  const body = `<h1>Fila do laboratório</h1><p class="f">${queue.length} trabalho(s) em andamento, por data de entrega. Emitido em ${new Date().toLocaleString("pt-BR")}.</p>
<table><thead><tr><th>Entrega</th><th>Paciente</th><th>Dentista</th><th>O que fazer</th><th>Status</th><th>Código</th></tr></thead><tbody>${rows || `<tr><td colspan="6">Nenhum trabalho em andamento.</td></tr>`}</tbody></table>`;
  openPrint("Fila do laboratório", body, "h1{font-size:22px;margin:0 0 4px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:6px 8px;text-align:left;font-size:12px;vertical-align:top}th{background:#eee}small{color:#444}.f{font-size:11px;color:#555;margin:4px 0 14px}tr{page-break-inside:avoid}");
}
