import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { issuerEntityLabels, type FinancialEntry } from "../services/FinancialApi";
import { loadBrandKit } from "../services/BrandKitApi";
import { KIT_CSS, footer, letterhead } from "../utils/brandKit/templates";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ymd = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dmy = (iso: string) => ymd(iso).split("-").reverse().join("/");
const UNCLASSIFIED = "Sem classificação (preencha “Pertence a”)";

type GroupBy = "costCenter" | "category" | "issuer" | "payee";
const GROUP_LABEL: Record<GroupBy, string> = { costCenter: "Pertence a (Clínica, Pessoal, Uningá…)", category: "Categoria", issuer: "Razão social", payee: "Fornecedor" };

// Relatório de contas a pagar separado por grupo (ex.: Pessoal, Clínica, Uningá), com subtotal de cada um e total geral.
export default function PayablesReportDialog({ open, entries, onClose }: { open: boolean; entries: FinancialEntry[]; onClose: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"ALL" | "OPEN" | "PAID">("ALL");
  const [groupBy, setGroupBy] = useState<GroupBy>("costCenter");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const pool = entries.filter((e) => e.type === "EXPENSE" && e.status !== "CANCELLED");
  const picked = pool.filter((e) => {
    const d = ymd(e.dueDate);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (status === "OPEN" && e.status === "PAID") return false;
    if (status === "PAID" && e.status !== "PAID") return false;
    return true;
  });
  const keyOf = (e: FinancialEntry) => {
    const raw = groupBy === "costCenter" ? e.costCenter : groupBy === "category" ? e.category : groupBy === "issuer" ? (e.issuerEntity ? issuerEntityLabels[e.issuerEntity] : "") : e.personName;
    const v = String(raw || "").trim();
    return v ? v.charAt(0).toUpperCase() + v.slice(1) : UNCLASSIFIED;
  };
  const unclassified = groupBy === "costCenter" ? picked.filter((e) => !String(e.costCenter || "").trim()).length : 0;

  const generate = async () => {
    setBusy(true); setMsg("");
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { setMsg("O navegador bloqueou a janela. Permita pop-ups para este site."); setBusy(false); return; }
    w.document.write('<p style="font-family:Arial;padding:40px">Preparando relatório…</p>');
    let head = "", foot = "";
    try {
      const r = await loadBrandKit(); const c = r.clinic; const k = r.kit || {};
      const kc = { name: c.displayName || c.name, tagline: k.tagline || "", logo: c.logo || "", color: c.primaryColor || "#1565C0", rtName: k.rtName || "", rtCro: k.rtCro || "", cnpj: c.cnpj || "", phone: c.phone || "", whatsapp: k.whatsapp || "", email: c.email || "", address: c.address || "", city: [c.city, c.state].filter(Boolean).join(" – "), site: k.site || "", instagram: k.instagram || "", logoMm: Math.min(k.logoWidthMm || 35, 30) };
      head = `<div class="bkit"><div style="--b:${esc(kc.color)}">${letterhead(kc)}</div></div>`;
      foot = `<div class="bkit rodape"><div style="--b:${esc(kc.color)}">${footer(kc)}</div></div>`;
    } catch { /* sem identidade */ }
    const groups = new Map<string, FinancialEntry[]>();
    for (const e of [...picked].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) groups.set(keyOf(e), [...(groups.get(keyOf(e)) || []), e]);
    const ordered = [...groups.entries()].sort((a, b) => (a[0] === UNCLASSIFIED ? 1 : b[0] === UNCLASSIFIED ? -1 : a[0].localeCompare(b[0])));
    const total = picked.reduce((s, e) => s + e.amount, 0);
    const paid = picked.filter((e) => e.status === "PAID").reduce((s, e) => s + e.amount, 0);
    const label = (e: FinancialEntry) => (e.status === "PAID" ? "Pago" : ymd(e.dueDate) < ymd(new Date().toISOString()) ? "Vencido" : "A pagar");
    const sections = ordered.map(([name, list]) => {
      const sub = list.reduce((s, e) => s + e.amount, 0);
      return `<h3>${esc(name)} <span>${list.length} lançamento${list.length > 1 ? "s" : ""}</span></h3><table><thead><tr><th>Vencimento</th><th>Fornecedor / pessoa</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th class="n">Valor</th></tr></thead><tbody>${list.map((e) => `<tr><td>${dmy(e.dueDate)}</td><td>${esc(e.personName)}</td><td>${esc(e.description)}</td><td>${esc(e.category || "")}</td><td>${label(e)}</td><td class="n">${brl(e.amount)}</td></tr>`).join("")}<tr class="sub"><td colspan="5">Subtotal — ${esc(name)}</td><td class="n">${brl(sub)}</td></tr></tbody></table>`;
    }).join("");
    const resume = ordered.map(([name, list]) => `<tr><td>${esc(name)}</td><td class="n">${list.length}</td><td class="n">${brl(list.reduce((s, e) => s + e.amount, 0))}</td></tr>`).join("");
    const period = from || to ? `Vencimento de ${from ? from.split("-").reverse().join("/") : "o início"} a ${to ? to.split("-").reverse().join("/") : "hoje"}` : "Todos os vencimentos";
    w.document.open();
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contas a pagar</title><style>${KIT_CSS}
body{font-family:Arial,sans-serif;margin:36px;color:#111;font-size:11.5px;line-height:1.4;padding-bottom:34mm}.rodape{position:fixed;left:0;right:0;bottom:0;background:#fff;padding:6px 36px 10px}.rodape .df{margin-top:0}
h1{font-size:17px;text-align:center;margin:14px 0 2px}.sub-t{text-align:center;color:#555;margin-bottom:12px}h3{font-size:13px;margin:18px 0 4px;border-bottom:2px solid #333;padding-bottom:2px;display:flex;justify-content:space-between}h3 span{font-weight:400;color:#555;font-size:11px}
table{width:100%;border-collapse:collapse;margin-bottom:4px}th,td{border:1px solid #aaa;padding:3px 6px;text-align:left}th{background:#eee}td.n,th.n{text-align:right;white-space:nowrap}tr.sub td{font-weight:700;background:#f3f3f3;text-align:right}tr.sub td:first-child{text-align:right}
.tot{margin-top:18px;border:2px solid #111;padding:8px 12px;font-size:14px;display:flex;justify-content:space-between}.res{width:60%;margin:8px auto}
.noprint{position:fixed;top:10px;right:14px}.noprint button{font:600 14px Arial;padding:8px 16px;border:0;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer}@media print{.noprint{display:none}tr{page-break-inside:avoid}h3{page-break-after:avoid}}
</style></head><body><div class="noprint"><button onclick="window.print()">Imprimir</button></div>${foot}${head}
<h1>RELATÓRIO DE CONTAS A PAGAR</h1><div class="sub-t">${esc(period)} · ${status === "OPEN" ? "somente em aberto" : status === "PAID" ? "somente pagas" : "pagas e em aberto"} · agrupado por ${esc(GROUP_LABEL[groupBy])}<br>Emitido em ${new Date().toLocaleDateString("pt-BR")}</div>
${picked.length ? `<h3>Resumo por grupo</h3><table class="res"><thead><tr><th>Grupo</th><th class="n">Lançamentos</th><th class="n">Total</th></tr></thead><tbody>${resume}</tbody></table>` : ""}
${sections || "<p>Nenhuma despesa no período escolhido.</p>"}
<div class="tot"><span><b>TOTAL GERAL</b> · ${picked.length} lançamento${picked.length === 1 ? "" : "s"}${paid ? ` · já pago: ${brl(paid)} · em aberto: ${brl(total - paid)}` : ""}</span><b>${brl(total)}</b></div>
</body></html>`);
    w.document.close();
    const imgs = Array.from(w.document.images);
    await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
    w.focus(); setBusy(false); onClose();
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 900 }}>Relatório de contas a pagar</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
        <Typography variant="body2" color="text.secondary">Sai uma folha separada por grupo, com o subtotal de cada um e o total geral no fim.</Typography>
        <TextField select label="Separar por" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => <MenuItem key={g} value={g}>{GROUP_LABEL[g]}</MenuItem>)}
        </TextField>
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField type="date" label="Vencimento de" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          <TextField type="date" label="até" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        </Box>
        <TextField select label="Situação" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <MenuItem value="ALL">Pagas e em aberto</MenuItem><MenuItem value="OPEN">Somente em aberto</MenuItem><MenuItem value="PAID">Somente pagas</MenuItem>
        </TextField>
        <Typography variant="body2"><b>{picked.length}</b> despesa(s) no filtro · total <b>{brl(picked.reduce((s, e) => s + e.amount, 0))}</b></Typography>
        {unclassified > 0 && <Alert severity="warning">{unclassified} despesa(s) ainda sem o campo <b>“Pertence a”</b>; elas saem juntas no grupo “Sem classificação”. Abra cada lançamento (Editar) e escolha Clínica, Pessoal ou Uningá.</Alert>}
        {msg && <Alert severity="error">{msg}</Alert>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Fechar</Button><Button variant="contained" disabled={busy || picked.length === 0} onClick={() => void generate()}>Gerar relatório</Button></DialogActions>
    </Dialog>
  );
}
