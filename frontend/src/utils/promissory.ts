import { loadBrandKit } from "../services/BrandKitApi";
import { KIT_CSS, footer, letterhead } from "./brandKit/templates";
import type { BackendPatient } from "../services/PatientApi";

export interface PromissoryLine { installment: number; amount: number; dueDate: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const longDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const maskDoc = (v?: string | null) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : v || "______________"; };

const UN = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DE = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CE = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(CE[c]);
  if (r) parts.push(r < 20 ? UN[r] : DE[Math.floor(r / 10)] + (r % 10 ? ` e ${UN[r % 10]}` : ""));
  return parts.join(" e ");
}
function inteiro(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000), milhares = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  const out: string[] = [];
  if (milhoes) out.push(`${ate999(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares) out.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) out.push(ate999(resto));
  return out.reduce((acc, p, i) => (i === 0 ? p : acc + (i === out.length - 1 && (resto && resto < 100 || resto % 100 === 0) ? " e " : ", ") + p), "");
}
/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
export function reaisPorExtenso(v: number): string {
  const cents = Math.round(v * 100);
  const reais = Math.floor(cents / 100), cent = cents % 100;
  const r = reais ? `${inteiro(reais)}${reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const c = cent ? `${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ") || "zero real";
}

// Uma nota promissória por parcela (3 por folha A4), para imprimir e o paciente assinar.
export async function printPromissories(win: Window | null, patient: BackendPatient, lines: PromissoryLine[]) {
  const w = win || window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  let clinicName = "Credor", clinicCnpj = "", city = "", head = "", foot = "";
  try {
    const r = await loadBrandKit();
    const c = r.clinic; const k = r.kit || {};
    const kc = { name: c.displayName || c.name, tagline: k.tagline || "", logo: c.logo || "", color: c.primaryColor || "#1565C0", rtName: k.rtName || "", rtCro: k.rtCro || "", cnpj: c.cnpj || "", phone: c.phone || "", whatsapp: k.whatsapp || "", email: c.email || "", address: c.address || "", city: [c.city, c.state].filter(Boolean).join(" – "), site: k.site || "", instagram: k.instagram || "", logoMm: Math.min(k.logoWidthMm || 35, 25) };
    clinicName = kc.name; clinicCnpj = kc.cnpj; city = c.city || "";
    head = `<div class="bkit"><div style="--b:${esc(kc.color)}">${letterhead(kc)}</div></div>`;
    foot = `<div class="bkit rodape"><div style="--b:${esc(kc.color)}">${footer(kc)}</div></div>`;
  } catch { /* sem identidade */ }
  const total = lines.length;
  const issued = new Date();
  const addr = [patient.address, patient.city, patient.state].filter(Boolean).join(", ");
  const note = (l: PromissoryLine) => {
    const due = new Date(l.dueDate);
    return `<section class="np">
      <div class="top"><b>NOTA PROMISSÓRIA</b><span>nº ${l.installment}/${total}</span><span>Vencimento: <b>${due.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</b></span><span class="val">${brl(l.amount)}</span></div>
      <p>Aos <b>${esc(longDate(due))}</b> pagarei por esta única via de NOTA PROMISSÓRIA a <b>${esc(clinicName)}</b>${clinicCnpj ? `, CNPJ ${esc(clinicCnpj)}` : ""}, ou à sua ordem, a quantia de <b>${brl(l.amount)}</b> (${esc(reaisPorExtenso(l.amount))}), em moeda corrente nacional, pagável em ${esc(city || "sua sede")}.</p>
      <p class="em"><b>Emitente:</b> ${esc(patient.fullName)} — CPF ${esc(maskDoc(patient.cpf))}${patient.rg ? ` — RG ${esc(patient.rg)}` : ""}<br>Endereço: ${esc(addr || "______________________________________")}</p>
      <div class="ass"><span>${esc(city || "__________")}, ${esc(longDate(issued))}</span><div class="ln">Assinatura do emitente</div></div>
    </section>`;
  };
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 3) pages.push(`<div class="pg">${i === 0 ? head : ""}${lines.slice(i, i + 3).map(note).join("")}</div>`);
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Promissórias — ${esc(patient.fullName)}</title><style>${KIT_CSS}
body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:12px}.rodape{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:4px 40px 8px}.rodape .df{margin-top:0}
.pg{padding:24px 40px 30mm;page-break-after:always}.pg:last-child{page-break-after:auto}
.np{border:1.5px solid #222;border-radius:6px;padding:12px 16px;margin:12px 0;page-break-inside:avoid}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #999;padding-bottom:6px;font-size:13px}.top .val{font-size:17px;font-weight:800;border:1.5px solid #222;padding:2px 10px}
.np p{margin:8px 0;line-height:1.55}.ass{display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;gap:24px}.ass .ln{border-top:1px solid #000;min-width:260px;text-align:center;padding-top:3px;font-size:11px}
.noprint{position:fixed;top:10px;right:14px}.noprint button{font:600 14px Arial;padding:8px 16px;border:0;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer}@media print{.noprint{display:none}}
</style></head><body><div class="noprint"><button onclick="window.print()">Imprimir</button></div>${foot}${pages.join("")}</body></html>`);
  w.document.close();
  const imgs = Array.from(w.document.images);
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
  w.focus();
  return true;
}
