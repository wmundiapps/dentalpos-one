// Envio de arquivos seguro (playbook ClubeFaz, item 5): confere o conteúdo real (assinatura do arquivo,
// não o tipo que o navegador diz), regrava toda foto (descarta código escondido e apaga o GPS e os demais
// metadados), limita a 2000 px e recusa PDF com JavaScript, anexo ou ação automática.
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { HttpError } from './auth.js';
import { sniffImage } from './storage.js';

export const MAX_SIDE = 2000;

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString('latin1') === '%PDF-';

// Marcadores de PDF ativo: JavaScript, ação ao abrir, ação automática, abrir programa, anexos, mídia e formulário XFA.
// Nomes em PDF podem vir com escape hexadecimal (/J#61vaScript), então o nome é decodificado antes de comparar.
const ACTIVE_PDF = new Set(['JavaScript', 'JS', 'OpenAction', 'AA', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'RichMedia', 'XFA', 'SubmitForm', 'ImportData', 'GoToE']);
function activeName(text: string): string | null {
  for (const m of text.matchAll(/\/([A-Za-z0-9#]{2,40})/g)) {
    const name = m[1].replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (ACTIVE_PDF.has(name)) return name;
  }
  return null;
}
export function pdfProblem(buf: Buffer): string | null {
  const text = buf.toString('latin1');
  if (/\/Encrypt\b/.test(text)) return 'Encrypt'; // cifrado: não dá para conferir o conteúdo
  const found = activeName(text);
  if (found) return found;
  // Marcadores escondidos em objetos comprimidos (ObjStm): abre cada trecho comprimido e confere de novo
  for (const m of text.matchAll(/(?<!end)stream\r?\n/g)) {
    if (!/\/ObjStm\b/.test(text.slice(Math.max(0, m.index! - 400), m.index!))) continue; // só objetos, não imagens
    const start = m.index! + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    try {
      const inner = inflateSync(buf.subarray(start, end), { maxOutputLength: 20 * 1024 * 1024 }).toString('latin1');
      const hidden = activeName(inner);
      if (hidden) return hidden;
    } catch { /* trecho não comprimido (ex.: imagem) */ }
  }
  return null;
}

/**
 * Regrava a imagem: gira conforme o EXIF, reduz para no máximo 2000 px e salva sem metadados (GPS, câmera, data).
 * Formatos de iPhone (HEIC/AVIF) que o servidor não consegue abrir ficam como vieram (o app já converte para JPEG).
 */
export async function reencodeImage(buf: Buffer): Promise<{ data: Buffer; mime: string }> {
  const mime = sniffImage(buf);
  if (!mime) throw new HttpError(422, 'invalid_image');
  try {
    const img = sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true });
    if (mime === 'image/png') return { data: await img.png({ compressionLevel: 9 }).toBuffer(), mime };
    if (mime === 'image/webp') return { data: await img.webp({ quality: 85 }).toBuffer(), mime };
    return { data: await img.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
  } catch {
    if (mime === 'image/heic' || mime === 'image/heif' || mime === 'image/avif') return { data: buf, mime };
    throw new HttpError(422, 'invalid_image');
  }
}

/** Documento (registro profissional, identidade): imagem regravada ou PDF sem conteúdo ativo. */
export async function safeDocument(buf: Buffer, opts: { allowPdf: boolean }): Promise<{ data: Buffer; mime: string }> {
  if (isPdf(buf)) {
    if (!opts.allowPdf) throw new HttpError(422, 'invalid_document_type');
    if (pdfProblem(buf)) throw new HttpError(422, 'unsafe_pdf');
    return { data: buf, mime: 'application/pdf' };
  }
  const img = await reencodeImage(buf);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(img.mime)) throw new HttpError(422, 'invalid_document_type');
  return img;
}
