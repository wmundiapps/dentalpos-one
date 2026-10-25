// Fotos e documentos: confere o conteúdo real do arquivo, regrava a imagem (some GPS/EXIF e código escondido)
// e recusa PDF com conteúdo ativo.
import sharp from 'sharp';
import { HttpError } from './http.js';

export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (buf.length < 12) return undefined;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return undefined;
}
export const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

const ACTIVE = /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData|Encrypt)\b/;
export function pdfIsSafe(b: Buffer): boolean {
  const text = b.toString('latin1').replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return !ACTIVE.test(text);
}

/** Foto de anúncio: gira conforme EXIF, limita a 1600 px, grava WebP sem metadados. Mínimo 200 px. */
export async function processPhoto(buf: Buffer): Promise<{ data: Buffer; mime: string }> {
  if (!sniffImage(buf)) throw new HttpError(422, 'invalid_image');
  try {
    const img = sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw new HttpError(422, 'image_too_small');
    const data = await img.resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return { data, mime: 'image/webp' };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, 'invalid_image');
  }
}

/** Documento de verificação: imagem regravada (até 2400 px) ou PDF sem conteúdo ativo. */
export async function processDocument(buf: Buffer): Promise<{ data: Buffer; mime: string }> {
  if (isPdf(buf)) {
    if (!pdfIsSafe(buf)) throw new HttpError(422, 'unsafe_pdf');
    return { data: buf, mime: 'application/pdf' };
  }
  if (!sniffImage(buf)) throw new HttpError(422, 'invalid_document_type');
  try {
    const data = await sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate()
      .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return { data, mime: 'image/jpeg' };
  } catch { throw new HttpError(422, 'invalid_image'); }
}
