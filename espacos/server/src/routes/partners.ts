import express, { Router } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';
import * as repo from '../repo.js';
import { HttpError, requireAuth, type AuthedRequest } from '../auth.js';
import {
  bookingPartnerContacts, createInspection, decidePartner, endLink, getPartner, hostInvite, listInspections, listPartners, listingLinks,
  markPaid, partnerDashboard, partnerRequest, payoutReport, registerPartner, respondLink, setCanEdit, setCaretakerFee, setReferral, telegramLink,
} from '../partners.js';
import { handleTelegramUpdate } from '../messaging.js';

export const partnersRouter = Router();
const role = z.enum(['broker', 'caretaker']);
const requireAdmin = (req: AuthedRequest) => { if (!req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden'); };

// ───────────── Cadastro e painel do parceiro ─────────────
partnersRouter.get('/partner/me', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await partnerDashboard(req.user!));
});

partnersRouter.post('/partner/me', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    roles: z.array(role).min(1).max(2), taxId: z.string().max(20), phone: z.string().max(20),
    creci: z.string().max(20).optional(), creciUf: z.string().max(2).optional(), pixKey: z.string().max(140),
    cities: z.string().min(2).max(300), about: z.string().max(1000).optional(), acceptTerms: z.literal(true),
  }).parse(req.body);
  res.json(await registerPartner(req.user!, data, req.ip));
});

partnersRouter.post('/partner/telegram-link', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await telegramLink(req.user!));
});

/** Código de indicação guardado no navegador (link do corretor) e enviado depois do cadastro/entrada. */
partnersRouter.post('/partner/referral', requireAuth, async (req: AuthedRequest, res) => {
  const { ref } = z.object({ ref: z.string().max(20) }).parse(req.body);
  await setReferral(pool, req.user!.id, ref);
  res.json({ ok: true });
});

// ───────────── Vínculo com o anúncio ─────────────
partnersRouter.get('/listings/:id/partners', requireAuth, async (req: AuthedRequest, res) => {
  const l = await repo.getListing(pool, req.params.id);
  if (!l) throw new HttpError(404, 'listing_not_found');
  if (l.hostId !== req.user!.id && !req.user!.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  res.json(await listingLinks(l.id));
});

partnersRouter.post('/listings/:id/partners', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ email: z.string().email(), role, caretakerFee: z.number().positive().optional(), canEdit: z.boolean().optional() }).parse(req.body);
  res.status(201).json(await hostInvite(req.user!, req.params.id, data));
});

partnersRouter.post('/partner/requests', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ listing: z.string().min(3).max(300), role, caretakerFee: z.number().positive().optional() }).parse(req.body);
  // Aceita o link do anúncio (space-hour.com/espacos/lst_...) ou só o código
  const listingId = /lst_[a-z0-9]+/i.exec(data.listing)?.[0] ?? data.listing.trim();
  res.status(201).json(await partnerRequest(req.user!, listingId, data));
});

partnersRouter.post('/partner-links/:id/respond', requireAuth, async (req: AuthedRequest, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  res.json(await respondLink(req.user!, req.params.id, accept));
});

partnersRouter.post('/partner-links/:id/end', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({ reason: z.string().max(500).default(''), immediate: z.boolean().optional() }).parse(req.body);
  await endLink(req.user!, req.params.id, data);
  res.json({ ok: true });
});

partnersRouter.post('/partner-links/:id/can-edit', requireAuth, async (req: AuthedRequest, res) => {
  const { canEdit } = z.object({ canEdit: z.boolean() }).parse(req.body);
  await setCanEdit(req.user!, req.params.id, canEdit);
  res.json({ ok: true });
});

// ───────────── Reserva: contatos e vistoria ─────────────
partnersRouter.get('/bookings/:id/partners', requireAuth, async (req: AuthedRequest, res) => {
  const b = await repo.getBooking(pool, req.params.id);
  if (!b) throw new HttpError(404, 'booking_not_found');
  const u = req.user!;
  const isPartner = b.price.partners?.some((p) => p.userId === u.id);
  if (b.guestId !== u.id && b.hostId !== u.id && !isPartner && !u.roles.includes('admin')) throw new HttpError(403, 'forbidden');
  // Contatos só depois de pago e confirmado
  const paid = ['confirmed', 'checked_in', 'completed'].includes(b.status);
  res.json({ partners: paid ? await bookingPartnerContacts(pool, b) : [] });
});

const photos = z.array(z.string().max(500)).max(30);
partnersRouter.post('/inspections', requireAuth, async (req: AuthedRequest, res) => {
  const data = z.object({
    bookingId: z.string().optional(), listingId: z.string().optional(), kind: z.enum(['check_in', 'check_out', 'maintenance']),
    checklist: z.record(z.string().max(60), z.boolean()).optional(), notes: z.string().max(3000).optional(), photos,
  }).parse(req.body);
  res.status(201).json(await createInspection(req.user!, data));
});

partnersRouter.get('/inspections', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await listInspections(req.user!, { bookingId: req.query.booking as string | undefined, listingId: req.query.listing as string | undefined }));
});

// ───────────── Equipe ─────────────
partnersRouter.get('/admin/partners', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json(await listPartners(req.query.status as string | undefined));
});

partnersRouter.post('/admin/partners/:userId/decision', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { decision, note } = z.object({ decision: z.enum(['approved', 'rejected', 'suspended']), note: z.string().max(500).optional() }).parse(req.body);
  if (!(await getPartner(pool, req.params.userId))) throw new HttpError(404, 'not_found');
  res.json(await decidePartner(req.user!, req.params.userId, decision, note));
});

partnersRouter.post('/admin/partner-links/:id/fee', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { fee } = z.object({ fee: z.number().positive() }).parse(req.body);
  await setCaretakerFee(req.params.id, fee);
  res.json({ ok: true });
});

partnersRouter.get('/admin/partner-payouts', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  res.json(await payoutReport(req.query.month as string | undefined));
});

partnersRouter.post('/admin/partner-payouts/paid', requireAuth, async (req: AuthedRequest, res) => {
  requireAdmin(req);
  const { ids, ref } = z.object({ ids: z.array(z.string()).min(1).max(500), ref: z.string().min(3).max(200) }).parse(req.body);
  res.json(await markPaid(req.user!, ids, ref));
});

// ───────────── Bot do Telegram (webhook) ─────────────
// Corpo JSON comum; a autenticação é o cabeçalho X-Telegram-Bot-Api-Secret-Token (definido no setWebhook).
export const telegramWebhook = Router();
telegramWebhook.post('/webhooks/telegram', express.json({ limit: '100kb' }), async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  const got = String(req.get('x-telegram-bot-api-secret-token') ?? '');
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return res.status(401).json({ error: 'unauthorized' });
  await handleTelegramUpdate(req.body ?? {}).catch((e) => console.error('[telegram]', (e as Error).message));
  res.json({ ok: true });
});
