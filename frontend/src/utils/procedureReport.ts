import { loadBrandKit } from "../services/BrandKitApi";
import { KIT_CSS, footer, letterhead } from "./brandKit/templates";
import type { BackendPatient } from "../services/PatientApi";
import type { EvolutionSignature } from "../services/EvolutionSignatureApi";

export interface ProcedureLine { id: string; date: string; procedure: string; professional: string; notes: string; teeth?: string[] }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const maskCpf = (v?: string | null) => { const d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : v || "não informado"; };

// Relatório dos procedimentos realizados, com o visto (assinatura) do paciente e do dentista em cada um.
export async function printProcedureReport(patient: BackendPatient, rows: ProcedureLine[], sigs: EvolutionSignature[]) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write('<p style="font-family:Arial;padding:40px">Preparando relatório…</p>');
  let head = "", foot = "";
  try {
    const r = await loadBrandKit();
    const c = r.clinic; const k = r.kit || {};
    const kc = { name: c.displayName || c.name, tagline: k.tagline || "", logo: c.logo || "", color: c.primaryColor || "#1565C0", rtName: k.rtName || "", rtCro: k.rtCro || "", cnpj: c.cnpj || "", phone: c.phone || "", whatsapp: k.whatsapp || "", email: c.email || "", address: c.address || "", city: [c.city, c.state].filter(Boolean).join(" – "), site: k.site || "", instagram: k.instagram || "", logoMm: k.logoWidthMm };
    head = `<div class="bkit"><div style="--b:${esc(kc.color)}">${letterhead(kc)}</div></div>`;
    foot = `<div class="bkit rodape"><div style="--b:${esc(kc.color)}">${footer(kc)}</div></div>`;
  } catch { /* sem identidade */ }
  const byId = new Map(sigs.map((s) => [s.evolutionId, s]));
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const signed = sorted.filter((r) => byId.get(r.id)?.patientSignature).length;
  const items = sorted.map((r, i) => {
    const s = byId.get(r.id);
    const pat = s?.patientSignature ? `<div class="vis"><img src="${esc(s.patientSignature)}" alt="Assinatura do paciente"><div class="cap">Visto do paciente: ${esc(s.patientSignerName || patient.fullName)}<br>Confirmado no sistema em ${s.patientSignedAt ? dt(s.patientSignedAt) : "—"}${s.patientIp ? ` · IP ${esc(s.patientIp)}` : ""}</div></div>` : `<div class="vis sem"><div class="cap">Sem assinatura do paciente</div></div>`;
    const den = s?.dentistSignature ? `<div class="vis"><img src="${esc(s.dentistSignature)}" alt="Visto do dentista"><div class="cap">Visto do profissional: ${esc(s.dentistSignerName || r.professional)}<br>${s.dentistSignedAt ? dt(s.dentistSignedAt) : ""}</div></div>` : `<div class="vis sem"><div class="cap">Sem visto do profissional</div></div>`;
    return `<section class="it"><div class="h"><b>${i + 1}. ${esc(r.procedure)}</b><span>${dt(r.date)}</span></div><div>Profissional: ${esc(r.professional)}${r.teeth?.length ? ` · Dente(s): ${esc(r.teeth.join(", "))}` : ""}</div>${r.notes ? `<div class="n">${esc(r.notes)}</div>` : ""}<div class="sg">${pat}${den}</div>${s ? `<div class="hash">Código de integridade: ${esc(s.contentHash.slice(0, 24))}… ${s.intact ? "(registro íntegro)" : "(ATENÇÃO: o registro foi alterado após a assinatura)"}</div>` : ""}</section>`;
  }).join("");
  const today = new Date();
  w.document.open();
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Procedimentos — ${esc(patient.fullName)}</title><style>${KIT_CSS}
body{font-family:Arial,sans-serif;margin:40px;color:#111;font-size:12px;line-height:1.45;padding-bottom:36mm}.rodape{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:6px 40px 10px}.rodape .df{margin-top:0}
h1{font-size:18px;text-align:center;margin:18px 0 2px}.sub{text-align:center;color:#555;margin-bottom:14px}.box{border:1px solid #bbb;border-radius:6px;padding:8px 12px;margin:8px 0}
.it{border:1px solid #999;border-radius:6px;padding:10px 12px;margin:10px 0;page-break-inside:avoid}.h{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:3px}.n{margin:4px 0;color:#333}
.sg{display:flex;gap:16px;margin-top:8px}.vis{flex:1;border-top:1px solid #000;padding-top:4px;text-align:center}.vis img{max-height:60px;max-width:100%}.vis .cap{font-size:10px;color:#444}.vis.sem{color:#a00;border-top-style:dashed}
.hash{font-size:9px;color:#777;margin-top:6px}.noprint{position:fixed;top:10px;right:14px}.noprint button{font:600 14px Arial;padding:8px 16px;border:0;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer}@media print{.noprint{display:none}}
</style></head><body><div class="noprint"><button onclick="window.print()">Imprimir</button></div>${foot}${head}
<h1>RELATÓRIO DE PROCEDIMENTOS REALIZADOS</h1><div class="sub">Emitido em ${today.toLocaleDateString("pt-BR")} às ${today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
<div class="box"><b>Paciente:</b> ${esc(patient.fullName)} — CPF ${esc(maskCpf(patient.cpf))}${patient.rg ? ` — RG ${esc(patient.rg)}` : ""}<br>${esc([patient.address, patient.city, patient.state].filter(Boolean).join(", ") || "")}</div>
<p>Procedimentos realizados: <b>${sorted.length}</b> · Confirmados pelo paciente: <b>${signed}</b></p>
${items || "<p>Nenhum procedimento registrado.</p>"}
</body></html>`);
  w.document.close();
  const imgs = Array.from(w.document.images);
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
  w.focus();
  return true;
}
