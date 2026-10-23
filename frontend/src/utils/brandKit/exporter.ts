// Transforma os modelos do kit em PNG, PDF e ZIP no próprio navegador.
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { zipSync } from "fflate";

export interface ExportItem { id: string; file: string; width: number; doc?: boolean }

// Copia o elemento para uma área fora da tela, sem a escala da prévia, e fotografa.
export async function capture(id: string, scale: number): Promise<HTMLCanvasElement> {
  const el = document.getElementById(id);
  const stage = document.getElementById("bkit-stage");
  if (!el || !stage) throw new Error("Prévia não encontrada.");
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.transform = "none";
  clone.style.position = "static";
  clone.style.boxShadow = "none";
  stage.appendChild(clone);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(clone.querySelectorAll("img")).map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))));
    return await html2canvas(clone, { scale, backgroundColor: null, useCORS: true, logging: false });
  } finally {
    stage.removeChild(clone);
  }
}

const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar imagem."))), "image/png"));

function pdfFromCanvas(it: ExportItem, cv: HTMLCanvasElement): Blob {
  if (it.doc) {
    // A4: fatia a imagem em páginas de 794 × 1123 px (proporção do A4).
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pagePx = Math.round((cv.width * 1123) / 794);
    for (let y = 0, page = 0; y < cv.height; y += pagePx, page++) {
      const h = Math.min(pagePx, cv.height - y);
      if (page > 0 && h < pagePx * 0.04) break;
      const pc = document.createElement("canvas"); pc.width = cv.width; pc.height = pagePx;
      const ctx = pc.getContext("2d"); if (!ctx) break;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pc.width, pc.height);
      ctx.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(pc.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    }
    return pdf.output("blob");
  }
  // Cartões: 100 px da prévia = 25,4 mm (350 px = cartão de 88,9 mm).
  const w = it.width * 0.254; const h = (w * cv.height) / cv.width;
  const pdf = new jsPDF({ unit: "mm", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
  pdf.addImage(cv.toDataURL("image/png"), "PNG", 0, 0, w, h);
  return pdf.output("blob");
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportItem(it: ExportItem, kind: "png" | "pdf") {
  const cv = await capture(it.id, it.doc ? 2 : 4);
  if (kind === "png") return saveBlob(`${it.file}.png`, await toBlob(cv));
  return saveBlob(`${it.file}.pdf`, pdfFromCanvas(it, cv));
}

export async function exportAll(items: ExportItem[], kind: "png" | "pdf", zipName: string) {
  const files: Record<string, Uint8Array> = {};
  for (const it of items) {
    const cv = await capture(it.id, it.doc ? 2 : 4);
    const blob = kind === "png" ? await toBlob(cv) : pdfFromCanvas(it, cv);
    files[`${it.file}.${kind}`] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 });
  saveBlob(`${zipName}.zip`, new Blob([zipped as BlobPart], { type: "application/zip" }));
}

export function saveText(name: string, text: string) {
  saveBlob(name, new Blob([text], { type: "text/plain;charset=utf-8" }));
}
