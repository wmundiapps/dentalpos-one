import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { limit } from '../ratelimit.js';
import { addressSchema } from '../accounts.js';
import { recordOrigin } from '../origin.js';
import { cancelOrder, confirmReturn, createOrder, handoverOrder, markOrderPaid, openDispute, orderView, ordersOf, payOrder, receiveOrder, requestReturn, respondOrder, shipOrder } from '../orders.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

async function mine(req: any) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user!.id]);
  if (!o) throw new HttpError(404, 'not_found');
  return o;
}
const idOf = (req: any) => String(req.params.id);

ordersRouter.get('/', wrap(async (req, res) => { res.json({ items: await ordersOf(req.user!.id), returnDays: config.escrow.returnDays }); }));
ordersRouter.get('/:id', wrap(async (req, res) => { res.json(await orderView(await mine(req), req.user!.id)); }));

// Comprar / alugar / fazer proposta
ordersRouter.post('/', limit('order', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const b = parse(z.object({
    listingId: z.string(), offerCents: z.number().int().positive().optional(),
    deliveryMode: z.enum(['envio', 'retirada']), shipTo: addressSchema.optional(),
  }), req.body);
  const r = await createOrder(req.user!, b);
  await recordOrigin(req, 'order', { userId: req.user!.id, listingId: b.listingId, email: req.user!.email });
  res.status(201).json({ ...r, order: await orderView((await one(pool, 'SELECT * FROM orders WHERE id = $1', [r.id]))!, req.user!.id) });
}));

const act = (path: string, fn: (req: any) => Promise<unknown>) =>
  ordersRouter.post(`/:id/${path}`, limit('order-act', 60, 3600, (r) => r.user!.id), wrap(async (req, res) => {
    await fn(req);
    res.json(await orderView(await mine(req), req.user!.id));
  }));

act('accept', (req) => respondOrder(req.user.id, idOf(req), true));
act('decline', (req) => respondOrder(req.user.id, idOf(req), false));
act('pay', (req) => payOrder(req.user.id, idOf(req), parse(z.object({ method: z.enum(['pix', 'cartao']).default('pix') }), req.body).method));
act('ship', (req) => shipOrder(req.user.id, idOf(req), parse(z.object({ trackingCode: z.string().trim().max(60).optional() }), req.body).trackingCode));
act('handover', (req) => handoverOrder(req.user.id, idOf(req), parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body).code));
act('receive', (req) => receiveOrder(req.user.id, idOf(req)));
act('return', (req) => requestReturn(req.user.id, idOf(req), parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body).reason));
act('return-received', (req) => confirmReturn(req.user.id, idOf(req)));
act('cancel', (req) => cancelOrder(req.user.id, idOf(req)));
act('dispute', (req) => openDispute(req.user.id, idOf(req), parse(z.object({ reason: z.string().trim().min(10).max(1000) }), req.body).reason));

// Só desenvolvimento/teste: confirma o pagamento simulado (dinheiro "retido").
ordersRouter.post('/:id/simulate-payment', wrap(async (req, res) => {
  if (config.payments.provider !== 'mock' || config.isProd) throw new HttpError(404, 'not_found');
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [req.params.id, req.user!.id]);
  if (!o) throw new HttpError(404, 'not_found');
  await markOrderPaid(o.id, Number(o.price_cents));
  res.json(await orderView(await mine(req), req.user!.id));
}));

ordersRouter.get('/:id/events', wrap(async (req, res) => {
  const o = await mine(req);
  const rows = (await pool.query('SELECT event, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at', [o.id])).rows;
  res.json({ items: rows });
}));
