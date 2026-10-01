// Baixar listas e relatórios: planilha (CSV com acentos corretos no Excel) e PDF.

export interface ExportTable {
  title: string;
  fileBase: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const stamp = () => new Date().toISOString().slice(0, 10);

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadCsv(table: ExportTable) {
  // ";" e BOM para o Excel brasileiro abrir direto, com acentos. Protege contra fórmulas (=, +, -, @) em células.
  const safe = (v: unknown) => {
    const t = cell(v);
    return /^[=+\-@]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t) ? `'${t}` : t;
  };
  const line = (r: unknown[]) => r.map((v) => `"${safe(v).replaceAll('"', '""')}"`).join(";");
  const csv = [table.headers, ...table.rows].map(line).join("\r\n");
  save(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${table.fileBase}-${stamp()}.csv`);
}

function clinicName() {
  try {
    const user = JSON.parse(localStorage.getItem("dentalpos.user") || "null") as { clinic?: { name?: string; displayName?: string | null } } | null;
    const identity = JSON.parse(localStorage.getItem("dentalpos.clinic.identity.v1") || "null") as { name?: string } | null;
    return user?.clinic?.displayName || user?.clinic?.name || identity?.name || "DentalPos One";
  } catch {
    return "DentalPos One";
  }
}

export async function downloadTablePdf(table: ExportTable) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const landscape = table.headers.length > 5;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: landscape ? "landscape" : "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(clinicName(), margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(table.title, margin, 56);
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}  |  ${table.rows.length} registro(s)`, margin, 70);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 82,
    head: [table.headers],
    body: table.rows.map((r) => r.map(cell)),
    theme: "striped",
    headStyles: { fillColor: [21, 101, 192], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak" },
    margin: { left: margin, right: margin, bottom: 36 },
    didDrawPage: () => {
      const n = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${n}`, pageW - margin, doc.internal.pageSize.getHeight() - 18, { align: "right" });
      doc.setTextColor(0);
    },
  });
  save(doc.output("blob"), `${table.fileBase}-${stamp()}.pdf`);
}

// Lê um CSV (";" ou ",", com aspas) em cabeçalho + linhas, para converter relatórios do servidor em PDF.
export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split("\n")[0] || "";
  const delimiter = first.split(";").length >= first.split(",").length ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(value); value = ""; }
    else if (ch === "\n") { row.push(value); out.push(row); row = []; value = ""; }
    else if (ch !== "\r") value += ch;
  }
  if (value || row.length) { row.push(value); out.push(row); }
  const rows = out.filter((r) => r.some((c) => c !== ""));
  return { headers: rows[0] || [], rows: rows.slice(1) };
}
