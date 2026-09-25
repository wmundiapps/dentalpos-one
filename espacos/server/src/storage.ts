// Armazenamento de fotos dos espaços. Com BLOB_READ_WRITE_TOKEN usa o Vercel
// Blob (CDN pública); sem ele grava no próprio banco e serve em /api/uploads/:id.
import { put } from '@vercel/blob';
import { id, nowIso, one, pool } from './db.js';
import { HttpError } from './auth.js';

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/heif': 'heif',
};
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Confere a assinatura do arquivo (não confia só no tipo declarado pelo navegador). */
function sniff(buf: Buffer): string | undefined {
  if (buf.length < 12) return undefined;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (brand.startsWith('avi')) return 'image/avif';
    if (['heic', 'heix', 'hevc', 'heim', 'heis'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  return undefined;
}

export async function saveImage(ownerId: string, data: Buffer): Promise<{ id: string; url: string; mime: string }> {
  if (data.length > IMAGE_MAX_BYTES) throw new HttpError(413, 'file_too_large');
  const mime = sniff(data);
  if (!mime) throw new HttpError(422, 'invalid_image');
  const fileId = id('img');
  let url: string;
  let stored: Buffer | null = data;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`listings/${ownerId}/${fileId}.${IMAGE_TYPES[mime]}`, data, {
      access: 'public', contentType: mime, token: process.env.BLOB_READ_WRITE_TOKEN, addRandomSuffix: false,
    });
    url = blob.url;
    stored = null;
  } else {
    url = `/api/uploads/${fileId}`;
  }
  await pool.query('INSERT INTO uploads (id, owner_id, mime, size, data, url, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [fileId, ownerId, mime, data.length, stored, url, nowIso()]);
  return { id: fileId, url, mime };
}

export async function readImage(fileId: string) {
  return one<{ mime: string; data: Buffer | null }>(pool, 'SELECT mime, data FROM uploads WHERE id = $1', [fileId]);
}
