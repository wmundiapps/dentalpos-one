// Endpoints públicos: captação de leads da landing page e página de agendamento de cada salão.
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, validate, nowIso, json, addDays, localDate } from '../util.js';
import { rateLimit, verifyTurnstile } from '../security.js';
import { getSlots, hoursText, nextAvailableDays } from '../availability.js';
import { createAppointment, findOrCreateClient, upsertLead } from '../domain.js';
import { createApptCharge, policyText, notifyBooked } from '../payments.js';
import { publicBrand } from '../brand.js';

async function publicSalon(slug) {
  const s = await db.get('SELECT * FROM salons WHERE slug = ?', [slug]);
  if (!s || ['suspended', 'cancelled'].includes(s.status)) throw new HttpError(404, 'Salão não encontrado.');
  return s;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
function cleanUtm(u) {
  if (!u || typeof u !== 'object') return null;
  const out = {};
  for (const k of UTM_KEYS) if (u[k]) out[k] = String(u[k]).slice(0, 120);
  return Object.keys(out).length ? out : null;
}

export default function register(r) {
  r.get('/api/public/config', async () => ({
    turnstile_site_key: cfg.turnstile.siteKey || null,
    trial_days: cfg.trialDays,
    plans: Object.entries(cfg.plans).map(([key, p]) => ({ key, name: p.name, cents: p.cents, staff: p.staff })),
  }));

  // Lead da landing page → entra no funil comercial da própria plataforma (salão "HQ").
  r.post('/api/public/leads', async (ctx) => {
    rateLimit(`lead:${ctx.ip}`, 10, 3600_000);
    if (ctx.body?.website) return { ok: true }; // honeypot: robôs preenchem, humanos não veem
    if (!(await verifyTurnstile(ctx.body?.turnstile, ctx.ip))) throw new HttpError(400, 'Falha na verificação anti-robô. Tente novamente.');
    const d = validate(ctx.body, { name: 'str:2:80', phone: 'phone', email: 'email?', company: 'str?:0:80', city: 'str?:0:80', consent: 'bool' });
    if (!d.consent) throw new HttpError(422, 'Precisamos da sua autorização para entrar em contato (LGPD).');
    const hq = await db.get('SELECT id FROM salons WHERE slug = ?', [cfg.hqSlug]);
    if (!hq) throw new HttpError(503, 'Atendimento comercial indisponível no momento. Tente em instantes.');
    const { created } = await upsertLead(hq.id, {
      ...d, source: String(ctx.body?.source || 'landing').slice(0, 40), utm: cleanUtm(ctx.body?.utm), consent: true, consentIp: ctx.ip,
      notes: ctx.body?.message ? String(ctx.body.message).slice(0, 500) : null,
    });
    return { ok: true, created };
  });

  // ---------- Página de agendamento do salão ----------
  r.get('/api/public/salons/:slug', async (ctx) => {
    const s = await publicSalon(ctx.params.slug);
    const services = await db.all('SELECT id, name, category, description, duration_min, price_cents FROM services WHERE salon_id = ? AND active = 1 ORDER BY category, name', [s.id]);
    const staff = await db.all('SELECT id, name, role, color FROM staff WHERE salon_id = ? AND active = 1 ORDER BY name', [s.id]);
    const links = await db.all('SELECT ss.staff_id, ss.service_id FROM staff_services ss JOIN staff st ON st.id = ss.staff_id WHERE st.salon_id = ?', [s.id]);
    return {
      salon: { name: s.name, city: s.city, address: s.address, phone: s.phone, hours: hoursText(s), deposit_required: !!s.deposit_required, policy: s.deposit_required ? policyText(s) : null, logo: s.logo_path ? `/uploads/${s.logo_path}` : null, timezone: s.timezone, brand: publicBrand(s) },
      services,
      staff: staff.map((x) => ({ ...x, service_ids: links.filter((l) => l.staff_id === x.id).map((l) => l.service_id) })),
      turnstile_site_key: cfg.turnstile.siteKey || null,
    };
  });

  r.get('/api/public/salons/:slug/days', async (ctx) => {
    rateLimit(`slots:${ctx.ip}`, 120, 60_000);
    const s = await publicSalon(ctx.params.slug);
    const days = await nextAvailableDays(s, { serviceId: String(ctx.query.service_id || ''), staffId: ctx.query.staff_id || null, count: 10, scanDays: 30 });
    return { days };
  });

  r.get('/api/public/salons/:slug/slots', async (ctx) => {
    rateLimit(`slots:${ctx.ip}`, 120, 60_000);
    const s = await publicSalon(ctx.params.slug);
    const date = String(ctx.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(422, 'Data inválida.');
    const today = localDate(new Date(), s.timezone);
    if (date < today || date > addDays(today, 90)) return { slots: [] };
    const slots = await getSlots(s, { serviceId: String(ctx.query.service_id || ''), staffId: ctx.query.staff_id || null, date });
    return { slots: slots.map((x) => ({ time: x.time, startsAt: x.startsAt, staffId: x.staffId, staffName: x.staffName, options: x.options })) };
  });

  // O navegador consulta se o pagamento caiu (id é um uuid não adivinhável; devolve só a situação).
  r.get('/api/public/salons/:slug/appointments/:id/status', async (ctx) => {
    rateLimit(`apptstatus:${ctx.ip}`, 120, 60_000);
    const s = await publicSalon(ctx.params.slug);
    const a = await db.get('SELECT status, pay_status FROM appointments WHERE id = ? AND salon_id = ?', [ctx.params.id, s.id]);
    if (!a) throw new HttpError(404, 'Reserva não encontrada.');
    return { status: a.status, pay_status: a.pay_status };
  });

  r.post('/api/public/salons/:slug/book', async (ctx) => {
    rateLimit(`book:${ctx.ip}`, 10, 3600_000);
    if (ctx.body?.website) return { ok: true };
    if (!(await verifyTurnstile(ctx.body?.turnstile, ctx.ip))) throw new HttpError(400, 'Falha na verificação anti-robô. Tente novamente.');
    const s = await publicSalon(ctx.params.slug);
    const d = validate(ctx.body, { service_id: 'str:1:60', staff_id: 'str?:0:60', starts_at: 'iso', name: 'str:2:80', phone: 'phone', email: 'email?', consent_marketing: 'bool?', cashback_optin: 'bool?', accept_policy: 'bool?', pay_method: 'enum?:PIX,CREDIT_CARD', cpf_cnpj: 'str?:11:18' });
    rateLimit(`book-phone:${d.phone}`, 4, 24 * 3600_000);

    // O horário precisa estar entre os disponíveis calculados no servidor (nunca confiar no cliente).
    const date = localDate(new Date(d.starts_at), s.timezone);
    const slots = await getSlots(s, { serviceId: d.service_id, staffId: d.staff_id || null, date });
    const hit = slots.find((x) => x.startsAt === d.starts_at);
    if (!hit) throw new HttpError(409, 'Esse horário não está mais disponível. Escolha outro.');
    const staffId = d.staff_id || hit.staffId;

    const client = await db.tx(async (t) => {
      const c = await findOrCreateClient(t, s.id, { name: d.name, phone: d.phone, email: d.email, source: 'pagina-agendamento' });
      if (d.consent_marketing && !c.consent_marketing) await t.run('UPDATE clients SET consent_marketing = 1, consent_at = ? WHERE id = ?', [nowIso(), c.id]);
      if (d.cashback_optin && !c.cashback_optin) await t.run('UPDATE clients SET cashback_optin = 1, cashback_optin_at = ? WHERE id = ?', [nowIso(), c.id]);
      return c;
    });
    if (!s.deposit_required) {
      const appt = await createAppointment(s, { clientId: client.id, staffId, serviceId: d.service_id, startsAt: d.starts_at, source: 'pagina-agendamento' });
      notifyBooked(s, appt); // sem await: a resposta ao cliente não espera o WhatsApp
      return { ok: true, appointment: { id: appt.id, starts_at: appt.starts_at, ends_at: appt.ends_at } };
    }

    // Reserva paga: exige aceite da política e pagamento antecipado (Pix ou cartão) pelo Asaas do salão.
    if (!d.accept_policy) throw new HttpError(422, 'É preciso aceitar a política de não comparecimento para reservar.');
    const doc = String(d.cpf_cnpj || '').replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) throw new HttpError(422, 'Informe um CPF ou CNPJ válido para o pagamento.');
    const appt = await createAppointment(s, {
      clientId: client.id, staffId, serviceId: d.service_id, startsAt: d.starts_at, source: 'pagina-agendamento',
      status: 'pending_payment', policyAcceptedAt: nowIso(),
    });
    try {
      const charge = await createApptCharge(s, appt, client, { cpfCnpj: doc, billingType: d.pay_method || 'PIX' });
      return { ok: true, pending_payment: true, appointment: { id: appt.id, starts_at: appt.starts_at, ends_at: appt.ends_at, price_cents: appt.price_cents }, payment: charge, hold_minutes: 15 };
    } catch (e) {
      await db.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [appt.id]); // não deixa o horário preso
      throw new HttpError(e.status || 502, e.status ? e.message : 'Não foi possível gerar o pagamento agora. Tente novamente em instantes.');
    }
  });
}
