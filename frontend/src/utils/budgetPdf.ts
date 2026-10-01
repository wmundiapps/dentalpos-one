import type { BackendPatient } from "../services/PatientApi";
import type { TreatmentPlanItem } from "../services/TreatmentPlanApi";
import type { BudgetRow } from "../services/BudgetApi";
import { money } from "./money";

export interface BudgetPdfInput {
  budget: BudgetRow & { entryAmount?: number; paymentMethod?: string; discountPercent?: number; validUntil?: string };
  patient?: BackendPatient;
  items: TreatmentPlanItem[];
  clinicName: string;
  professionalName: string;
}

type Planning = Record<string, unknown>;
const txt = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

const safeName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "paciente";

// Gera o PDF do orçamento no navegador (sem enviar dados do paciente para fora).
export async function buildBudgetPdf(input: BudgetPdfInput): Promise<{ blob: Blob; fileName: string }> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const { budget: b, patient, items, clinicName, professionalName } = input;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const brand: [number, number, number] = [21, 101, 192];

  // Cabeçalho
  doc.setFillColor(...brand);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(clinicName || "Clínica odontológica", margin, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Orçamento de tratamento odontológico", margin, 54);
  doc.setFontSize(9);
  doc.text(`Nº ${b.id.slice(-6).toUpperCase()}`, pageW - margin, 36, { align: "right" });
  doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, pageW - margin, 52, { align: "right" });

  // Paciente
  doc.setTextColor(30, 41, 59);
  let y = 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Paciente", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 16;
  doc.text(patient?.fullName || b.patient?.fullName || "Paciente", margin, y);
  const contact = [patient?.cpf ? `CPF ${patient.cpf}` : "", patient?.phone ? `Tel. ${patient.phone}` : ""].filter(Boolean).join("   ");
  if (contact) { y += 14; doc.setTextColor(100, 116, 139); doc.text(contact, margin, y); doc.setTextColor(30, 41, 59); }

  // Procedimentos
  const rows = items.map((i) => {
    const pd = (i.planningData || {}) as Planning;
    const where = [i.tooth ? `Dente ${i.tooth}` : "", txt(pd.region)].filter(Boolean).join(" - ");
    return [i.procedure, where, money(Number(pd.unitValue || 0))];
  });
  const gross = items.reduce((s, i) => s + Number(((i.planningData || {}) as Planning).unitValue || 0), 0);
  autoTable(doc, {
    startY: y + 22,
    head: [["Procedimento", "Dente / região", "Valor"]],
    body: rows.length ? rows : [[b.description, "", money(b.totalAmount)]],
    theme: "striped",
    headStyles: { fillColor: brand, textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 2: { halign: "right", cellWidth: 90 } },
    margin: { left: margin, right: margin },
    didParseCell: (data) => { if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "right"; },
  });

  // Condições de pagamento
  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 60;
  const discount = Number(b.discountPercent || 0);
  const entry = Number(b.entryAmount || 0);
  const summary: Array<[string, string]> = [];
  if (rows.length && gross > 0 && Math.abs(gross - b.totalAmount) > 0.009) summary.push(["Subtotal", money(gross)]);
  if (discount > 0) summary.push([`Desconto (${discount.toLocaleString("pt-BR")}%)`, `- ${money(Math.max(0, gross - b.totalAmount))}`]);
  summary.push(["Total do orçamento", money(b.totalAmount)]);
  if (entry > 0) summary.push(["Entrada", money(entry)]);
  summary.push([entry > 0 ? "Saldo" : "Pagamento", `${b.installments}x de ${money(b.installmentValue)}${b.paymentMethod ? ` - ${b.paymentMethod}` : ""}`]);

  autoTable(doc, {
    startY: lastY + 16,
    body: summary,
    theme: "plain",
    styles: { fontSize: 10.5, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
    tableWidth: 300,
    margin: { left: pageW - margin - 300, right: margin },
    didParseCell: (data) => {
      if (data.row.index === summary.findIndex((s) => s[0] === "Total do orçamento")) {
        data.cell.styles.fontSize = 13;
        data.cell.styles.textColor = brand;
      }
    },
  });

  // Rodapé: validade, observações e assinatura
  let fy = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? lastY + 80) + 28;
  if (fy > pageH - 150) { doc.addPage(); fy = 60; }
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const notes = [
    b.validUntil ? `Orçamento válido até ${date(b.validUntil)}.` : "",
    "Os valores e prazos podem ser revistos caso o plano de tratamento seja alterado após a avaliação clínica.",
    "A aprovação deste orçamento não substitui o contrato de prestação de serviços odontológicos.",
  ].filter(Boolean);
  doc.text(doc.splitTextToSize(notes.join("\n"), pageW - margin * 2), margin, fy);
  fy += notes.length * 14 + 50;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, fy, margin + 220, fy);
  doc.line(pageW - margin - 220, fy, pageW - margin, fy);
  doc.setTextColor(30, 41, 59);
  doc.text(professionalName || "Profissional responsável", margin, fy + 14);
  doc.text("De acordo (paciente)", pageW - margin - 220, fy + 14);

  const fileName = `orcamento-${safeName(patient?.fullName || b.patient?.fullName || "paciente")}-${b.id.slice(-6)}.pdf`;
  return { blob: doc.output("blob"), fileName };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Celular: abre a folha de compartilhamento (WhatsApp etc.) com o arquivo. Computador: baixa o PDF.
export async function sharePdf(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return "shared";
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}

export function printPdf(blob: Blob, preOpened: Window | null) {
  const url = URL.createObjectURL(blob);
  if (preOpened) {
    preOpened.location.href = url;
    // O visualizador de PDF do navegador já oferece o botão de imprimir; tenta abrir direto.
    preOpened.addEventListener("load", () => { try { preOpened.print(); } catch { /* usa o botão do visualizador */ } });
  } else {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}
