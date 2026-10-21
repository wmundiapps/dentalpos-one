// Webhooks de entrada: Meta (WhatsApp/Instagram/Facebook), Stripe e Asaas.
// Regra de ouro: validar assinatura/token ANTES de qualquer efeito; processar de forma idempotente.
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, uid, nowIso, json } from '../util.js';
import { verifyMetaSignature, verifyStripeSignature, safeEqual } from '../security.js';
import { salonByExtKey, getIntegration } from '../integrations/store.js';
import { handleInbound } from '../bot.js';
import { settleSale } from '../domain.js';
import * as asaas from '../integrations/asaas.js';
import { confirmApptPayment } from '../payments.js';

async function firstTime(provider, eventId) {
  if (!eventId) return true;
  try {
    await db.run('INSERT INTO webhook_events (id, provider, event_id, received_at) VALUES (?,?,?,?)', [uid(), provider, String(eventId).slice(0, 200), nowIso()]);
    return true;
  } catch { return false; }
}

// Se o processamento falhar, libera o evento para o provedor poder reenviar (senão o pagamento ficaria perdido).
async function releaseEvent(provider, eventId) {
  if (eventId) await db.run('DELETE FROM webhook_events WHERE provider = ? AND event_id = ?', [provider, String(eventId).slice(0, 200)]).catch(() => {});
}

async function salonById(id) { return db.get('SELECT * FROM salons WHERE id = ?', [id]); }

// ---------- Meta ----------
async function processMeta(payload) {
  const obj = payload.object;
  for (const entry of payload.entry || []) {
    if (obj === 'whatsapp_business_account') {
      for (const ch of entry.changes || []) {
        const v = ch.value || {};
        const salonId = await salonByExtKey('whatsapp', v.metadata?.phone_number_id);
        if (!salonId) continue;
        const salon = await salonById(salonId);
        for (const st of v.statuses || []) {
          const map = { sent: 'sent', delivered: 'delivered', read: 'delivered', failed: 'failed' };
          if (map[st.status]) await db.run('UPDATE messages SET status = ? WHERE provider_id = ? AND salon_id = ?', [map[st.status], st.id, salonId]);
        }
        for (const m of v.messages || []) {
          if (!(await firstTime('meta-msg', m.id))) continue;
          const name = (v.contacts || []).find((c) => c.wa_id === m.from)?.profile?.name || null;
          const text = m.type === 'text' ? m.text?.body
            : m.type === 'button' ? m.button?.text
            : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title) : null;
          if (!text) { // áudio, imagem etc.: o robô só lê texto
            await handleInbound(salon, { channel: 'whatsapp', externalId: m.from, name, text: `[${m.type}] — o cliente enviou um conteúdo que o robô não lê. Responda "atendente" para falar com a equipe.`, providerId: m.id });
            continue;
          }
          await handleInbound(salon, { channel: 'whatsapp', externalId: m.from, name, text, providerId: m.id });
        }
      }
    } else if (obj === 'page' || obj === 'instagram') {
      const kind = obj === 'page' ? 'facebook' : 'instagram';
      for (const ev of entry.messaging || []) {
        if (!ev.message || ev.message.is_echo || !ev.message.text) continue;
        const salonId = await salonByExtKey(kind, ev.recipient?.id);
        if (!salonId) continue;
        if (!(await firstTime('meta-msg', ev.message.mid))) continue;
        await handleInbound(await salonById(salonId), { channel: kind, externalId: ev.sender.id, text: ev.message.text, providerId: ev.message.mid });
      }
    }
  }
}

export default function register(r) {
  r.get('/webhooks/meta', async (ctx) => {
    const q = ctx.query;
    if (q['hub.mode'] === 'subscribe' && safeEqual(q['hub.verify_token'] || '', cfg.meta.verifyToken)) {
      return ctx.text(200, String(q['hub.challenge'] || ''));
    }
    throw new HttpError(403, 'Token de verificação inválido.');
  });

  r.post('/webhooks/meta', async (ctx) => {
    if (!verifyMetaSignature(ctx.rawBody.toString('utf8'), ctx.req.headers['x-hub-signature-256'])) throw new HttpError(403, 'Assinatura inválida.');
    const payload = json(ctx.rawBody.toString('utf8'), null);
    if (!payload) throw new HttpError(400, 'JSON inválido.');
    // Responde 200 já (a Meta reenvia se demorar) e processa em seguida.
    const work = processMeta(payload).catch((e) => console.error('[meta] erro:', e.message));
    if (ctx.awaitWebhooks) await work;
    return { ok: true };
  });

  // ---------- Stripe (assinaturas da plataforma) ----------
  r.post('/webhooks/stripe', async (ctx) => {
    if (!verifyStripeSignature(ctx.rawBody.toString('utf8'), ctx.req.headers['stripe-signature'])) throw new HttpError(400, 'Assinatura inválida.');
    const ev = json(ctx.rawBody.toString('utf8'), null);
    if (!ev?.id) throw new HttpError(400, 'Evento inválido.');
    if (!(await firstTime('stripe', ev.id))) return { ok: true, duplicate: true };
    try {
    const obj = ev.data?.object || {};
    const salonId = obj.metadata?.salon_id || obj.client_reference_id || obj.subscription_details?.metadata?.salon_id || null;

    if (ev.type === 'checkout.session.completed' && salonId) {
      const plan = obj.metadata?.plan && cfg.plans[obj.metadata.plan] ? obj.metadata.plan : 'smart';
      await db.run("UPDATE salons SET status = 'active', plan = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?", [plan, obj.customer ?? null, salonId]);
      await db.run("UPDATE subscriptions SET status = 'active', plan = ? WHERE provider = 'stripe' AND provider_ref = ?", [plan, obj.id]);
    } else if (ev.type === 'invoice.paid' && obj.customer) {
      await db.run("UPDATE salons SET status = 'active' WHERE stripe_customer_id = ?", [obj.customer]);
    } else if (ev.type === 'invoice.payment_failed' && obj.customer) {
      await db.run("UPDATE salons SET status = 'past_due' WHERE stripe_customer_id = ?", [obj.customer]);
    } else if (ev.type === 'customer.subscription.deleted' && obj.customer) {
      await db.run("UPDATE salons SET status = 'suspended' WHERE stripe_customer_id = ?", [obj.customer]);
    }
    return { ok: true };
    } catch (e) { await releaseEvent('stripe', ev.id); throw e; }
  });

  // ---------- Asaas: cobrança dos assinantes da plataforma ----------
  r.post('/webhooks/asaas', async (ctx) => {
    if (!cfg.asaas.webhookToken || !safeEqual(ctx.req.headers['asaas-access-token'] || '', cfg.asaas.webhookToken)) throw new HttpError(401, 'Token inválido.');
    const ev = ctx.body;
    if (!ev?.event) throw new HttpError(400, 'Evento inválido.');
    const evKey = ev.id || `${ev.event}:${ev.payment?.id}`;
    if (!(await firstTime('asaas', evKey))) return { ok: true, duplicate: true };
    try {
    const conf = asaas.platformConf();
    const payId = ev.payment?.id;
    if (!payId || !conf) return { ok: true };

    // Confirma o pagamento direto na API do Asaas (não confia só no corpo recebido).
    const pay = await asaas.getPayment(conf, payId);
    let sub = pay.subscription ? await db.get("SELECT * FROM subscriptions WHERE provider = 'asaas' AND provider_ref = ?", [pay.subscription]) : null;
    if (!sub && pay.externalReference?.startsWith('salon:')) {
      const [, salonId, plan] = pay.externalReference.split(':');
      sub = { salon_id: salonId, plan, id: null };
    }
    if (!sub) return { ok: true };
    if (asaas.PAID_EVENTS.has(ev.event)) {
      // Só ativa se o pagamento está quitado e cobre o valor do plano.
      const planCents = cfg.plans[sub.plan]?.cents ?? 0;
      if (!['RECEIVED', 'CONFIRMED'].includes(pay.status) || Math.round(Number(pay.value) * 100) < planCents) return { ok: true, ignored: true };
      await db.run("UPDATE salons SET status = 'active', plan = ? WHERE id = ?", [cfg.plans[sub.plan] ? sub.plan : 'smart', sub.salon_id]);
      if (sub.id) await db.run("UPDATE subscriptions SET status = 'active' WHERE id = ?", [sub.id]);
    } else if (ev.event === 'PAYMENT_OVERDUE') {
      await db.run("UPDATE salons SET status = 'past_due' WHERE id = ? AND status = 'active'", [sub.salon_id]);
    }
    return { ok: true };
    } catch (e) { await releaseEvent('asaas', evKey); throw e; }
  });

  // ---------- Asaas: Pix/cobranças dos clientes do salão (conta Asaas do próprio salão) ----------
  r.post('/webhooks/asaas/:salonId', async (ctx) => {
    const conf = await getIntegration(ctx.params.salonId, 'asaas');
    if (!conf?.webhookToken || !safeEqual(ctx.req.headers['asaas-access-token'] || '', conf.webhookToken)) throw new HttpError(401, 'Token inválido.');
    const ev = ctx.body;
    if (!ev?.event || !ev.payment?.id) return { ok: true };
    const evKey = ev.id || `${ev.event}:${ev.payment.id}`;
    const provider = `asaas-${ctx.params.salonId}`;
    if (!(await firstTime(provider, evKey))) return { ok: true, duplicate: true };
    try {
      if (asaas.PAID_EVENTS.has(ev.event)) {
        // Confirma direto na API do Asaas (não confia no corpo recebido) e só aceita pagamento quitado, com o valor certo.
        const pay = await asaas.getPayment(conf, ev.payment.id);
        const paidCents = Math.round(Number(pay.value) * 100);
        const settled = ['RECEIVED', 'CONFIRMED'].includes(pay.status);
        const sale = pay.externalReference ? await db.get('SELECT * FROM sales WHERE id = ? AND salon_id = ?', [pay.externalReference, ctx.params.salonId]) : null;
        if (sale) {
          if (settled && paidCents === sale.total_cents) await settleSale(sale.id, { method: 'pix' });
          else console.warn('[asaas] venda ignorada: valor ou status não confere', sale.id);
        } else if (String(pay.externalReference || '').startsWith('appt:')) {
          const salon = await db.get('SELECT * FROM salons WHERE id = ?', [ctx.params.salonId]);
          const appt = salon && await db.get('SELECT * FROM appointments WHERE id = ? AND salon_id = ?', [pay.externalReference.slice(5), salon.id]);
          if (appt && settled && pay.id === appt.pay_ref && paidCents === appt.price_cents) await confirmApptPayment(salon, appt.id, paidCents);
          else console.warn('[asaas] reserva ignorada: pagamento não confere', pay.externalReference);
        }
      }
      return { ok: true };
    } catch (e) { await releaseEvent(provider, evKey); throw e; }
  });
}
