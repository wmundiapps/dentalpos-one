import { fmtDate, fmtMin, STATUS_LABEL, type DayRow, type Totals } from "../services/HrApi";
import { loadBrandKit } from "../services/BrandKitApi";

export type MirrorData = { ref: string; employee: { id: string; name: string; position: string }; days: DayRow[]; totals: Totals };
const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Espelho de ponto mensal, uma folha por colaborador, com declaração e assinatura.
export async function printTimeMirrors(list: MirrorData[], opts: { cnpjFallback?: string } = {}): Promise<boolean> {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write('<p style="font-family:Arial;padding:40px">Preparando os espelhos de ponto…</p>');
  let clinic = "";
  let cnpj = opts.cnpjFallback || "";
  try { const b = await loadBrandKit(); clinic = b.clinic.displayName || b.clinic.name || ""; cnpj = b.clinic.cnpj || cnpj; } catch { /* sem identidade */ }
  const page = (m: MirrorData) => {
    const [y, mo] = m.ref.split("-");
    const mes = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const rows = m.days.map((d) => {
      const wd = WEEK[new Date(`${d.date}T12:00:00`).getDay()];
      const by = (k: string) => d.punches.find((p) => p.kind === k)?.time || "";
      const obs = d.status === "OK" ? (d.punches.length === 4 ? "" : d.punches.length ? "Batida faltando" : (d.note || "")) : (STATUS_LABEL[d.status] || d.status) + (d.note ? ` — ${d.note}` : "");
      return `<tr><td>${fmtDate(d.date)}</td><td>${wd}</td><td>${by("ENTRADA")}</td><td>${by("SAIDA_ALMOCO")}</td><td>${by("VOLTA_ALMOCO")}</td><td>${by("SAIDA")}</td><td>${d.workedMin ? fmtMin(d.workedMin) : ""}</td><td>${d.expectedMin ? fmtMin(d.diffMin) : ""}</td><td>${esc(obs)}</td></tr>`;
    }).join("");
    const t = m.totals;
    return `<section class="pg">
      <h2>Espelho de ponto — ${esc(mes)}</h2>
      <div class="sub">${esc(clinic)}${cnpj ? ` • CNPJ ${esc(cnpj)}` : ""}</div>
      <div class="emp"><b>${esc(m.employee.name)}</b> • ${esc(m.employee.position || "")}</div>
      <table><thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Saída almoço</th><th>Volta</th><th>Saída</th><th>Trabalhadas</th><th>Saldo</th><th>Observação</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="tot"><b>Trabalhadas:</b> ${fmtMin(t.workedMin)} &nbsp; <b>Esperadas:</b> ${fmtMin(t.expectedMin)} &nbsp; <b>Banco de horas:</b> ${fmtMin(t.balanceMin)} &nbsp; <b>Horas extras:</b> ${fmtMin(t.overtimeMin)} &nbsp; <b>Faltas:</b> ${t.faltas} &nbsp; <b>Atrasos:</b> ${t.atrasos}${t.incompletos ? ` &nbsp; <b>Dias com batida faltando:</b> ${t.incompletos}` : ""}</p>
      <p class="decl">Declaro que conferi os registros de ponto acima, referentes a ${esc(mes)}, e que eles correspondem à minha jornada no período.</p>
      <div class="sig"><div>${esc(m.employee.name)}<br><small>Colaborador(a) — data ____/____/______</small></div><div>Responsável (RH)<br><small>data ____/____/______</small></div></div>
    </section>`;
  };
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Espelho de ponto</title><style>
body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:11px}.pg{padding:14mm 12mm;page-break-after:always}.pg:last-child{page-break-after:auto}
h2{margin:0 0 2px;font-size:17px}.sub{color:#555;margin-bottom:6px}.emp{font-size:13px;margin:6px 0 8px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:2px 4px;text-align:left;font-size:10.5px}th{background:#eee}
.tot{margin:10px 0 6px}.decl{margin:8px 0 0;font-size:11px}.sig{display:flex;gap:40px;margin-top:46px}.sig div{flex:1;border-top:1px solid #000;text-align:center;padding-top:4px}
.noprint{position:fixed;top:10px;right:14px}.noprint button{font:600 14px Arial;padding:8px 16px;border:0;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer}@media print{.noprint{display:none}}
</style></head><body><div class="noprint"><button onclick="window.print()">Imprimir</button></div>${list.map(page).join("")}</body></html>`);
  w.document.close();
  w.focus();
  return true;
}
