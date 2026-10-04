// Recria toda imagem enviada: decodifica e grava um JPEG novo, sem metadados (EXIF, GPS) nem dados escondidos.
// Assim um arquivo "disfarçado" de foto não chega intacto a quem abrir.
import sharp from 'sharp';
import { HttpError } from './http.js';

export async function sanitizeImage(buf) {
  try {
    const out = await sharp(buf, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate() // aplica a orientação do celular antes de descartar o EXIF
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return { buf: out, mime: 'image/jpeg' };
  } catch {
    throw new HttpError(415, 'Não conseguimos ler esta imagem. Tire a foto de novo ou envie em JPG.');
  }
}
