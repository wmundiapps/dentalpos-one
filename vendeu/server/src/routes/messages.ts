import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { id, many, one, pool } from '../db.js';
import { HttpError, parse, wrap } from '../http.js';
import { limit } from '../ratelimit.js';
import { recordOrigin } from '../origin.js';
import { maskContacts, scanMessage } from '../risk.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

const MASK_NOTE = 'Contato ocultado: telefone, e-mail e links só são liberados depois que o comprador receber o produto. Negociar e pagar fora do Vendeu tira a proteção da compra.';
const body = z.object({ body: z.string().trim().min(1).max(2000) });

// Comprador abre conversa pelo anúncio
messagesRouter.post('/start/:listingId', limit('msg-start', 20, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  if (!req.user!.emailVerified) throw new HttpError(403, 'email_not_verified');
  const b = parse(body, req.body);
  const l = await one(pool, "SELECT id, seller_id FROM listings WHERE id = $1 AND status = 'active'", [req.params.listingId]);
  if (!l) throw new HttpError(404, 'not_found');
  if (l.seller_id === req.user!.id) throw new HttpError(422, 'own_listing');
  const existing = await one(pool, 'SELECT id FROM conversations WHERE listing_id = $1 AND buyer_id = $2', [l.id, req.user!.id]);
  const convId = existing?.id ?? id('cnv');
  if (!existing) await pool.query('INSERT INTO conversations (id, listing_id, buyer_id, seller_id) VALUES ($1,$2,$3,$4)', [convId, l.id, req.user!.id, l.seller_id]);
  const { text, masked } = maskContacts(b.body);
  const scan = scanMessage(b.body);
  if (masked) scan.reasons.push(MASK_NOTE);
  await pool.query('INSERT INTO messages (id, conversation_id, sender_id, body, flagged, flag_reason) VALUES ($1,$2,$3,$4,$5,$6)', [id('msg'), convId, req.user!.id, text, scan.reasons.length > 0, scan.reasons.join(' | ') || null]);
  await pool.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [convId]);
  await recordOrigin(req, 'message', { userId: req.user!.id, listingId: l.id, email: req.user!.email });
  res.status(201).json({ conversationId: convId, warnings: scan.reasons });
}));

messagesRouter.get('/', wrap(async (req, res) => {
  const rows = await many(pool, `SELECT c.id, c.listing_id, c.last_message_at, c.buyer_id, c.seller_id, l.title, l.status AS listing_status,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
      (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread,
      CASE WHEN c.buyer_id = $1 THEN split_part(s.full_name, ' ', 1) ELSE split_part(b.full_name, ' ', 1) END AS other_name
    FROM conversations c JOIN listings l ON l.id = c.listing_id JOIN users s ON s.id = c.seller_id JOIN users b ON b.id = c.buyer_id
    WHERE c.buyer_id = $1 OR c.seller_id = $1 ORDER BY c.last_message_at DESC LIMIT 100`, [req.user!.id]);
  res.json({ items: rows.map((r) => ({ id: r.id, listingId: r.listing_id, title: r.title, listingStatus: r.listing_status, lastBody: r.last_body, lastMessageAt: r.last_message_at, unread: r.unread, otherName: r.other_name, role: r.buyer_id === req.user!.id ? 'buyer' : 'seller', buyerId: r.buyer_id })) });
}));

async function mine(req: any) {
  const c = await one(pool, 'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)', [req.params.id, req.user!.id]);
  if (!c) throw new HttpError(404, 'not_found');
  return c;
}

messagesRouter.get('/:id', wrap(async (req, res) => {
  const c = await mine(req);
  await pool.query('UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL', [c.id, req.user!.id]);
  const rows = await many(pool, 'SELECT id, sender_id, body, flagged, flag_reason, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at', [c.id]);
  res.json({ id: c.id, listingId: c.listing_id, messages: rows.map((m) => ({ id: m.id, mine: m.sender_id === req.user!.id, body: m.body, warning: m.flagged ? m.flag_reason : null, createdAt: m.created_at })) });
}));

messagesRouter.post('/:id', limit('msg', 60, 3600, (r) => r.user!.id), wrap(async (req, res) => {
  const c = await mine(req);
  const b = parse(body, req.body);
  const { text, masked } = maskContacts(b.body);
  const scan = scanMessage(b.body);
  if (masked) scan.reasons.push(MASK_NOTE);
  await pool.query('INSERT INTO messages (id, conversation_id, sender_id, body, flagged, flag_reason) VALUES ($1,$2,$3,$4,$5,$6)', [id('msg'), c.id, req.user!.id, text, scan.reasons.length > 0, scan.reasons.join(' | ') || null]);
  await pool.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [c.id]);
  res.status(201).json({ warnings: scan.reasons });
}));
