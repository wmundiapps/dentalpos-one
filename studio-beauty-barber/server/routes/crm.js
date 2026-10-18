// Funil comercial (leads), caixa de entrada (conversas) e campanhas.
import { db } from '../db.js';
import { HttpError, validate, uid, nowIso, json } from '../util.js';
import { auth, audit } from '../auth.js';
import { sendOut, storeMessage, CHANNELS } from '../messaging.js';
import { buildAudience, launchCampaign, CAMPAIGN_CHANNELS, render, firstName } from '../campaigns.js';
import { assertSafeOutbound } from '../security.js';
import { allowedDomains } from '../messaging.js';
import { findOrCreateClient } from '../domain.js';

const STAGES = 'new,contacted,scheduled,won,lost';

export default function register(r) {
  // ---------- Leads ----------
  r.get('/api/leads', auth(), async (ctx) => {
    const stage = ctx.query.stage;
    const rows = stage
      ? await db.all('SELECT * FROM leads WHERE salon_id = ? AND stage = ? ORDER BY updated_at DESC LIMIT 300', [ctx.salon.id, stage])
      : await db.all('SELECT * FROM leads WHERE salon_id = ? ORDER BY updated_at DESC LIMIT 500', [ctx.salon.id]);
    return { leads: rows.map((l) => ({ ...l, utm: json(l.utm_json, null) })) };
  });
  r.post('/api/leads', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', phone: 'phone?', email: 'email?', company: 'str?:0:80', city: 'str?:0:80', source: 'str?:0:40', value_cents: 'int?:0:100000000', notes: 'str?:0:1000', consent: 'bool?' });
    const id = uid(), now = nowIso();
    await db.run(
      `INSERT INTO leads (id, salon_id, name, phone, email, company, city, source, stage, value_cents, notes, consent, consent_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.salon.id, d.name, d.phone, d.email, d.company, d.city, d.source ?? 'manual', 'new', d.value_cents ?? 0, d.notes, d.consent ?? 0, d.consent ? now : null, now, now]);
    return { id };
  });
  r.patch('/api/leads/:id', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { stage: `enum?:${STAGES}`, value_cents: 'int?:0:100000000', notes: 'str?:0:1000', owner_id: 'str?:0:60', next_action_at: 'iso?' });
    const res = await db.run(
      `UPDATE leads SET stage = COALESCE(?, stage), value_cents = COALESCE(?, value_cents), notes = COALESCE(?, notes),
         owner_id = COALESCE(?, owner_id), next_action_at = COALESCE(?, next_action_at), updated_at = ? WHERE id = ? AND salon_id = ?`,
      [d.stage, d.value_cents, d.notes, d.owner_id, d.next_action_at, nowIso(), ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Lead não encontrado.');
    await audit(ctx, 'lead_updated', 'lead', ctx.params.id, d);
    return { ok: true };
  });
  r.post('/api/leads/:id/convert', auth('reception'), async (ctx) => {
    const l = await db.get('SELECT * FROM leads WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!l) throw new HttpError(404, 'Lead não encontrado.');
    const client = await db.tx(async (t) => {
      const c = await findOrCreateClient(t, ctx.salon.id, { name: l.name, phone: l.phone, email: l.email, source: l.source });
      if (l.consent) await t.run('UPDATE clients SET consent_marketing = 1, consent_at = COALESCE(consent_at, ?) WHERE id = ?', [l.consent_at ?? nowIso(), c.id]);
      await t.run("UPDATE leads SET stage = 'won', updated_at = ? WHERE id = ?", [nowIso(), l.id]);
      return c;
    });
    await audit(ctx, 'lead_converted', 'lead', l.id);
    return { client_id: client.id };
  });

  // ---------- Conversas (caixa de entrada unificada) ----------
  r.get('/api/conversations', auth(), async (ctx) => {
    const rows = await db.all(
      `SELECT c.*, (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
         FROM conversations c WHERE c.salon_id = ? ORDER BY c.last_message_at DESC LIMIT 100`, [ctx.salon.id]);
    return { conversations: rows.map((c) => ({ ...c, state_json: undefined })) };
  });
  r.get('/api/conversations/:id', auth(), async (ctx) => {
    const c = await db.get('SELECT * FROM conversations WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Conversa não encontrada.');
    const messages = await db.all('SELECT id, direction, sender, body, status, error, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT 300', [c.id]);
    await db.run('UPDATE conversations SET unread = 0 WHERE id = ?', [c.id]);
    return { conversation: { ...c, state_json: undefined }, messages };
  });
  r.post('/api/conversations/:id/reply', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { body: 'str:1:1500' });
    const c = await db.get('SELECT * FROM conversations WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Conversa não encontrada.');
    const res = await sendOut(ctx.salon, { channel: c.channel, to: c.external_id, body: d.body, kind: 'reply', conversation: c, sender: 'agent' });
    if (res.status === 'blocked') throw new HttpError(422, res.error);
    await db.run("UPDATE conversations SET mode = 'human' WHERE id = ?", [c.id]);
    return { status: res.status, error: res.error ?? null };
  });
  r.post('/api/conversations/:id/mode', auth('reception'), async (ctx) => {
    const d = validate(ctx.body, { mode: 'enum:bot,human' });
    const res = await db.run('UPDATE conversations SET mode = ?, state_json = NULL WHERE id = ? AND salon_id = ?', [d.mode, ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(404, 'Conversa não encontrada.');
    return { ok: true };
  });

  // ---------- Campanhas ----------
  r.get('/api/campaigns', auth('manager'), async (ctx) => ({
    campaigns: await db.all('SELECT * FROM campaigns WHERE salon_id = ? ORDER BY created_at DESC LIMIT 100', [ctx.salon.id]),
  }));
  r.post('/api/campaigns/preview', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { channel: `enum:${CAMPAIGN_CHANNELS.join(',')}`, body: 'str:1:1000' });
    const seg = ctx.body?.segment || {};
    const audience = await buildAudience(ctx.salon, d.channel, seg);
    let blocked = null;
    try { assertSafeOutbound(d.body, allowedDomains(ctx.salon)); } catch (e) { blocked = e.message; }
    const sample = audience[0] ? render(d.body, { nome: firstName(audience[0].name), salao: ctx.salon.name }) : null;
    return { eligible: audience.length, sample, blocked };
  });
  r.post('/api/campaigns', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, { name: 'str:2:80', channel: `enum:${CAMPAIGN_CHANNELS.join(',')}`, subject: 'str?:0:120', body: 'str:5:1000', scheduled_at: 'iso?' });
    assertSafeOutbound(d.body, allowedDomains(ctx.salon));
    if (['whatsapp', 'sms'].includes(d.channel) && !/PARAR|SAIR/i.test(d.body)) {
      d.body += '\n\nPara não receber mais mensagens, responda PARAR.';
    }
    const id = uid();
    await db.run(
      `INSERT INTO campaigns (id, salon_id, name, channel, subject, body, segment_json, status, scheduled_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, ctx.salon.id, d.name, d.channel, d.subject, d.body, JSON.stringify(ctx.body?.segment || {}), 'draft', d.scheduled_at, ctx.user.id, nowIso()]);
    await audit(ctx, 'campaign_created', 'campaign', id);
    return { id };
  });
  r.post('/api/campaigns/:id/launch', auth('manager'), async (ctx) => {
    const c = await db.get('SELECT * FROM campaigns WHERE id = ? AND salon_id = ?', [ctx.params.id, ctx.salon.id]);
    if (!c) throw new HttpError(404, 'Campanha não encontrada.');
    const n = await launchCampaign(ctx.salon, c);
    await audit(ctx, 'campaign_launched', 'campaign', c.id, { recipients: n });
    return { recipients: n };
  });
  r.post('/api/campaigns/:id/pause', auth('manager'), async (ctx) => {
    const res = await db.run("UPDATE campaigns SET status = 'paused' WHERE id = ? AND salon_id = ? AND status IN ('running','scheduled')", [ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(409, 'A campanha não está em andamento.');
    return { ok: true };
  });
  r.post('/api/campaigns/:id/resume', auth('manager'), async (ctx) => {
    const res = await db.run("UPDATE campaigns SET status = 'running' WHERE id = ? AND salon_id = ? AND status = 'paused'", [ctx.params.id, ctx.salon.id]);
    if (!res.changes) throw new HttpError(409, 'A campanha não está pausada.');
    return { ok: true };
  });
}
