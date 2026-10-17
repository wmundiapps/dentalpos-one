// Páginas públicas do lava-rápido: vitrine, agendamento online, avaliações do Google e cancelamento de mensagens.
// Tudo aqui é aberto ao mundo: só devolve o mínimo necessário, com limite de uso e sem dados de clientes.
import { Router } from 'express';
import { z } from 'zod';
import { pool, one, rows, withTx } from '../db.js';
import { HttpError, rateLimit, stripLinks } from '../security.js';
import { getRec, insertRec, listRecs, patchRec } from '../repo.js';
import { parseSettings, getTenant } from '../tenant.js';
import { createAppointment, durationOf, slotsFor } from '../agenda.js';
import { notifyCustomer, render } from '../notify.js';
import { apptVars } from './agenda.js';
import { sendImage } from './photos.js';
import { verifyLink, contactHash } from '../secure.js';
import { isoDate, isoDateTime, normalizePhone, normalizePlate, text, uuid, validPlate } from '../validators.js';

export const publicRouter = Router();

async function tenantBySlug(slug: string) {
  const t = await one(pool, "SELECT * FROM tenants WHERE slug = $1 AND billing_status <> 'cancelada'", [slug]);
  if (!t) throw new HttpError(404, 'Lava-rápido não encontrado.', 'nao_encontrado');
  return t as Awaited<ReturnType<typeof getTenant>>;
}

const ratingCache = new Map<string, { at: number; value: any }>();
/** Nota e avaliações do Google (Places API). Sem GOOGLE_PLACES_API_KEY ou Place ID, devolve null e a página mostra só o botão de avaliar. */
async function googleReviews(placeId: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeId) return null;
  const hit = ratingCache.get(placeId);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.value;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as any;
    const value = { rating: j.rating ?? null, count: j.userRatingCount ?? 0, reviews: (j.reviews ?? []).slice(0, 5).map((x: any) => ({ author: String(x.authorAttribution?.displayName ?? '').slice(0, 60), rating: x.rating, text: String(x.text?.text ?? '').slice(0, 400), when: x.relativePublishTimeDescription })) };
    ratingCache.set(placeId, { at: Date.now(), value });
    return value;
  } catch { return null; }
}

publicRouter.get('/l/:slug', rateLimit('pub', 120, 60), async (req, res) => {
  const t = await tenantBySlug(req.params.slug as string);
  const s = parseSettings(t.settings);
  const [services, cats, showcase] = await Promise.all([listRecs(pool, t.id, 'service', {}), listRecs(pool, t.id, 'category', { order: "(data->>'order')::int" }), listRecs(pool, t.id, 'showcase', { where: `data->>'published' = 'true'`, limit: 24 })]);
  res.json({
    name: t.name, slug: t.slug, phone: t.phone, message: s.publicBooking.message, bookingEnabled: s.publicBooking.enabled, maxDaysAhead: s.publicBooking.maxDaysAhead, hours: s.hours,
    categories: cats.filter((c) => c.data.active !== false).map((c) => ({ key: c.data.key, name: c.data.name })),
    services: services.filter((x) => x.data.active !== false).map((x) => ({ id: x.id, name: x.data.name, description: x.data.description, durationMin: x.data.durationMin, prices: x.data.prices })),
    showcase: showcase.map((x) => ({ id: x.id, title: x.data.title, serviceName: x.data.serviceName, vehicle: x.data.vehicle, before: x.data.beforePhotoId, after: x.data.afterPhotoId })),
    google: { reviewUrl: s.google.placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(s.google.placeId)}` : null, ...(await googleReviews(s.google.placeId)) },
  });
});

/** Foto da vitrine: só sai se estiver marcada como pública (autorizada e publicada). */
publicRouter.get('/l/:slug/photo/:id', rateLimit('pubphoto', 300, 60), async (req, res) => {
  const t = await tenantBySlug(req.params.slug as string);
  const p = await one(pool, 'SELECT data, mime FROM photos WHERE tenant_id = $1 AND id = $2 AND is_public = true', [t.id, req.params.id]).catch(() => undefined);
  if (!p) throw new HttpError(404, 'Foto não encontrada.', 'nao_encontrado');
  sendImage(res, p.data, p.mime, true);
});

publicRouter.get('/l/:slug/slots', rateLimit('slots', 60, 60), async (req, res) => {
  const q = z.object({ date: isoDate, serviceIds: z.string().min(36) }).parse(req.query);
  const t = await tenantBySlug(req.params.slug as string);
  const s = parseSettings(t.settings);
  if (!s.publicBooking.enabled) throw new HttpError(403, 'Agendamento online desligado.', 'desligado');
  const ids = q.serviceIds.split(',').slice(0, 10).map((x) => uuid.parse(x));
  const dur = await durationOf(pool, t.id, ids, s.slotMinutes);
  res.json({ durationMin: dur, slots: (await slotsFor(pool, t.id, s, q.date, dur, { publicView: true })).map((x) => ({ time: x.time, start: x.start })) });
});

const bookSchema = z.object({
  name: text(100).pipe(z.string().min(2)), whatsapp: z.string().max(25), email: z.string().email().max(160).or(z.literal('')).default(''),
  plate: text(10).transform(normalizePlate).refine(validPlate, 'placa inválida'), brand: text(40).pipe(z.string().min(1)), model: text(60).pipe(z.string().min(1)),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 2), categoryKey: z.enum(['carro', 'suv', 'utilitario', 'van', 'caminhao']),
  serviceIds: z.array(uuid).min(1).max(10), start: isoDateTime, consentMarketing: z.boolean().default(false),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'aceite a política de privacidade' }) }),
  website: z.string().max(0).optional(), // isca anti-robô
});

publicRouter.post('/l/:slug/book', rateLimit('book', 10, 3600, true), async (req, res) => {
  const b = bookSchema.parse(req.body);
  const t = await tenantBySlug(req.params.slug as string);
  const s = parseSettings(t.settings);
  if (!s.publicBooking.enabled) throw new HttpError(403, 'Agendamento online desligado.', 'desligado');
  const phone = normalizePhone(b.whatsapp);
  if (!phone) throw new HttpError(400, 'WhatsApp inválido. Informe o DDD e o número.', 'invalido');
  const now = new Date();
  const maxIso = new Date(now.getTime() + s.publicBooking.maxDaysAhead * 86400000).toISOString().slice(0, 10);
  if (b.start.slice(0, 10) > maxIso) throw new HttpError(400, 'Data distante demais.', 'invalido');
  for (const id of b.serviceIds) { const sv = await getRec(pool, t.id, 'service', id); if (!sv || sv.data.archived || sv.data.active === false) throw new HttpError(400, 'Serviço inválido.', 'invalido'); }
  const out = await withTx(async (tx) => {
    let c = (await listRecs(tx, t.id, 'customer', { where: `data->>'whatsapp' = $3`, params: [phone], limit: 1 }))[0];
    if (!c) c = await insertRec(tx, t.id, 'customer', { name: b.name, whatsapp: phone, email: b.email.toLowerCase(), cpfEnc: '', cpfLast2: '', notes: 'Cadastro pelo agendamento online', consentMarketing: b.consentMarketing, cashbackOptIn: false });
    const future = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM records WHERE tenant_id=$1 AND kind='appointment' AND data->>'customerId'=$2 AND data->>'status' IN ('agendado','confirmado') AND data->>'start' >= $3`, [t.id, c.id, new Date().toISOString().slice(0, 10)]);
    if ((future?.n ?? 0) >= 3) throw new HttpError(409, 'Você já tem agendamentos em aberto. Fale com o lava-rápido para mudar ou cancelar.', 'limite');
    let v = (await listRecs(tx, t.id, 'vehicle', { where: `data->>'plate' = $3 AND data->>'customerId' = $4`, params: [b.plate, c.id], limit: 1 }))[0];
    if (!v) v = await insertRec(tx, t.id, 'vehicle', { customerId: c.id, plate: b.plate, brand: b.brand, model: b.model, year: b.year, color: '', categoryKey: b.categoryKey });
    const a = await createAppointment(tx, t.id, s, { customerId: c.id, vehicleId: v.id, serviceIds: b.serviceIds, start: b.start, source: 'online' });
    return { a, c, v };
  });
  await notifyCustomer(pool, t.id, s.reminders.bookingConfirmation, out.c.data as any, 'agenda', `Agendamento confirmado — ${t.name}`, render(s.templates.confirmacao, apptVars(out.a.data, out.c.data, out.v.data, t.name)), { dedupe: `conf:${out.a.id}` });
  res.status(201).json({ ok: true, start: out.a.data.start, message: 'Agendamento feito! Você recebe a confirmação por WhatsApp.' });
});

/** Cancelar mensagens (LGPD): link assinado, sem login. Bloqueia por hash e cancela o que estava na fila. */
publicRouter.post('/optout', rateLimit('optout', 20, 3600), async (req, res) => {
  const { t } = z.object({ t: z.string().max(200) }).parse(req.body);
  const [tenantId, hash, sig] = t.split('.');
  if (!tenantId || !hash || !sig || !/^[0-9a-f-]{36}$/i.test(tenantId) || !verifyLink(`${tenantId}.${hash}`, sig)) throw new HttpError(400, 'Link inválido.', 'invalido');
  await pool.query('INSERT INTO optouts (tenant_id, contact_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [tenantId, hash]);
  const pend = await rows(pool, "SELECT id, to_addr FROM outbox WHERE tenant_id = $1 AND status = 'pendente'", [tenantId]);
  for (const m of pend) if (contactHash(m.to_addr) === hash) await pool.query("UPDATE outbox SET status = 'descartada' WHERE id = $1", [m.id]);
  res.json({ ok: true });
});

publicRouter.get('/vehicles', (_req, res) => {
  import('../vehicles.js').then((v) => res.set('Cache-Control', 'public, max-age=86400').json({ brands: v.VEHICLE_CATALOG, categories: v.CATEGORIES }));
});
