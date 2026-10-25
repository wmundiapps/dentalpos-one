// Fechamento da venda/locação = checkout da taxa. O anúncio sai do ar na hora; a taxa é cobrada por Pix ou cartão.
import { config } from './config.js';
import { id, many, one, pool, tx, type Db } from './db.js';
import { HttpError } from './http.js';
import { createCharge } from './payments.js';
import { sendMail } from './mailer.js';
import { audit } from './origin.js';
import { calcFeeCents, formatBRL } from '../../shared/fees.js';
import { decryptText } from './secure.js';

export const saleView = (s: any) => ({
  id: s.id, listingId: s.listing_id, listingTitle: s.listing_title, operation: s.operation,
  declaredPriceCents: s.declared_price_cents, feeCents: s.fee_cents, status: s.status, flagged: s.flagged,
  buyerConfirmation: s.buyer_confirmation, dueAt: s.due_at, paidAt: s.paid_at, receiptNumber: s.receipt_number,
  pix: s.pix_copy_paste ? { copyPaste: s.pix_copy_paste, qrBase64: s.pix_qr_base64 } : null, checkoutUrl: s.checkout_url, createdAt: s.created_at,
});

export interface CloseInput { declaredPriceCents: number; buyerId?: string | null; note?: string }

/** Marca como vendido/alugado: tira o anúncio do ar e abre a cobrança da taxa. */
export async function closeAsSold(sellerId: string, listingId: string, input: CloseInput) {
  return tx(async (c) => {
    const l = await one(c, 'SELECT * FROM listings WHERE id = $1 AND seller_id = $2 FOR UPDATE', [listingId, sellerId]);
    if (!l) throw new HttpError(404, 'not_found');
    if (!['active', 'paused', 'pending_review'].includes(l.status)) throw new HttpError(409, 'invalid_status');
    const maxListed = (await one(c, 'SELECT max(price_cents) AS m FROM listing_price_history WHERE listing_id = $1', [l.id])).m as number;
    let flagged = false;
    let flagReason: string | null = null;
    if (input.declaredPriceCents < maxListed * config.underDeclareRatio) {
      if (!input.note || input.note.trim().length < 10) throw new HttpError(422, 'under_declared_needs_note', { listedMaxCents: maxListed });
      flagged = true;
      flagReason = `Preço declarado (${formatBRL(input.declaredPriceCents)}) abaixo de ${Math.round(config.underDeclareRatio * 100)}% do anunciado (${formatBRL(maxListed)}): ${input.note.trim().slice(0, 300)}`;
    }
    let buyerId: string | null = null;
    if (input.buyerId) {
      const conv = await one(c, 'SELECT 1 FROM conversations WHERE listing_id = $1 AND buyer_id = $2', [l.id, input.buyerId]);
      if (!conv) throw new HttpError(422, 'buyer_not_in_conversations');
      buyerId = input.buyerId;
    }
    const fee = calcFeeCents(input.declaredPriceCents, config.feeCapCents);
    const saleId = id('sal');
    await c.query(
      `INSERT INTO sales (id, listing_id, seller_id, buyer_id, operation, listed_price_cents, max_listed_price_cents, declared_price_cents, fee_cents, flagged, flag_reason, buyer_confirmation, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + make_interval(days => $13))`,
      [saleId, l.id, sellerId, buyerId, l.operation, l.price_cents, maxListed, input.declaredPriceCents, fee, flagged, flagReason, buyerId ? 'pending' : 'none', config.feeDueDays]);
    await c.query("UPDATE listings SET status = 'pending_checkout', closed_at = now(), updated_at = now() WHERE id = $1", [l.id]);
    return { saleId, feeCents: fee, flagged };
  });
}

export async function getSale(db: Db, saleId: string, sellerId?: string) {
  return one(db, `SELECT s.*, l.title AS listing_title FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.id = $1 ${sellerId ? 'AND s.seller_id = $2' : ''}`, sellerId ? [saleId, sellerId] : [saleId]);
}

export async function startPayment(sellerId: string, saleId: string, method: 'pix' | 'cartao') {
  const s = await getSale(pool, saleId, sellerId);
  if (!s) throw new HttpError(404, 'not_found');
  if (s.status !== 'awaiting_payment') throw new HttpError(409, 'invalid_status');
  const u = await one(pool, 'SELECT email, full_name, doc_type, doc_enc FROM users WHERE id = $1', [sellerId]);
  const charge = await createCharge({
    saleId: s.id, amountCents: s.fee_cents, method, dueAt: new Date(s.due_at),
    description: `Vendeu - taxa de sucesso (recibo ${s.receipt_number})`,
    payer: { email: u.email, name: u.full_name, docType: u.doc_type, docNumber: u.doc_enc ? decryptText(u.doc_enc) : null },
  });
  await pool.query('UPDATE sales SET provider=$2, provider_ref=$3, pix_copy_paste=$4, pix_qr_base64=$5, checkout_url=$6 WHERE id=$1',
    [s.id, charge.provider, charge.ref, charge.pixCopyPaste ?? null, charge.pixQrBase64 ?? null, charge.checkoutUrl ?? null]);
  await pool.query('INSERT INTO payments (id, sale_id, provider, provider_ref, status, amount_cents) VALUES ($1,$2,$3,$4,$5,$6)', [id('pay'), s.id, charge.provider, charge.ref, 'created', s.fee_cents]);
  return saleView(await getSale(pool, saleId));
}

/** Confirma pagamento (webhook confirmado no provedor, ou simulação em desenvolvimento). Idempotente. */
export async function markPaid(saleId: string, amountCents: number, raw: unknown = {}) {
  const done = await tx(async (c) => {
    const s = await one(c, 'SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
    if (!s) return null;
    if (s.status === 'paid') return null;
    if (s.status !== 'awaiting_payment') return null;
    if (amountCents < s.fee_cents) throw new HttpError(422, 'amount_mismatch');
    await c.query("UPDATE sales SET status='paid', paid_at=now() WHERE id=$1", [saleId]);
    await c.query("UPDATE listings SET status='sold', closed_at=COALESCE(closed_at, now()) WHERE id=$1", [s.listing_id]);
    await c.query('INSERT INTO payments (id, sale_id, provider, provider_ref, status, amount_cents, raw) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id('pay'), saleId, s.provider ?? 'manual', s.provider_ref, 'approved', amountCents, JSON.stringify(raw)]);
    return s;
  });
  if (!done) return false;
  await clearFeeBlockIfClean(done.seller_id);
  const u = await one(pool, 'SELECT email FROM users WHERE id = $1', [done.seller_id]);
  await sendMail({ to: u.email, subject: 'Pagamento confirmado — parabéns pela venda!', text: `Recebemos o pagamento da taxa (${formatBRL(done.fee_cents)}). Recibo nº ${done.receipt_number}. Seu anúncio foi encerrado. Obrigado por vender com o Vendeu!` });
  return true;
}

export async function clearFeeBlockIfClean(sellerId: string) {
  const overdue = await one(pool, "SELECT 1 FROM sales WHERE seller_id = $1 AND status = 'awaiting_payment' AND due_at + make_interval(days => $2) < now() LIMIT 1", [sellerId, config.feeBlockAfterDays]);
  if (!overdue) await pool.query('UPDATE users SET fee_blocked_at = NULL WHERE id = $1 AND fee_blocked_at IS NOT NULL', [sellerId]);
}

/** Desistiu da venda antes de pagar: o anúncio volta. Limite de 2 desistências em 90 dias (evita fugir da taxa). */
export async function cancelSale(sellerId: string, saleId: string, req?: import('express').Request) {
  await tx(async (c) => {
    const s = await one(c, 'SELECT * FROM sales WHERE id = $1 AND seller_id = $2 FOR UPDATE', [saleId, sellerId]);
    if (!s) throw new HttpError(404, 'not_found');
    if (s.status !== 'awaiting_payment') throw new HttpError(409, 'invalid_status');
    if (s.buyer_confirmation === 'confirmed') throw new HttpError(409, 'buyer_confirmed');
    const n = (await one(c, "SELECT count(*)::int AS n FROM sales WHERE seller_id = $1 AND status = 'cancelled' AND created_at > now() - interval '90 days'", [sellerId])).n;
    if (n >= 2) throw new HttpError(429, 'too_many_cancellations');
    await c.query("UPDATE sales SET status = 'cancelled' WHERE id = $1", [saleId]);
    await c.query("UPDATE listings SET status = 'active', closed_at = NULL WHERE id = $1", [s.listing_id]);
    await audit(sellerId, 'sale.cancel', 'sale', saleId, {}, req, c);
  });
}

export async function sellerSales(sellerId: string) {
  const rows = await many(pool, `SELECT s.*, l.title AS listing_title FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.seller_id = $1 ORDER BY s.created_at DESC`, [sellerId]);
  return rows.map(saleView);
}
