import { findBoletoInText, findLabeledAmount, findMoneyInText, findPayee, parseBoleto, type BoletoInfo } from "./boleto";

export interface BoletoRead { info: BoletoInfo | null; payee: string; textAmounts: number[]; labeledAmount: number | null }

type Detector = { detect: (img: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
const detector = (): Detector | null => {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  try { return BD ? new BD({ formats: ["itf", "code_128"] }) : null; } catch { return null; }
};

async function fromCanvas(canvas: HTMLCanvasElement): Promise<BoletoInfo | null> {
  const det = detector();
  if (!det) return null;
  try { for (const b of await det.detect(canvas)) { const p = parseBoleto(b.rawValue); if (p) return p; } } catch { /* sem leitura */ }
  return null;
}

// Lê PDF (texto e, se preciso, o código de barras desenhado) ou foto do boleto.
export async function readBoletoFile(file: File): Promise<BoletoRead> {
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = "";
    let info: BoletoInfo | null = null;
    for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
      const page = await pdf.getPage(n);
      text += " " + (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
      if (!info) info = findBoletoInText(text);
    }
    if (!info?.valid) {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D, viewport }).promise;
      info = (await fromCanvas(canvas)) || info;
    }
    return { info, payee: findPayee(text), textAmounts: findMoneyInText(text), labeledAmount: findLabeledAmount(text) };
  }
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error("Imagem inválida.")); });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  return { info: await fromCanvas(canvas), payee: "", textAmounts: [], labeledAmount: null };
}
