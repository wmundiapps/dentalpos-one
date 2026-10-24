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

// Assinatura desenhada na tela (PNG). Recriada no servidor; recusa em branco ou só um risco.
export async function sanitizeSignature(dataUrl, who) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, `Falta a assinatura do ${who}.`);
  const raw = Buffer.from(m[1], 'base64');
  if (raw.length > 400_000) throw new HttpError(413, `A assinatura do ${who} ficou grande demais. Limpe e assine de novo.`);
  try {
    const img = sharp(raw, { failOn: 'error', limitInputPixels: 4_000_000 }).flatten({ background: '#ffffff' })
      .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true });
    const out = await img.clone().png({ compressionLevel: 9 }).toBuffer();
    const st = await img.clone().greyscale().stats();
    if (st.channels[0].mean > 254.5) throw new HttpError(400, `A assinatura do ${who} está em branco ou muito curta. Assine de novo.`);
    return out;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, `Não conseguimos ler a assinatura do ${who}. Limpe e assine de novo.`);
  }
}
