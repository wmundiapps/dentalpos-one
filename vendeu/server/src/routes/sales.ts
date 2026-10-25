import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { many, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { limit } from '../ratelimit.js';
import { fetchPayment, verifyMpSignature } from '../payments.js';
import { recordOrigin } from '../origin.js';
import { cancelSale, closeAsSold, getSale, markPaid, saleView, sellerSales, startPayment } from '../sales.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '../../../shared/fees.js';

export const salesRouter = Router();

// "Vendi / aluguei e vou retirar o anúncio": abre a cobrança. Se não vendeu, só retira (grátis).
export const closeRouter = Router();
closeRouter.post('/:id/close', requireAuth, limit('close', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const b = parse(z.object({
    sold: z.boolean(),
    declaredPriceCents: z.number().int().min(MIN_PRICE_CENTS).max(MAX_PRICE_CENTS).optional(),
    buyerId: z.string().optional(), note: z.string().max(400).optional(),
    reason: z.enum(['desisti', 'erro_no_anuncio', 'outro']).optional(),
  }), req.body);
  if (!b.sold) {
    const l = await one(pool, 'SELECT * FROM listings WHERE id = $1 AND seller_id = $2', [req.params.id, req.user!.id]);
    if (!l) throw new HttpError(404, 'not_found');
    if (!['active', 'paused', 'draft', 'pending_review', 'rejected'].includes(l.status)) throw new HttpError(409, 'invalid_status');
    await pool.query("UPDATE listings SET status = 'removed', removed_reason = $2, closed_at = now(), updated_at = now() WHERE id = $1", [l.id, `retirado pelo anunciante: ${b.reason ?? 'outro'}`]);
    return res.json({ status: 'removed', feeCents: 0 });
  }
  if (!b.declaredPriceCents) throw new HttpError(422, 'declared_price_required');
  const r = await closeAsSold(req.user!.id, String(req.params.id), { declaredPriceCents: b.declaredPriceCents, buyerId: b.buyerId, note: b.note });
  await recordOrigin(req, 'sale_close', { userId: req.user!.id, listingId: String(req.params.id), email: req.user!.email });
  res.status(201).json({ status: 'pending_checkout', ...r });
}));

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
salesRouter.post('/:id/cancel', requireAuth, wrap(async (req, res) => { await cancelSale(req.user!.id, String(req.params.id), req); res.json({ ok: true }); }));

// Só desenvolvimento/teste: confirma o pagamento simulado.
salesRouter.post('/:id/simulate-payment', requireAuth, wrap(async (req, res) => {
  if (config.payments.provider !== 'mock' || config.isProd) throw new HttpError(404, 'not_found');
  const s = await getSale(pool, String(req.params.id), req.user!.id);
  if (!s) throw new HttpError(404, 'not_found');
  await markPaid(s.id, s.fee_cents, { simulated: true });
  res.json(saleView(await getSale(pool, s.id)));
}));

// Comprador confirma (ou contesta) o valor fechado — dupla checagem contra sub-declaração.
export const purchasesRouter = Router();
purchasesRouter.get('/', requireAuth, wrap(async (req, res) => {
  const rows = await many(pool, `SELECT s.id, s.declared_price_cents, s.buyer_confirmation, s.created_at, l.title AS listing_title FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.buyer_id = $1 ORDER BY s.created_at DESC`, [req.user!.id]);
  res.json({ items: rows.map((r) => ({ id: r.id, listingTitle: r.listing_title, declaredPriceCents: r.declared_price_cents, buyerConfirmation: r.buyer_confirmation, createdAt: r.created_at })) });
}));
purchasesRouter.post('/:id/confirm', requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({ confirm: z.boolean(), paidCents: z.number().int().min(0).optional() }), req.body);
  const s = await one(pool, 'SELECT * FROM sales WHERE id = $1 AND buyer_id = $2', [req.params.id, req.user!.id]);
  if (!s) throw new HttpError(404, 'not_found');
  if (b.confirm) {
    await pool.query("UPDATE sales SET buyer_confirmation = 'confirmed' WHERE id = $1", [s.id]);
  } else {
    const reason = `Comprador contestou o valor${b.paidCents ? ` (diz ter pago ${(b.paidCents / 100).toFixed(2)})` : ''}`;
    await pool.query("UPDATE sales SET buyer_confirmation = 'disputed', flagged = true, flag_reason = COALESCE(flag_reason || ' | ', '') || $2 WHERE id = $1", [s.id, reason]);
  }
  res.json({ ok: true });
}));

// ---- webhook do Mercado Pago ----
export const webhookRouter = Router();
webhookRouter.post('/mercadopago', wrap(async (req, res) => {
  const dataId = String((req.query['data.id'] ?? req.body?.data?.id ?? '') as string);
  const type = String(req.query.type ?? req.query.topic ?? req.body?.type ?? '');
  if (!dataId || (type && type !== 'payment')) return void res.json({ ok: true });
  if (!verifyMpSignature(req.headers, dataId)) throw new HttpError(401, 'bad_signature');
  const p = await fetchPayment(dataId);             // a fonte da verdade é o provedor, nunca o corpo recebido
  if (p.status === 'approved' && p.saleId) await markPaid(p.saleId, p.amountCents, { paymentId: dataId });
  res.json({ ok: true });
}));

