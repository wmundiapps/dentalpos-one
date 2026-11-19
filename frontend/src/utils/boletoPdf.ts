import { issueBudgetBoletos } from "../services/BudgetApi";

// Emite todos os boletos em aberto do orçamento e abre o PDF único. Devolve um texto de aviso (vazio se tudo certo).
export async function emitBudgetBoletos(budgetId: string, win?: Window | null): Promise<string> {
  const out = await issueBudgetBoletos(budgetId);
  const failed = out.boletos.filter((b) => b.error);
  if (out.pdfBase64) {
    const bin = atob(out.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (win && !win.closed) win.location.href = url; else if (!window.open(url, "_blank")) { const a = document.createElement("a"); a.href = url; a.download = `boletos-${out.patientName}.pdf`; a.click(); }
  } else win?.close();
  if (failed.length) return `${failed.length} parcela(s) com problema: ${failed.slice(0, 3).map((f) => `parcela ${f.installment} (${f.error})`).join("; ")}`;
  return "";
}
