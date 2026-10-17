// Retorno do Asaas: confirma pagamentos (Pix/cartão/boleto). Autenticado por token secreto (comparação em tempo constante).
import { Router } from 'express';
import { z } from 'zod';
import { pool, one } from '../db.js';
import { safeEqual } from '../secure.js';
import { HttpError } from '../security.js';

export const webhooksRouter = Router();

webhooksRouter.post('/asaas', async (req, res) => {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const got = String(req.headers['asaas-access-token'] ?? '');
  if (!expected || !got || !safeEqual(got, expected)) throw new HttpError(401, 'Não autorizado.', 'sem_permissao');
  const ev = z.object({ event: z.string(), payment: z.object({ id: z.string(), externalReference: z.string().nullable().optional() }).optional() }).parse(req.body);
  const id = ev.payment?.id;
  if (!id) return void res.json({ ok: true });
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(ev.event)) {
    await pool.query(`UPDATE records SET data = data || jsonb_build_object('status','pago','paidAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"')), updated_at = now() WHERE kind = 'payment' AND data->>'asaasId' = $1 AND data->>'status' <> 'pago'`, [id]);
    // Mensalidade do próprio sistema (cobrada na conta da plataforma)
    const ref = ev.payment?.externalReference ?? '';
    if (ref.startsWith('tenant:')) await pool.query("UPDATE tenants SET billing_status = 'ativa' WHERE id = $1", [ref.slice(7)]).catch(() => {});
  } else if (['PAYMENT_OVERDUE'].includes(ev.event)) {
    const ref = ev.payment?.externalReference ?? '';
    if (ref.startsWith('tenant:')) await pool.query("UPDATE tenants SET billing_status = 'inadimplente' WHERE id = $1", [ref.slice(7)]).catch(() => {});
    const p = await one(pool, "SELECT tenant_id, data FROM records WHERE kind='payment' AND data->>'asaasId' = $1", [id]);
    if (p?.data.subscriptionId) await pool.query("UPDATE records SET data = data || '{\"status\":\"inadimplente\"}'::jsonb WHERE id = $1 AND kind = 'subscription'", [p.data.subscriptionId]);
  } else if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(ev.event)) {
    await pool.query(`UPDATE records SET data = data || '{"status":"estornado"}'::jsonb, updated_at = now() WHERE kind = 'payment' AND data->>'asaasId' = $1`, [id]);
  }
  res.json({ ok: true });
});
