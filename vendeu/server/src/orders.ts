// Compra e locação pela plataforma. Ciclo do pedido:
//   offered → awaiting_payment → paid (dinheiro retido no Mercado Pago) → shipped → received (contato liberado,
//   7 dias de devolução) → released (repasse ao vendedor menos a comissão)
//   Devolução: received → return_requested → refunded (valor integral ao comprador, comissão incluída).
//   Problemas: disputed (moderação decide: devolver ou liberar).
import type { PoolClient } from 'pg';
import { config } from './config.js';
import { id, many, one, pool, tx } from './db.js';
import { HttpError } from './http.js';
import { createEscrowCharge, refundEscrow, releaseEscrow } from './payments.js';
import { sendMail } from './mailer.js';
import { decryptText, encryptText, hmac } from './secure.js';
import { calcFeeCents, formatBRL } from '../../shared/fees.js';
import type { Address } from './accounts.js';

export const OPEN_STATUSES = ['offered', 'awaiting_payment', 'paid', 'shipped', 'received', 'return_requested', 'disputed'];
export type OrderRow = Record<string, any>;

const ev = (c: Pick<PoolClient, 'query'>, orderId: string, actor: string | null, event: string, note?: string) =>
  c.query('INSERT INTO order_events (id, order_id, actor_id, event, note) VALUES ($1,$2,$3,$4,$5)', [id('evt'), orderId, actor, event, note ?? null]);

async function notify(userId: string, subject: string, text: string) {
  const u = await one(pool, 'SELECT email FROM users WHERE id = $1 AND anonymized_at IS NULL', [userId]);
  if (u) await sendMail({ to: u.email, subject, text });
}

/** Código de entrega em mãos (retirada): o comprador só o passa ao vendedor depois de receber o produto. */
export const handoverCode = (orderId: string) => String(parseInt(hmac(`handover:${orderId}`).slice(0, 8), 16) % 1_000_000).padStart(6, '0');

async function lockOrder(c: PoolClient, orderId: string): Promise<OrderRow> {
  const o = await one(c, 'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!o) throw new HttpError(404, 'not_found');
  return o;
}
const reopenListing = (c: Pick<PoolClient, 'query'>, listingId: string) => c.query("UPDATE listings SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'reserved'", [listingId]);

// ---------- criação e resposta ----------
export interface NewOrder { listingId: string; offerCents?: number; deliveryMode: 'envio' | 'retirada'; shipTo?: Address }

export async function createOrder(buyer: { id: string; emailVerified: boolean; phoneVerified: boolean }, input: NewOrder): Promise<{ id: string; status: string }> {
  if (!buyer.emailVerified || !buyer.phoneVerified) throw new HttpError(403, 'contact_not_verified');
  if (input.deliveryMode === 'envio' && !input.shipTo) throw new HttpError(422, 'ship_to_required');
  return tx(async (c) => {
    const l = await one(c, 'SELECT * FROM listings WHERE id = $1 FOR UPDATE', [input.listingId]);
    if (l && l.seller_id === buyer.id) throw new HttpError(422, 'own_listing');
    if (!l || l.status !== 'active') throw new HttpError(409, 'listing_unavailable');
    const seller = await one(c, "SELECT 1 FROM payment_methods WHERE user_id = $1 AND status = 'active'", [l.seller_id]);
    if (!seller) throw new HttpError(409, 'seller_cannot_receive');
    const listed = Number(l.price_cents);
    const price = input.offerCents ?? listed;
    if (price > listed || price < Math.ceil(listed * config.escrow.minOfferRatio)) throw new HttpError(422, 'offer_out_of_range', { minCents: Math.ceil(listed * config.escrow.minOfferRatio), maxCents: listed });
    const orderId = id('ord');
    const direct = price === listed;         // preço cheio = aceite automático
    const commission = calcFeeCents(price, config.feeCapCents);
    await c.query(
      `INSERT INTO orders (id, listing_id, seller_id, buyer_id, operation, listed_price_cents, price_cents, commission_cents, status, delivery_mode, ship_to_enc, offer_expires_at, pay_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, l.id, l.seller_id, buyer.id, l.operation, listed, price, commission, direct ? 'awaiting_payment' : 'offered', input.deliveryMode,
        input.shipTo ? encryptText(JSON.stringify(input.shipTo)) : null,
        direct ? null : new Date(Date.now() + config.escrow.offerHours * 3600_000), direct ? new Date(Date.now() + config.escrow.payHours * 3600_000) : null]);
    await c.query("UPDATE listings SET status = 'reserved', updated_at = now() WHERE id = $1", [l.id]);
    await ev(c, orderId, buyer.id, direct ? 'order_created' : 'offer_made', formatBRL(price));
    return { id: orderId, status: direct ? 'awaiting_payment' : 'offered' };
  }).then(async (r) => {
    const o = await one(pool, 'SELECT seller_id, price_cents, listing_id FROM orders WHERE id = $1', [r.id]);
    await notify(o.seller_id, r.status === 'offered' ? 'Nova proposta no seu anúncio' : 'Um comprador iniciou a compra do seu anúncio',
      r.status === 'offered' ? `Você recebeu uma proposta de ${formatBRL(o.price_cents)}. Responda em até ${config.escrow.offerHours}h em Venda > Pedidos.` : `Um comprador reservou seu anúncio pelo preço cheio. Assim que ele pagar, avisaremos para você enviar. O dinheiro fica retido no Mercado Pago até a entrega e o prazo de devolução.`);
    return r;
  });
}

export async function respondOrder(sellerId: string, orderId: string, accept: boolean) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.seller_id !== sellerId) throw new HttpError(404, 'not_found');
    if (o.status !== 'offered') throw new HttpError(409, 'invalid_status');
    if (accept) {
      await c.query("UPDATE orders SET status='awaiting_payment', pay_expires_at = now() + make_interval(hours => $2), updated_at = now() WHERE id = $1", [orderId, config.escrow.payHours]);
    } else {
      await c.query("UPDATE orders SET status='declined', ship_to_enc = NULL, updated_at = now() WHERE id = $1", [orderId]);
      await reopenListing(c, o.listing_id);
    }
    await ev(c, orderId, sellerId, accept ? 'offer_accepted' : 'offer_declined');
  });
  const o = await one(pool, 'SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
  await notify(o.buyer_id, accept ? 'Proposta aceita: pague para reservar' : 'Proposta recusada', accept ? `O vendedor aceitou. Pague em até ${config.escrow.payHours}h em Meus pedidos. O dinheiro fica retido até você receber.` : 'O vendedor recusou a proposta. O anúncio voltou à vitrine.');
}

// ---------- pagamento (retido) ----------
export async function payOrder(buyerId: string, orderId: string, method: 'pix' | 'cartao') {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, buyerId]);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'awaiting_payment') throw new HttpError(409, 'invalid_status');
  if (config.payments.provider !== 'mock' && method !== 'pix') throw new HttpError(422, 'pix_only');
  const seller = await one(pool, "SELECT mp_user_id FROM payment_methods WHERE user_id = $1 AND status = 'active'", [o.seller_id]);
  if (!seller) throw new HttpError(409, 'seller_cannot_receive');
  const buyer = await one(pool, 'SELECT email, full_name FROM users WHERE id = $1', [buyerId]);
  const l = await one(pool, 'SELECT title FROM listings WHERE id = $1', [o.listing_id]);
  const ch = await createEscrowCharge({ orderId, priceCents: Number(o.price_cents), commissionCents: Number(o.commission_cents), description: `Vendeu - ${l.title}`.slice(0, 200), sellerMpUserId: seller.mp_user_id, payerEmail: buyer.email, payerName: buyer.full_name, dueAt: new Date(o.pay_expires_at ?? Date.now() + 86400_000) });
  await pool.query('UPDATE orders SET provider=$2, provider_ref=$3, pix_copy_paste=$4, pix_qr_base64=$5, updated_at = now() WHERE id = $1', [orderId, ch.provider, ch.ref, ch.pixCopyPaste ?? null, ch.pixQrBase64 ?? null]);
  await pool.query('INSERT INTO order_events (id, order_id, actor_id, event) VALUES ($1,$2,$3,$4)', [id('evt'), orderId, buyerId, 'payment_started']);
}

/** Pagamento aprovado e RETIDO. Idempotente. */
export async function markOrderPaid(orderId: string, amountCents: number): Promise<boolean> {
  const o = await tx(async (c) => {
    const o = await one(c, 'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o || o.status !== 'awaiting_payment') return null;
    if (amountCents < Number(o.price_cents)) throw new HttpError(422, 'amount_mismatch');
    await c.query("UPDATE orders SET status='paid', paid_at=now(), updated_at=now() WHERE id=$1", [orderId]);
    await ev(c, orderId, null, 'paid_held', formatBRL(amountCents));
    return o;
  });
  if (!o) return false;
  await notify(o.seller_id, 'Pagamento recebido: envie o produto', o.delivery_mode === 'envio'
    ? `O comprador pagou e o valor está retido com segurança. Envie em até ${config.escrow.shipDays} dias e informe o código de rastreio em Venda > Pedidos.`
    : 'O comprador pagou e o valor está retido com segurança. Combine a retirada pelo chat do Vendeu. Na entrega, peça o código de 6 dígitos que o comprador vê no app.');
  await notify(o.buyer_id, 'Pagamento confirmado', 'Seu pagamento está retido. O vendedor só recebe depois que você receber o produto e passar o prazo de devolução.');
  return true;
}

// ---------- envio, retirada, recebimento ----------
export async function shipOrder(sellerId: string, orderId: string, tracking?: string) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.seller_id !== sellerId) throw new HttpError(404, 'not_found');
    if (o.status !== 'paid' || o.delivery_mode !== 'envio') throw new HttpError(409, 'invalid_status');
    await c.query("UPDATE orders SET status='shipped', shipped_at=now(), tracking_code=$2, updated_at=now() WHERE id=$1", [orderId, tracking?.slice(0, 60) ?? null]);
    await ev(c, orderId, sellerId, 'shipped', tracking);
  });
  const o = await one(pool, 'SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
  await notify(o.buyer_id, 'Seu pedido foi enviado', `Quando receber, confirme em Meus pedidos. Sem resposta em ${config.escrow.autoReceiveDays} dias, consideramos recebido.`);
}

async function doReceive(c: PoolClient, o: OrderRow, actor: string | null, auto: boolean) {
  await c.query("UPDATE orders SET status='received', received_at=now(), auto_received=$2, return_deadline = now() + make_interval(days => $3), updated_at=now() WHERE id=$1", [o.id, auto, config.escrow.returnDays]);
  await ev(c, o.id, actor, auto ? 'received_auto' : 'received');
}

export async function receiveOrder(buyerId: string, orderId: string) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.buyer_id !== buyerId) throw new HttpError(404, 'not_found');
    if (!(o.status === 'shipped' || (o.status === 'paid' && o.delivery_mode === 'retirada'))) throw new HttpError(409, 'invalid_status');
    await doReceive(c, o, buyerId, false);
  });
  await afterReceive(orderId);
}

/** Retirada em mãos: o vendedor digita o código que o comprador mostra ao receber. */
export async function handoverOrder(sellerId: string, orderId: string, code: string) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.seller_id !== sellerId) throw new HttpError(404, 'not_found');
    if (o.status !== 'paid' || o.delivery_mode !== 'retirada') throw new HttpError(409, 'invalid_status');
    if (o.handover_attempts >= 5) throw new HttpError(429, 'too_many_attempts');
    if (code !== handoverCode(orderId)) {
      await c.query('UPDATE orders SET handover_attempts = handover_attempts + 1 WHERE id = $1', [orderId]);
      await c.query('COMMIT'); await c.query('BEGIN'); // grava a tentativa mesmo recusando
      throw new HttpError(400, 'code_invalid');
    }
    await doReceive(c, o, sellerId, false);
  });
  await afterReceive(orderId);
}

async function afterReceive(orderId: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1', [orderId]);
  const text = `Recebimento registrado. Os contatos de comprador e vendedor agora estão liberados em Pedidos. O comprador tem ${config.escrow.returnDays} dias para devolver; passado o prazo, o valor é repassado ao vendedor (menos a comissão).`;
  await notify(o.buyer_id, 'Recebimento confirmado', text);
  await notify(o.seller_id, 'Recebimento confirmado', text);
}

// ---------- devolução e disputas ----------
export async function requestReturn(buyerId: string, orderId: string, reason: string) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.buyer_id !== buyerId) throw new HttpError(404, 'not_found');
    if (o.status !== 'received') throw new HttpError(409, 'invalid_status');
    if (new Date(o.return_deadline) < new Date()) throw new HttpError(409, 'return_window_closed');
    await c.query("UPDATE orders SET status='return_requested', return_requested_at=now(), return_reason=$2, return_expires_at = now() + make_interval(days => $3), updated_at=now() WHERE id=$1", [orderId, reason, config.escrow.returnConfirmDays]);
    await ev(c, orderId, buyerId, 'return_requested', reason);
  });
  const o = await one(pool, 'SELECT seller_id FROM orders WHERE id = $1', [orderId]);
  await notify(o.seller_id, 'O comprador pediu a devolução', `Combine a devolução com o comprador (os contatos estão liberados). Quando o produto voltar, confirme em Pedidos — o valor é devolvido ao comprador. Sem confirmação em ${config.escrow.returnConfirmDays} dias, a moderação analisa.`);
}

async function refundAndClose(orderId: string, actor: string | null, event: string, finalStatus: 'refunded' | 'cancelled', note?: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1', [orderId]);
  const ref = await refundEscrow({ orderId, ref: o.provider_ref, provider: o.provider });   // se falhar, nada muda e dá para tentar de novo
  await tx(async (c) => {
    const cur = await lockOrder(c, orderId);
    if (['refunded', 'released', 'cancelled'].includes(cur.status)) return;
    await c.query("UPDATE orders SET status=$2, refunded_at=now(), refund_ref=$3, ship_to_enc = NULL, updated_at=now() WHERE id=$1", [orderId, finalStatus, ref]);
    await reopenListing(c, o.listing_id);
    await ev(c, orderId, actor, event, note);
  });
  const text = 'O valor foi devolvido integralmente ao comprador (a comissão do Vendeu também não é cobrada). O prazo para aparecer na conta depende do banco/Mercado Pago.';
  await notify(o.buyer_id, 'Dinheiro devolvido', text);
  await notify(o.seller_id, 'Pedido encerrado com devolução', text);
}

export async function confirmReturn(sellerId: string, orderId: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1 AND seller_id = $2', [orderId, sellerId]);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'return_requested') throw new HttpError(409, 'invalid_status');
  await refundAndClose(orderId, sellerId, 'return_received_refunded', 'refunded');
}

export async function cancelOrder(userId: string, orderId: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [orderId, userId]);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status === 'paid') return refundAndClose(orderId, userId, 'cancelled_after_payment', 'cancelled');
  if (!['offered', 'awaiting_payment'].includes(o.status)) throw new HttpError(409, 'invalid_status');
  if (o.status === 'awaiting_payment' && o.seller_id === userId) throw new HttpError(409, 'invalid_status');
  await tx(async (c) => {
    await lockOrder(c, orderId);
    await c.query("UPDATE orders SET status='cancelled', ship_to_enc = NULL, updated_at=now() WHERE id=$1 AND status IN ('offered','awaiting_payment')", [orderId]);
    await reopenListing(c, o.listing_id);
    await ev(c, orderId, userId, 'cancelled');
  });
}

export async function openDispute(userId: string, orderId: string, reason: string) {
  await tx(async (c) => {
    const o = await lockOrder(c, orderId);
    if (o.buyer_id !== userId && o.seller_id !== userId) throw new HttpError(404, 'not_found');
    if (!['paid', 'shipped', 'received', 'return_requested'].includes(o.status)) throw new HttpError(409, 'invalid_status');
    if (o.status === 'received' && new Date(o.return_deadline) < new Date() && o.buyer_id === userId) throw new HttpError(409, 'return_window_closed');
    await c.query("UPDATE orders SET status='disputed', disputed_at=now(), dispute_reason=$2, dispute_by=$3, updated_at=now() WHERE id=$1", [orderId, reason, userId]);
    await ev(c, orderId, userId, 'dispute_opened', reason);
  });
}

export async function resolveDispute(adminId: string, orderId: string, outcome: 'refund' | 'release', note: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!o) throw new HttpError(404, 'not_found');
  if (o.status !== 'disputed') throw new HttpError(409, 'invalid_status');
  await pool.query('UPDATE orders SET resolved_by = $2, resolution_note = $3 WHERE id = $1', [orderId, adminId, note]);
  if (outcome === 'refund') await refundAndClose(orderId, adminId, 'dispute_refund', 'refunded', note);
  else await releaseOrder(orderId, adminId, 'dispute_release', note);
}

// ---------- repasse ao vendedor ----------
export async function releaseOrder(orderId: string, actor: string | null, event = 'released', note?: string) {
  const o = await one(pool, 'SELECT * FROM orders WHERE id = $1', [orderId]);
  const ref = await releaseEscrow({ orderId, ref: o.provider_ref, provider: o.provider });
  await tx(async (c) => {
    const cur = await lockOrder(c, orderId);
    if (!['received', 'disputed'].includes(cur.status)) return;
    await c.query("UPDATE orders SET status='released', released_at=now(), payout_ref=$2, ship_to_enc = NULL, updated_at=now() WHERE id=$1", [orderId, ref]);
    await c.query("UPDATE listings SET status='sold', closed_at=COALESCE(closed_at, now()), updated_at=now() WHERE id=$1", [o.listing_id]);
    await ev(c, orderId, actor, event, note);
  });
  const payout = Number(o.price_cents) - Number(o.commission_cents);
  await notify(o.seller_id, 'Venda concluída: valor liberado', `O prazo de devolução terminou. Repassamos ${formatBRL(payout)} (${formatBRL(o.price_cents)} menos a comissão de ${formatBRL(o.commission_cents)}) para sua conta Mercado Pago. Recibo nº ${o.receipt_number}.`);
  await notify(o.buyer_id, 'Compra concluída', 'O prazo de devolução terminou e a compra foi concluída. Obrigado por comprar no Vendeu!');
}

// ---------- rotina periódica ----------
export async function processOrders(): Promise<Record<string, number>> {
  const lock = await pool.connect();
  const out = { expiredOffers: 0, expiredUnpaid: 0, refundedNoShipment: 0, autoReceived: 0, released: 0, returnEscalated: 0, errors: 0 };
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock(727402) AS ok')).rows[0].ok;
    if (!got) return out;
    const expire = async (status: 'offered' | 'awaiting_payment', col: string, key: 'expiredOffers' | 'expiredUnpaid') => {
      for (const o of await many(pool, `SELECT id, listing_id FROM orders WHERE status = $1 AND ${col} < now()`, [status])) {
        await tx(async (c) => {
          const r = await c.query("UPDATE orders SET status='expired', ship_to_enc = NULL, updated_at=now() WHERE id=$1 AND status=$2", [o.id, status]);
          if (r.rowCount) { await reopenListing(c, o.listing_id); await ev(c, o.id, null, 'expired'); out[key]++; }
        });
      }
    };
    await expire('offered', 'offer_expires_at', 'expiredOffers');
    await expire('awaiting_payment', 'pay_expires_at', 'expiredUnpaid');
    const step = async (rows: OrderRow[], fn: (o: OrderRow) => Promise<void>, key: keyof typeof out) => {
      for (const o of rows) { try { await fn(o); out[key]++; } catch (e) { out.errors++; console.error('pedido', o.id, e); } }
    };
    await step(await many(pool, `SELECT id FROM orders WHERE status='paid' AND paid_at < now() - make_interval(days => CASE WHEN delivery_mode = 'envio' THEN $1::int ELSE 15 END)`, [config.escrow.shipDays]),
      (o) => refundAndClose(o.id, null, 'auto_refund_no_shipment', 'cancelled'), 'refundedNoShipment');
    await step(await many(pool, "SELECT * FROM orders WHERE status='shipped' AND shipped_at < now() - make_interval(days => $1)", [config.escrow.autoReceiveDays]),
      async (o) => { await tx(async (c) => { const cur = await lockOrder(c, o.id); if (cur.status === 'shipped') await doReceive(c, cur, null, true); }); await afterReceive(o.id); }, 'autoReceived');
    await step(await many(pool, "SELECT id FROM orders WHERE status='received' AND return_deadline < now()"), (o) => releaseOrder(o.id, null), 'released');
    await step(await many(pool, "SELECT id FROM orders WHERE status='return_requested' AND return_expires_at < now()"),
      async (o) => { await pool.query("UPDATE orders SET status='disputed', disputed_at=now(), dispute_reason='Vendedor não confirmou a devolução no prazo', updated_at=now() WHERE id=$1 AND status='return_requested'", [o.id]); }, 'returnEscalated');
    await lock.query('SELECT pg_advisory_unlock(727402)');
  } finally { lock.release(); }
  return out;
}

// ---------- visão ----------
const personOf = (u: any) => ({ name: u.full_name, phone: u.phone, email: u.email });
const SEES_CONTACT = (o: OrderRow) => !!o.received_at;

export async function orderView(o: OrderRow, viewerId: string, isAdmin = false) {
  const role = isAdmin ? 'admin' : o.buyer_id === viewerId ? 'buyer' : 'seller';
  const l = await one(pool, `SELECT l.id, l.title, l.category, l.condition, (SELECT u.url FROM listing_photos p JOIN uploads u ON u.id = p.upload_id WHERE p.listing_id = l.id ORDER BY p.position LIMIT 1) AS photo FROM listings l WHERE l.id = $1`, [o.listing_id]);
  const other = role === 'buyer' ? o.seller_id : o.buyer_id;
  const otherUser = SEES_CONTACT(o) && role !== 'admin' ? await one(pool, 'SELECT full_name, phone, email FROM users WHERE id = $1', [other]) : null;
  const names = await one(pool, 'SELECT split_part((SELECT full_name FROM users WHERE id = $1), \' \', 1) AS buyer, split_part((SELECT full_name FROM users WHERE id = $2), \' \', 1) AS seller', [o.buyer_id, o.seller_id]);
  const now = Date.now();
  const actions: string[] = [];
  const st = o.status;
  if (role === 'buyer') {
    if (st === 'awaiting_payment') actions.push('pay', 'cancel');
    if (st === 'offered') actions.push('cancel');
    if (st === 'paid') actions.push('cancel', ...(o.delivery_mode === 'retirada' ? ['receive'] : []), 'dispute');
    if (st === 'shipped') actions.push('receive', 'dispute');
    if (st === 'received') { if (new Date(o.return_deadline).getTime() > now) actions.push('return'); actions.push('dispute'); }
  } else if (role === 'seller') {
    if (st === 'offered') actions.push('accept', 'decline');
    if (st === 'paid') actions.push(o.delivery_mode === 'envio' ? 'ship' : 'handover', 'cancel', 'dispute');
    if (st === 'shipped') actions.push('dispute');
    if (st === 'return_requested') actions.push('confirm_return', 'dispute');
  }
  return {
    id: o.id, role, status: st, operation: o.operation, receiptNumber: o.receipt_number,
    listing: { id: l.id, title: l.title, photo: l.photo },
    priceCents: Number(o.price_cents), listedPriceCents: Number(o.listed_price_cents),
    commissionCents: Number(o.commission_cents), sellerReceivesCents: Number(o.price_cents) - Number(o.commission_cents),
    deliveryMode: o.delivery_mode, trackingCode: o.tracking_code,
    buyerFirstName: names.buyer, sellerFirstName: names.seller,
    offerExpiresAt: o.offer_expires_at, payExpiresAt: o.pay_expires_at, paidAt: o.paid_at, shippedAt: o.shipped_at, receivedAt: o.received_at,
    autoReceived: o.auto_received, returnDeadline: o.return_deadline, returnRequestedAt: o.return_requested_at, returnReason: o.return_reason,
    disputeReason: o.dispute_reason, disputeBy: o.dispute_by, releasedAt: o.released_at, refundedAt: o.refunded_at, createdAt: o.created_at,
    ...(role === 'buyer' && st === 'awaiting_payment' && o.pix_copy_paste ? { pix: { copyPaste: o.pix_copy_paste, qrBase64: o.pix_qr_base64 } } : {}),
    ...(role === 'buyer' && st === 'paid' && o.delivery_mode === 'retirada' ? { handoverCode: handoverCode(o.id) } : {}),
    ...((role === 'seller' || role === 'admin') && ['paid', 'shipped'].includes(st) && o.ship_to_enc ? { shipTo: JSON.parse(decryptText(o.ship_to_enc)) } : {}),
    contact: otherUser ? personOf(otherUser) : null,
    contactNote: SEES_CONTACT(o) ? null : 'Os contatos são liberados somente depois que o comprador receber o produto.',
    actions,
  };
}

export async function ordersOf(userId: string) {
  const rows = await many(pool, 'SELECT * FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]);
  return Promise.all(rows.map((o) => orderView(o, userId)));
}
