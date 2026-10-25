// Taxa de retirada: anúncio já publicado que o anunciante retira sem ter vendido paga uma taxa fixa.
// (A comissão de venda não passa por aqui: é descontada do repasse na compra pela plataforma — ver orders.ts.)
import { config } from './config.js';
import { id, many, one, pool, tx, type Db } from './db.js';
import { HttpError } from './http.js';
import { createCharge } from './payments.js';
import { sendMail } from './mailer.js';
import { formatBRL } from '../../shared/fees.js';
import { decryptText } from './secure.js';

export const saleView = (s: any) => ({
  id: s.id, kind: s.kind, listingId: s.listing_id, listingTitle: s.listing_title, feeCents: s.fee_cents, status: s.status,
  dueAt: s.due_at, paidAt: s.paid_at, receiptNumber: s.receipt_number,
  pix: s.pix_copy_paste ? { copyPaste: s.pix_copy_paste, qrBase64: s.pix_qr_base64 } : null, checkoutUrl: s.checkout_url, createdAt: s.created_at,
});

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
    description: `Vendeu - taxa de retirada de anúncio (recibo ${s.receipt_number})`,
    payer: { email: u.email, name: u.full_name, docType: u.doc_type, docNumber: u.doc_enc ? decryptText(u.doc_enc) : null },
  });
  await pool.query('UPDATE sales SET provider=$2, provider_ref=$3, pix_copy_paste=$4, pix_qr_base64=$5, checkout_url=$6 WHERE id=$1',
    [s.id, charge.provider, charge.ref, charge.pixCopyPaste ?? null, charge.pixQrBase64 ?? null, charge.checkoutUrl ?? null]);
  await pool.query('INSERT INTO payments (id, sale_id, provider, provider_ref, status, amount_cents) VALUES ($1,$2,$3,$4,$5,$6)', [id('pay'), s.id, charge.provider, charge.ref, 'created', s.fee_cents]);
  return saleView(await getSale(pool, saleId));
}

/** Confirma o pagamento da taxa (webhook conferido no provedor, ou simulação). Idempotente. */
export async function markPaid(saleId: string, amountCents: number, raw: unknown = {}) {
  const done = await tx(async (c) => {
    const s = await one(c, 'SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
    if (!s || s.status !== 'awaiting_payment') return null;
    if (amountCents < s.fee_cents) throw new HttpError(422, 'amount_mismatch');
    await c.query("UPDATE sales SET status='paid', paid_at=now() WHERE id=$1", [saleId]);
    await c.query('INSERT INTO payments (id, sale_id, provider, provider_ref, status, amount_cents, raw) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id('pay'), saleId, s.provider ?? 'manual', s.provider_ref, 'approved', amountCents, JSON.stringify(raw)]);
    return s;
  });
  if (!done) return false;
  await clearFeeBlockIfClean(done.seller_id);
  const u = await one(pool, 'SELECT email FROM users WHERE id = $1', [done.seller_id]);
  await sendMail({ to: u.email, subject: 'Pagamento da taxa de retirada confirmado', text: `Recebemos o pagamento da taxa (${formatBRL(done.fee_cents)}). Recibo nº ${done.receipt_number}.` });
  return true;
}

export async function clearFeeBlockIfClean(sellerId: string) {
  const overdue = await one(pool, "SELECT 1 FROM sales WHERE seller_id = $1 AND status = 'awaiting_payment' AND due_at + make_interval(days => $2) < now() LIMIT 1", [sellerId, config.feeBlockAfterDays]);
  if (!overdue) await pool.query('UPDATE users SET fee_blocked_at = NULL WHERE id = $1 AND fee_blocked_at IS NOT NULL', [sellerId]);
}

/**
 * Retirar um anúncio sem vender. Anúncio que nunca foi ao ar (rascunho, recusado) sai sem custo;
 * anúncio publicado paga a taxa fixa de retirada. Com negociação em andamento não dá para retirar.
 */
export async function removeWithFee(sellerId: string, listingId: string, reason: string) {
  return tx(async (c) => {
    const l = await one(c, 'SELECT * FROM listings WHERE id = $1 AND seller_id = $2 FOR UPDATE', [listingId, sellerId]);
    if (!l) throw new HttpError(404, 'not_found');
    if (l.status === 'reserved') throw new HttpError(409, 'order_in_progress');
    if (!['active', 'paused', 'draft', 'pending_review', 'rejected'].includes(l.status)) throw new HttpError(409, 'invalid_status');
    const wasLive = !!l.published_at && ['active', 'paused', 'pending_review'].includes(l.status);
    await c.query("UPDATE listings SET status = 'removed', removed_reason = $2, closed_at = now(), updated_at = now() WHERE id = $1", [l.id, `retirado pelo anunciante: ${reason}`]);
    if (!wasLive) return { saleId: null as string | null, feeCents: 0 };
    const saleId = id('sal');
    await c.query(
      `INSERT INTO sales (id, listing_id, seller_id, operation, listed_price_cents, max_listed_price_cents, declared_price_cents, fee_cents, kind, due_at)
       VALUES ($1,$2,$3,$4,$5,$5,$5,$6,'removal', now() + make_interval(days => $7))`,
      [saleId, l.id, sellerId, l.operation, l.price_cents, config.removalFeeCents, config.feeDueDays]);
    return { saleId, feeCents: config.removalFeeCents };
  });
}

export async function sellerSales(sellerId: string) {
  const rows = await many(pool, `SELECT s.*, l.title AS listing_title FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.seller_id = $1 ORDER BY s.created_at DESC`, [sellerId]);
  return rows.map(saleView);
}
