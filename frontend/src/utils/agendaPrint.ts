import type { IntegratedAppointment } from "../types/operationsHub";

// Impressão da agenda: período (dia, semana ou mês) e profissional escolhidos. Sai paciente, dia, horário e procedimento.
export type AgendaPrintView = "day" | "week" | "month";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dmy = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR");
const weekday = (day: string) => { const w = new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" }); return w.charAt(0).toUpperCase() + w.slice(1); };
const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Dias do período a partir da data de referência (semana de segunda a domingo, como na agenda).
export function agendaRange(view: AgendaPrintView, dateISO: string): string[] {
  const base = new Date(`${dateISO}T12:00:00`);
  if (view === "day") return [dateISO];
  if (view === "week") {
    const day = base.getDay() || 7;
    base.setDate(base.getDate() - day + 1);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return iso(d); });
  }
  const y = base.getFullYear();
  const m = base.getMonth();
  return Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => iso(new Date(y, m, i + 1)));
}

export function agendaPrintItems(items: IntegratedAppointment[], days: string[], professional: string) {
  return items
    .filter((a) => days.includes(a.dateISO) && !["Cancelado", "Desmarcado"].includes(a.status) && (professional === "Todos" || a.professionalName === professional))
    .sort((a, b) => (a.dateISO + a.time).localeCompare(b.dateISO + b.time) || a.patientName.localeCompare(b.patientName));
}

export function printAgenda(opts: { items: IntegratedAppointment[]; view: AgendaPrintView; dateISO: string; professional: string }) {
  const days = agendaRange(opts.view, opts.dateISO);
  const list = agendaPrintItems(opts.items, days, opts.professional);
  const all = opts.professional === "Todos";
  let clinic = "";
  try { clinic = (JSON.parse(localStorage.getItem("dentalpos.clinic.identity.v1") || "{}") as { name?: string }).name || ""; } catch { /* sem identidade salva */ }
  const period = opts.view === "day" ? `${weekday(days[0])}, ${dmy(days[0])}` : `${dmy(days[0])} a ${dmy(days[days.length - 1])}`;
  const label = opts.view === "day" ? "Dia" : opts.view === "week" ? "Semana" : "Mês";

  const sections = days
    .map((day) => {
      const rows = list.filter((a) => a.dateISO === day);
      if (!rows.length) return "";
      const body = rows
        .map((a) => {
          const start = minutes(a.time);
          const end = clock(start + Math.max(10, a.durationMinutes || 30));
          return `<tr><td class="h">${esc(a.time)} – ${esc(end)}</td><td><b>${esc(a.patientName)}</b></td><td>${esc(a.procedure || "—")}</td>${all ? `<td>${esc(a.professionalName)}</td>` : ""}</tr>`;
        })
        .join("");
      return `<h2>${esc(weekday(day))}, ${dmy(day)} <span>${rows.length} paciente(s)</span></h2><table><thead><tr><th class="h">Horário</th><th>Paciente</th><th>Procedimento</th>${all ? "<th>Profissional</th>" : ""}</tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("");

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) { window.alert("Libere as janelas pop-up do navegador para imprimir."); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda — ${esc(period)}</title><style>
@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px}
.top{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}.top b{font-size:18px}.top div{font-size:12px;color:#444;margin-top:2px}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 4px;display:flex;justify-content:space-between;border-bottom:1px solid #999;padding-bottom:2px}h2 span{font-size:11px;font-weight:400;color:#555;text-transform:none}
table{border-collapse:collapse;width:100%;margin-bottom:4px}th,td{border:1px solid #888;padding:5px 7px;text-align:left;font-size:12px;vertical-align:top}th{background:#eee}.h{white-space:nowrap;width:1%}
tr{page-break-inside:avoid}.vazio{margin-top:24px;font-size:14px}.f{margin-top:18px;font-size:10px;color:#666}.noprint{margin-bottom:10px}
@media print{.noprint{display:none}}</style></head><body>
<div class="noprint"><button onclick="window.print()" style="font-size:14px;padding:6px 14px">Imprimir</button></div>
<div class="top">${clinic ? `<b>${esc(clinic)}</b>` : ""}<h1>Agenda — ${esc(label)}: ${esc(period)}</h1><div>Profissional: ${esc(opts.professional === "Todos" ? "Todos" : opts.professional)} • ${list.length} agendamento(s)</div></div>
${sections || `<p class="vazio">Nenhum agendamento neste período.</p>`}
<p class="f">Emitido em ${new Date().toLocaleString("pt-BR")}. Não inclui cancelados nem desmarcados.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}
