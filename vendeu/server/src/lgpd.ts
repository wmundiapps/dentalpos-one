// Direitos do titular (LGPD art. 18): exportar dados, corrigir, revogar consentimento e eliminar a conta.
import { many, one, pool, tx } from './db.js';
import { HttpError } from './http.js';
import { decryptText } from './secure.js';
import { id } from './db.js';

export async function exportUserData(userId: string) {
  const u = await one(pool, 'SELECT * FROM users WHERE id = $1', [userId]);
  if (!u) throw new HttpError(404, 'not_found');
  const { password_hash, doc_hash, doc_enc, ...safe } = u;
  const q = (sql: string) => many(pool, sql, [userId]);
  return {
    geradoEm: new Date().toISOString(),
    conta: { ...safe, documento: doc_enc ? decryptText(doc_enc) : null },
    aceitesDeTermos: await q('SELECT doc_key, version, text_hash, ip, user_agent, created_at FROM term_acceptances WHERE user_id = $1 ORDER BY created_at'),
    anuncios: await q('SELECT id, operation, category, condition, title, description, price_cents, status, city, state, created_at, published_at FROM listings WHERE seller_id = $1'),
    declaracoesDeOrigem: await q('SELECT listing_id, origin_kind, asset_ref, signer_name, text_version, text_hash, ip, created_at FROM listing_declarations WHERE user_id = $1'),
    registrosDeOrigem: await q('SELECT event, listing_id, email, phone, ip, user_agent, created_at FROM origin_records WHERE user_id = $1 ORDER BY created_at'),
    mensagens: await q('SELECT m.body, m.created_at, c.listing_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.sender_id = $1 ORDER BY m.created_at'),
    vendasETaxas: await q('SELECT id, listing_id, declared_price_cents, fee_cents, status, receipt_number, created_at, paid_at FROM sales WHERE seller_id = $1'),
    documentosDeVerificacao: await q('SELECT kind, mime, size, created_at FROM kyc_documents WHERE user_id = $1'),
    meioDeRecebimento: await q('SELECT kind, status, created_at FROM payment_methods WHERE user_id = $1 ORDER BY created_at'),
    pedidos: await q('SELECT id, listing_id, price_cents, commission_cents, status, delivery_mode, created_at, received_at, released_at, refunded_at FROM orders WHERE buyer_id = $1 OR seller_id = $1 ORDER BY created_at'),
    solicitacoes: await q('SELECT kind, details, status, created_at, resolved_at FROM data_requests WHERE user_id = $1'),
  };
}

/**
 * Eliminação da conta. Apaga/anonimiza dados pessoais. Ficam, pelo prazo legal (ver Política de Privacidade):
 * registros de origem/acesso (Marco Civil art. 15 e prevenção a fraude), aceites de termos e declarações
 * (prova de consentimento e defesa em processo) e vendas/pagamentos (obrigação fiscal).
 */
export async function deleteAccount(userId: string) {
  const owed = await one(pool, "SELECT count(*)::int AS n FROM sales WHERE seller_id = $1 AND status = 'awaiting_payment'", [userId]);
  if (owed.n > 0) throw new HttpError(409, 'pending_fees');
  const open = await one(pool, "SELECT count(*)::int AS n FROM orders WHERE (buyer_id = $1 OR seller_id = $1) AND status IN ('offered','awaiting_payment','paid','shipped','received','return_requested','disputed')", [userId]);
  if (open.n > 0) throw new HttpError(409, 'orders_in_progress');
  await tx(async (c) => {
    await c.query("UPDATE listings SET status = 'removed', removed_reason = 'conta eliminada', closed_at = now() WHERE seller_id = $1 AND status NOT IN ('sold','removed')", [userId]);
    await c.query('DELETE FROM kyc_documents WHERE user_id = $1', [userId]);
    await c.query("UPDATE payment_methods SET status = 'removed', removed_at = now(), access_token_enc = NULL, refresh_token_enc = NULL WHERE user_id = $1 AND status = 'active'", [userId]);
    await c.query('UPDATE orders SET ship_to_enc = NULL WHERE buyer_id = $1', [userId]);
    await c.query("UPDATE messages SET body = '[mensagem removida a pedido do titular]', flagged = false WHERE sender_id = $1", [userId]);
    await c.query("DELETE FROM uploads WHERE owner_id = $1 AND kind = 'photo' AND id NOT IN (SELECT upload_id FROM listing_photos lp JOIN listings l ON l.id = lp.listing_id WHERE l.status = 'sold')", [userId]);
    await c.query(
      `UPDATE users SET email = 'excluido+' || id || '@vendeu.invalid', phone = NULL, full_name = 'Conta eliminada', doc_hash = NULL, doc_enc = NULL, doc_masked = NULL,
         company_name = NULL, birth_date = NULL, cep = NULL, street = NULL, street_number = NULL, complement = NULL, district = NULL, city = NULL, state = NULL,
         password_hash = '!', marketing_opt_in = false, email_verified_at = NULL, phone_verified_at = NULL, anonymized_at = now(), updated_at = now() WHERE id = $1`, [userId]);
    await c.query("INSERT INTO data_requests (id, user_id, kind, status, resolved_at) VALUES ($1,$2,'delete','done', now())", [id('dsr'), userId]);
  });
}
