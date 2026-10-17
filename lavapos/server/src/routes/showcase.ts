// Vitrine "antes e depois": só publica com autorização do cliente registrada no check-in e confirmação de que a placa não aparece.
import { Router } from 'express';
import { z } from 'zod';
import { pool, one, withTx } from '../db.js';
import { tenantOf, type AuthedRequest } from '../auth.js';
import { HttpError, audit, clientIp } from '../security.js';
import { getRec, insertRec, listRecs, patchRec } from '../repo.js';
import { text, uuid } from '../validators.js';

export const showcaseRouter = Router();

showcaseRouter.get('/', async (req: AuthedRequest, res) => res.json(await listRecs(pool, tenantOf(req), 'showcase', { limit: 200 })));

showcaseRouter.post('/', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const b = z.object({
    orderId: uuid, beforePhotoId: uuid, afterPhotoId: uuid, title: text(80).pipe(z.string().min(2)), serviceName: text(80).default(''),
    plateHidden: z.literal(true, { errorMap: () => ({ message: 'confirme que a placa não aparece nas fotos' }) }),
  }).parse(req.body);
  const o = await getRec(pool, tenantId, 'order', b.orderId);
  if (!o) throw new HttpError(404, 'Ordem não encontrada.', 'nao_encontrado');
  if (!o.data.checkin?.photoConsent) throw new HttpError(409, 'O cliente não autorizou a divulgação das fotos no check-in.', 'sem_consentimento');
  const rec = await withTx(async (tx) => {
    const n = await tx.query('UPDATE photos SET is_public = true, phase = $4 WHERE tenant_id = $1 AND order_id = $2 AND id = ANY($3::uuid[])', [tenantId, b.orderId, [b.beforePhotoId, b.afterPhotoId], 'vitrine']);
    if (n.rowCount !== 2) throw new HttpError(400, 'Fotos inválidas para esta ordem.', 'invalido');
    return insertRec(tx, tenantId, 'showcase', { orderId: b.orderId, beforePhotoId: b.beforePhotoId, afterPhotoId: b.afterPhotoId, title: b.title, serviceName: b.serviceName, vehicle: o.data.vehicleLabel.split(' ').slice(0, 2).join(' '), published: true });
  });
  await audit(pool, 'vitrine_publicada', { tenantId, userId: req.user!.id, ip: clientIp(req) }, { showcaseId: rec.id });
  res.status(201).json(rec);
});

/** Despublicar: a foto deixa de ser pública imediatamente (o registro fica). */
showcaseRouter.post('/:id/unpublish', async (req: AuthedRequest, res) => {
  const tenantId = tenantOf(req);
  const s = await getRec(pool, tenantId, 'showcase', req.params.id as string);
  if (!s) throw new HttpError(404, 'Item não encontrado.', 'nao_encontrado');
  await pool.query('UPDATE photos SET is_public = false WHERE tenant_id = $1 AND id = ANY($2::uuid[])', [tenantId, [s.data.beforePhotoId, s.data.afterPhotoId]]);
  res.json(await patchRec(pool, tenantId, 'showcase', s.id, { published: false }));
});
