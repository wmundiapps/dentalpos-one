import type { LabServiceOrder } from "../services/LabServiceOrderApi";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const dmy = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export function accompanyingItems(o: LabServiceOrder) {
  const items: string[] = [];
  if (o.scanUpper) items.push("Escaneamento superior");
  if (o.scanLower) items.push("Escaneamento inferior");
  if (o.scanBite) items.push("Registro de mordida (escaneamento)");
  if (o.impressionUpper) items.push("Moldagem superior");
  if (o.impressionLower) items.push("Moldagem inferior");
  if (o.waxBite) items.push("Mordida em cera");
  return items;
}

function openPrint(title: string, body: string, css: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { window.alert("Libere as janelas pop-up do navegador para imprimir."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}${css}</style></head><body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

// Etiquetas com o protocolo, para colar nas moldeiras, na mordida em cera etc. (uma por item que acompanha o trabalho).
export function printLabLabels(o: LabServiceOrder) {
  const items = accompanyingItems(o);
  const labels = (items.length ? items : ["Trabalho"]).map((item) => `<div class="l"><div class="p">${esc(o.protocol)}</div><div class="i">${esc(item)}</div><div class="s">${esc(o.patientName)}</div><div class="s">Dr(a). ${esc(o.dentistName)} · ${esc(o.laboratoryName)}</div><div class="s">Envio ${dmy(o.sentAt)} · Entrega ${dmy(o.dueAt)}</div></div>`).join("");
  openPrint(`Etiquetas ${o.protocol}`, `<div class="g">${labels}</div>`,
    ".g{display:flex;flex-wrap:wrap;gap:10px}.l{width:300px;border:2px solid #000;border-radius:6px;padding:10px;page-break-inside:avoid}.p{font-size:30px;font-weight:900;letter-spacing:1px}.i{font-size:16px;font-weight:700;margin:4px 0}.s{font-size:12px}");
}

export function printLabOrder(o: LabServiceOrder) {
  const items = accompanyingItems(o);
  const row = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  const body = `<h1>Ordem de serviço — Laboratório</h1><div class="p">Protocolo ${esc(o.protocol)}</div>
<table>${row("Paciente", o.patientName)}${row("Contato do paciente", o.patientContact)}${row("Dentista responsável", o.dentistName)}${row("Contato do dentista", o.dentistContact)}${row("Auxiliar responsável", o.assistantName)}${row("Laboratório", o.laboratoryName)}${row("Serviço a ser executado", o.service)}${row("Cor do elemento", o.shade)}${row("Elementos", o.elements)}${row("Data do envio", dmy(o.sentAt))}${row("Data de entrega", dmy(o.dueAt))}${row("Acompanha", items.join(", "))}</table>
<h2>Recebimento pelo laboratório</h2>${o.receiptCode ? `<p style="font-size:15px"><b>Código de recebimento: ${esc(o.receiptCode)}</b> — o laboratório digita este código no sistema (Notificações) para confirmar que recebeu o trabalho.</p>` : ""}<p>Recebido por: ______________________________ Data: ____/____/______</p><p>(&nbsp;&nbsp;) Recebido &nbsp;&nbsp; (&nbsp;&nbsp;) Recusado — motivo: ______________________________________________</p>
<p class="f">Emitido por ${esc(o.createdByName || "—")} em ${new Date(o.createdAt).toLocaleString("pt-BR")}. Cole o protocolo ${esc(o.protocol)} nas moldeiras e na mordida em cera.</p>`;
  openPrint(`OS ${o.protocol}`, body, "h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin-top:28px}.p{font-size:26px;font-weight:900;margin:8px 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:7px 10px;text-align:left;font-size:14px}th{width:38%;background:#eee}.f{font-size:11px;color:#555;margin-top:24px}");
}
