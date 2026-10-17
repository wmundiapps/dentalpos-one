// Fotos de check-in/check-out e vitrine. Defesas: só imagem real (decodificada pelo sharp), regravada em JPEG sem metadados (GPS/EXIF/código embutido),
// tamanho e dimensão limitados, servida com nosniff + CSP sandbox. Nenhum outro tipo de arquivo é aceito no sistema.
import express, { Router } from 'express';
import sharp from 'sharp';
import { pool, one, rows } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError, rateLimit } from '../security.js';
import { getRec } from '../repo.js';

export const photosRouter = Router();
const ANGLES = ['frente', 'traseira', 'lateral-esq', 'lateral-dir', 'teto', 'interior', 'painel', 'dano', 'geral'];
const MAX_PHOTOS_PER_ORDER = 40;

/** Regrava a imagem: descarta metadados e qualquer carga escondida; falha se não for imagem de verdade. */
export async function sanitizeImage(input: Buffer): Promise<Buffer> {
  try {
    const img = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' });
    const meta = await img.metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'heic', 'heif'].includes(meta.format)) throw new Error('formato');
    return await img.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch {
    throw new HttpError(400, 'Arquivo não é uma imagem válida (use JPG, PNG ou WebP).', 'imagem_invalida');
  }
}

export function sendImage(res: import('express').Response, data: Buffer, mime: string, isPublic: boolean) {
  res.set({ 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline', 'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, no-store', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(data);
}

photosRouter.post('/', rateLimit('upload', 120, 600), express.raw({ type: ['image/*', 'application/octet-stream'], limit: '8mb' }), async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const phase = String(req.query.phase ?? '');
  const angle = ANGLES.includes(String(req.query.angle)) ? String(req.query.angle) : 'geral';
  const orderId = req.query.orderId ? String(req.query.orderId) : null;
  if (!['checkin', 'checkout', 'vitrine'].includes(phase)) throw new HttpError(400, 'Fase da foto inválida.', 'invalido');
  if (!Buffer.isBuffer(req.body) || req.body.length < 100) throw new HttpError(400, 'Envie a imagem.', 'invalido');
  if (orderId) {
    if (!(await getRec(pool, tenantId, 'order', orderId))) throw new HttpError(404, 'Ordem não encontrada.', 'nao_encontrado');
    const n = await one<{ n: number }>(pool, 'SELECT count(*)::int AS n FROM photos WHERE tenant_id = $1 AND order_id = $2', [tenantId, orderId]);
    if ((n?.n ?? 0) >= MAX_PHOTOS_PER_ORDER) throw new HttpError(400, 'Limite de fotos desta ordem atingido.', 'limite');
  }
  const clean = await sanitizeImage(req.body);
  const r = await one<{ id: string }>(pool, 'INSERT INTO photos (tenant_id, order_id, phase, angle, bytes, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [tenantId, orderId, phase, angle, clean.length, clean]);
  res.status(201).json({ id: r!.id, phase, angle, orderId });
});

photosRouter.get('/order/:orderId', async (req: AuthedRequest, res) => {
  res.json((await rows(pool, 'SELECT id, phase, angle, is_public AS "isPublic", created_at AS "createdAt" FROM photos WHERE tenant_id = $1 AND order_id = $2 ORDER BY created_at', [tenantOf(req), req.params.orderId])));
});

photosRouter.get('/:id/file', async (req: AuthedRequest, res) => {
  const p = await one(pool, 'SELECT data, mime, is_public FROM photos WHERE tenant_id = $1 AND id = $2', [tenantOf(req), req.params.id]).catch(() => undefined);
  if (!p) throw new HttpError(404, 'Foto não encontrada.', 'nao_encontrado');
  sendImage(res, p.data, p.mime, false);
});
