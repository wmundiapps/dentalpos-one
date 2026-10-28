import { loadBrandKit } from "../services/BrandKitApi";
import { KIT_CSS, footer, letterhead } from "./brandKit/templates";
import type { BackendPatient } from "../services/PatientApi";

export interface DebtRow { id: string; description: string; installment?: number | null; installments?: number | null; amount: number; dueDate: string; paymentMethod?: string | null }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dmy = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const ymKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const monthName = (key: string) => { const [y, m] = key.split("-"); const n = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][Number(m) - 1]; return `${n}/${y}`; };
const maskCpf = (v?: string | null) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v || "não informado"; };

export interface DebtReportOptions { withInterest: boolean; finePercent: number; monthlyInterestPercent: number }

// Relatório de débitos para cartório/cobrança: dados do devedor, parcelas vencidas mês a mês e total.
export async function printDebtReport(patient: BackendPatient, rows: DebtRow[], opt: DebtReportOptions) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write('<p style="font-family:Arial;padding:40px">Preparando relatório…</p>');
  const today = new Date();
  const todayKey = today.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  let head = "", foot = "", clinicName = "", clinicCnpj = "", clinicAddr = "";
  try {
    const r = await loadBrandKit();
    const c = r.clinic; const k = r.kit || {};
    const kc = { name: c.displayName || c.name, tagline: k.tagline || "", logo: c.logo || "", color: c.primaryColor || "#1565C0", rtName: k.rtName || "", rtCro: k.rtCro || "", cnpj: c.cnpj || "", phone: c.phone || "", whatsapp: k.whatsapp || "", email: c.email || "", address: c.address || "", city: [c.city, c.state].filter(Boolean).join(" – "), site: k.site || "", instagram: k.instagram || "", logoMm: k.logoWidthMm };
    clinicName = kc.name; clinicCnpj = kc.cnpj; clinicAddr = [kc.address, kc.city].filter(Boolean).join(" – ");
    head = `<div class="bkit"><div style="--b:${esc(kc.color)}">${letterhead(kc)}</div></div>`;
    foot = `<div class="bkit rodape"><div style="--b:${esc(kc.color)}">${footer(kc)}</div></div>`;
  } catch { /* sem identidade */ }

  const sorted = [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const calc = sorted.map((r) => {
    const due = new Date(r.dueDate);
    const days = Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
    const fine = opt.withInterest && days > 0 ? Math.round(r.amount * opt.finePercent) / 100 : 0;
    const interest = opt.withInterest && days > 0 ? Math.round(r.amount * (opt.monthlyInterestPercent / 100) * (days / 30) * 100) / 100 : 0;
    return { r, days, fine, interest, total: Math.round((r.amount + fine + interest) * 100) / 100 };
  });
  const groups = new Map<string, typeof calc>();
  for (const c of calc) { const k = ymKey(c.r.dueDate); groups.set(k, [...(groups.get(k) || []), c]); }
  const grand = calc.reduce((s, c) => s + c.total, 0);
  const principal = calc.reduce((s, c) => s + c.r.amount, 0);
  const cols = opt.withInterest ? 7 : 5;

  const body = [...groups.entries()].map(([key, list]) => {
    const sub = list.reduce((s, c) => s + c.total, 0);
    return `<tr class="mes"><td colspan="${cols}">${esc(monthName(key))}</td></tr>` + list.map(({ r, days, fine, interest, total }) =>
      `<tr><td>${esc(r.description)}${r.installments && r.installments > 1 ? ` — parcela ${r.installment || 1}/${r.installments}` : ""}</td><td>${dmy(r.dueDate)}</td><td>${days}</td><td class="n">${brl(r.amount)}</td>${opt.withInterest ? `<td class="n">${brl(fine)}</td><td class="n">${brl(interest)}</td>` : ""}<td class="n">${brl(total)}</td></tr>`).join("") +
      `<tr class="sub"><td colspan="${cols - 1}">Subtotal de ${esc(monthName(key))} (${list.length} parcela${list.length > 1 ? "s" : ""})</td><td class="n">${brl(sub)}</td></tr>`;
  }).join("");

  const addr = [patient.address, patient.city, patient.state, patient.zipCode ? `CEP ${patient.zipCode}` : ""].filter(Boolean).join(", ");
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de débitos — ${esc(patient.fullName)}</title><style>${KIT_CSS}
.rodape{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:6px 40px 10px}.rodape .df{margin-top:0}
body{font-family:Arial,sans-serif;margin:40px;color:#111;line-height:1.45;padding-bottom:36mm;font-size:12px}
h1{font-size:18px;text-align:center;margin:18px 0 4px}.sub-t{text-align:center;color:#555;margin-bottom:16px}
.box{border:1px solid #bbb;border-radius:6px;padding:10px 14px;margin:10px 0}.box h2{font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em}
.box p{margin:2px 0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}
td.n,th.n{text-align:right;white-space:nowrap}tr.mes td{background:#f3f3f3;font-weight:700}tr.sub td{font-weight:700;text-align:right}tr.sub td:first-child{text-align:right}
.total{margin-top:12px;font-size:14px;text-align:right}.total b{font-size:16px}.sig{display:flex;gap:40px;margin-top:56px}.sig div{flex:1;border-top:1px solid #000;text-align:center;padding-top:4px}
.noprint{position:fixed;top:10px;right:14px}.noprint button{font:600 14px Arial;padding:8px 16px;border:0;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer}@media print{.noprint{display:none}}
</style></head><body><div class="noprint"><button onclick="window.print()">Imprimir</button></div>${foot}${head}
<h1>RELATÓRIO DE DÉBITOS</h1><div class="sub-t">Emitido em ${today.toLocaleDateString("pt-BR")} às ${today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
<div class="box"><h2>Credor</h2><p><b>${esc(clinicName)}</b></p>${clinicCnpj ? `<p>CNPJ: ${esc(clinicCnpj)}</p>` : ""}${clinicAddr ? `<p>Endereço: ${esc(clinicAddr)}</p>` : ""}</div>
<div class="box"><h2>Devedor</h2><p><b>${esc(patient.fullName)}</b></p><p>CPF: ${esc(maskCpf(patient.cpf))}${patient.rg ? ` &nbsp; RG: ${esc(patient.rg)}` : ""}${patient.birthDate ? ` &nbsp; Nascimento: ${dmy(patient.birthDate)}` : ""}</p><p>Endereço: ${esc(addr || "não informado")}</p><p>Telefone: ${esc(patient.phone || "não informado")}${patient.email ? ` &nbsp; E-mail: ${esc(patient.email)}` : ""}</p></div>
<table><thead><tr><th>Descrição</th><th>Vencimento</th><th>Dias em atraso</th><th class="n">Valor original</th>${opt.withInterest ? `<th class="n">Multa ${opt.finePercent}%</th><th class="n">Juros ${opt.monthlyInterestPercent}% a.m.</th>` : ""}<th class="n">${opt.withInterest ? "Total atualizado" : "Valor"}</th></tr></thead><tbody>${body}</tbody></table>
<div class="total">Parcelas vencidas: <b>${calc.length}</b> &nbsp;|&nbsp; Valor original: <b>${brl(principal)}</b>${opt.withInterest ? ` &nbsp;|&nbsp; Total atualizado até ${today.toLocaleDateString("pt-BR")}: <b>${brl(grand)}</b>` : ""}</div>
<p style="margin-top:14px">Declaro que os valores acima correspondem a serviços odontológicos prestados e não quitados até a data de emissão deste relatório (${todayKey.split("-").reverse().join("/")}).${opt.withInterest ? " Multa e juros calculados de forma simples, proporcional aos dias de atraso, conforme percentuais indicados." : ""}</p>
<div class="sig"><div>${esc(clinicName || "Credor")}<br><span style="font-size:11px">Responsável</span></div></div>
</body></html>`);
  w.document.close();
  const imgs = Array.from(w.document.images);
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
  w.focus();
  return true;
}
