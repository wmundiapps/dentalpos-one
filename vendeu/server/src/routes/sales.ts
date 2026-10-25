// Taxa de retirada (anúncio publicado retirado sem venda) e webhooks de pagamento.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { limit } from '../ratelimit.js';
import { fetchAdvancedPayment, fetchPayment, verifyMpSignature } from '../payments.js';
import { getSale, markPaid, removeWithFee, saleView, sellerSales, startPayment } from '../sales.js';
import { markOrderPaid } from '../orders.js';

export const closeRouter = Router();
// "Retirar anúncio": grátis se nunca foi ao ar; taxa fixa se estava publicado. Venda só acontece pela plataforma (pedidos).
closeRouter.post('/:id/close', requireAuth, limit('close', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const b = parse(z.object({ sold: z.boolean().default(false), reason: z.enum(['desisti', 'erro_no_anuncio', 'vendi_fora', 'outro']).optional() }), req.body);
  if (b.sold) throw new HttpError(410, 'sale_only_through_platform');
  const r = await removeWithFee(req.user!.id, String(req.params.id), b.reason ?? 'outro');
  res.json({ status: 'removed', feeCents: r.feeCents, saleId: r.saleId });
}));

export const salesRouter = Router();
salesRouter.get('/', requireAuth, wrap(async (req, res) => {
  const sales = await sellerSales(req.user!.id);
  res.json({ items: sales, dueCents: sales.filter((s) => s.status === 'awaiting_payment').reduce((a, s) => a + s.feeCents, 0) });
}));
salesRouter.get('/:id', requireAuth, wrap(async (req, res) => {
  const s = await getSale(pool, String(req.params.id), req.user!.id);
  if (!s) throw new HttpError(404, 'not_found');
  res.json(saleView(s));
}));
salesRouter.post('/:id/pay', requireAuth, limit('pay', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const { method } = parse(z.object({ method: z.enum(['pix', 'cartao']) }), req.body);
  res.json(await startPayment(req.user!.id, String(req.params.id), method));
}));
// Só desenvolvimento/teste: confirma o pagamento simulado.
salesRouter.post('/:id/simulate-payment', requireAuth, wrap(async (req, res) => {
  if (config.payments.provider !== 'mock' || config.isProd) throw new HttpError(404, 'not_found');
  const s = await getSale(pool, String(req.params.id), req.user!.id);
  if (!s) throw new HttpError(404, 'not_found');
  await markPaid(s.id, s.fee_cents, { simulated: true });
  res.json(saleView(await getSale(pool, s.id)));
}));

// ---- webhook do Mercado Pago ----
export const webhookRouter = Router();
webhookRouter.post('/mercadopago', wrap(async (req, res) => {
  const dataId = String((req.query['data.id'] ?? req.body?.data?.id ?? '') as string);
  const type = String(req.query.type ?? req.query.topic ?? req.body?.type ?? '');
  if (!dataId || (type && !['payment', 'advanced_payment'].includes(type))) return void res.json({ ok: true });
  if (!verifyMpSignature(req.headers, dataId)) throw new HttpError(401, 'bad_signature');
  // a fonte da verdade é o provedor, nunca o corpo recebido
  if (type === 'advanced_payment') {
    const p = await fetchAdvancedPayment(dataId);
    if (p.status === 'approved' && p.orderId) await markOrderPaid(p.orderId, p.amountCents);
  } else {
    const p = await fetchPayment(dataId);
    if (p.status === 'approved' && p.saleId) await markPaid(p.saleId, p.amountCents, { paymentId: dataId });
  }
  res.json({ ok: true });
}));
