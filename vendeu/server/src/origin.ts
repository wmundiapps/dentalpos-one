// Registro de origem (anti-fraude e atendimento a ordem judicial): IP, e-mail, telefone, navegador e dispositivo.
// A tabela é imutável (trigger no banco); só a rotina de retenção apaga o que passou do prazo.
import type { Request } from 'express';
import { id, pool, type Db } from './db.js';
import { clientIp, ipChain } from './http.js';
import { hmac } from './secure.js';

export type OriginEvent = 'signup' | 'login' | 'listing_create' | 'listing_publish' | 'message' | 'sale_close' | 'kyc_submit' | 'report';

export async function recordOrigin(req: Request, event: OriginEvent, who: { userId?: string; listingId?: string; email?: string | null; phone?: string | null }, db: Db = pool) {
  const device = req.headers['x-device-id'];
  await db.query(
    `INSERT INTO origin_records (id, event, user_id, listing_id, email, phone, ip, ip_chain, user_agent, accept_language, device_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id('org'), event, who.userId ?? null, who.listingId ?? null, who.email ?? null, who.phone ?? null, clientIp(req), ipChain(req).slice(0, 500),
      String(req.headers['user-agent'] ?? '').slice(0, 400), String(req.headers['accept-language'] ?? '').slice(0, 100),
      typeof device === 'string' && device.length >= 8 ? hmac(device.slice(0, 100)) : null]);
}

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, meta: unknown = {}, req?: Request, db: Db = pool) {
  await db.query('INSERT INTO audit_log (id, actor_id, action, entity, entity_id, meta, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id('aud'), actorId, action, entity, entityId, JSON.stringify(meta), req ? clientIp(req) : null]);
}
