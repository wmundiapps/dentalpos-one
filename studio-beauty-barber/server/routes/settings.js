// Perfil do salão, integrações, assinatura e upload de logo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, validate, nowIso, json, uid, localDate } from '../util.js';
import { auth, audit } from '../auth.js';
import { DEFAULT_HOURS } from '../availability.js';
import { automations } from '../scheduler.js';
import { KINDS, listIntegrations, saveIntegration, removeIntegration, getIntegration } from '../integrations/store.js';
import { sendOut } from '../messaging.js';
import { sniffImage, scanWithClamav, rateLimit } from '../security.js';
import { readBody } from '../http.js';
import * as stripe from '../integrations/stripe.js';
import * as asaas from '../integrations/asaas.js';
import { upsertLead } from '../domain.js';

export const UPLOAD_DIR = join(process.env.UPLOAD_DIR || './data', 'uploads');

function validHours(h) {
  if (!h || typeof h !== 'object') return null;
  const out = {};
  for (let d = 0; d < 7; d++) {
    const v = h[d] ?? h[String(d)];
    if (!v) { out[d] = null; continue; }
    if (!Array.isArray(v) || !/^\d{2}:\d{2}$/.test(v[0]) || !/^\d{2}:\d{2}$/.test(v[1]) || v[0] >= v[1]) throw new HttpError(422, `Horário inválido no dia ${d}.`);
    out[d] = [v[0], v[1]];
  }
  return out;
}

export default function register(r) {
  // ---------- Perfil do salão ----------
  r.get('/api/settings', auth(), async (ctx) => {
    const s = ctx.salon;
    return {
      salon: {
        name: s.name, slug: s.slug, phone: s.phone, email: s.email, address: s.address, city: s.city, timezone: s.timezone,
        hours: json(s.hours_json, DEFAULT_HOURS), allowed_domains: s.allowed_domains || '', bot_enabled: !!s.bot_enabled,
        quiet_start: s.quiet_start, quiet_end: s.quiet_end, logo: s.logo_path ? `/uploads/${s.logo_path}` : null,
        automations: automations(s), booking_url: `${cfg.appUrl}/s/${s.slug}`,
        deposit_required: !!s.deposit_required, noshow_retention_pct: s.noshow_retention_pct, free_cancel_hours: s.free_cancel_hours,
      },
    };
  });
  r.patch('/api/settings', auth('manager'), async (ctx) => {
    const d = validate(ctx.body, {
      name: 'str?:2:80', phone: 'phone?', email: 'email?', address: 'str?:0:200', city: 'str?:0:80',
      allowed_domains: 'str?:0:300', bot_enabled: 'bool?', quiet_start: 'int?:0:23', quiet_end: 'int?:0:23',
      deposit_required: 'bool?', noshow_retention_pct: 'int?:0:100', free_cancel_hours: 'int?:0:168',
    });
    const hours = ctx.body?.hours ? validHours(ctx.body.hours) : null;
    let brand = json(ctx.salon.brand_json, {});
    if (ctx.body?.automations && typeof ctx.body.automations === 'object') {
      const a = ctx.body.automations;
      brand = { ...brand, automations: { ...automations(ctx.salon), reminders: !!a.reminders, birthday: !!a.birthday, reactivation: !!a.reactivation } };
    }
    await db.run(
      `UPDATE salons SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), address = COALESCE(?, address),
         city = COALESCE(?, city), allowed_domains = COALESCE(?, allowed_domains), bot_enabled = COALESCE(?, bot_enabled),
         quiet_start = COALESCE(?, quiet_start), quiet_end = COALESCE(?, quiet_end),
         deposit_required = COALESCE(?, deposit_required), noshow_retention_pct = COALESCE(?, noshow_retention_pct), free_cancel_hours = COALESCE(?, free_cancel_hours),
         hours_json = COALESCE(?, hours_json), brand_json = ? WHERE id = ?`,
      [d.name, d.phone, d.email, d.address, d.city, d.allowed_domains?.toLowerCase() ?? null, d.bot_enabled, d.quiet_start, d.quiet_end, d.deposit_required, d.noshow_retention_pct, d.free_cancel_hours,
        hours ? JSON.stringify(hours) : null, JSON.stringify(brand), ctx.salon.id]);
    await audit(ctx, 'settings_updated', 'salon', ctx.salon.id);
    return { ok: true };
  });

  // Upload de logo: valida assinatura do arquivo (PNG/JPG/WEBP), limita tamanho e passa no antivírus (ClamAV) quando configurado.
  r.post('/api/settings/logo', auth('manager'), async (ctx) => {
    rateLimit(`upload:${ctx.user.id}`, 10, 3600_000);
    const buf = ctx.rawBody;
    if (!buf?.length) throw new HttpError(422, 'Envie a imagem no corpo da requisição.');
    if (buf.length > cfg.maxUploadBytes) throw new HttpError(413, 'Imagem maior que 2 MB.');
    const kind = sniffImage(buf);
    if (!kind) throw new HttpError(415, 'Formato não permitido. Use PNG, JPG ou WEBP.');
    const scan = await scanWithClamav(buf);
    if (!scan.clean) {
      await audit(ctx, 'upload_infected', 'salon', ctx.salon.id, { detail: scan.detail });
      throw new HttpError(422, 'Arquivo bloqueado pelo antivírus.');
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${ctx.salon.id}-${uid().slice(0, 8)}.${kind.ext}`;
    writeFileSync(join(UPLOAD_DIR, name), buf);
    await db.run('UPDATE salons SET logo_path = ? WHERE id = ?', [name, ctx.salon.id]);
    await audit(ctx, 'logo_uploaded', 'salon', ctx.salon.id, { scanned: scan.scanned });
    return { logo: `/uploads/${name}`, scanned: scan.scanned };
  });

  // ---------- Integrações (cada salão usa as próprias contas e paga os créditos direto às operadoras) ----------
  r.get('/api/integrations', auth('manager'), async (ctx) => ({
    integrations: await listIntegrations(ctx.salon.id),
    webhooks: {
      meta: `${cfg.baseUrl}/webhooks/meta`,
      meta_verify_token: cfg.meta.verifyToken,
      asaas: `${cfg.baseUrl}/webhooks/asaas/${ctx.salon.id}`,
    },
    note: 'Créditos de WhatsApp, SMS e ligações são cobrados diretamente pela operadora/plataforma de cada serviço, na conta do próprio salão.',
  }));
  r.put('/api/integrations/:kind', auth('owner'), async (ctx) => {
    if (!KINDS[ctx.params.kind]) throw new HttpError(404, 'Integração desconhecida.');
    await saveIntegration(ctx.salon.id, ctx.params.kind, ctx.body || {});
    await audit(ctx, 'integration_saved', 'integration', ctx.params.kind);
    return { ok: true };
  });
  r.delete('/api/integrations/:kind', auth('owner'), async (ctx) => {
    await removeIntegration(ctx.salon.id, ctx.params.kind);
    await audit(ctx, 'integration_removed', 'integration', ctx.params.kind);
    return { ok: true };
  });
  r.post('/api/integrations/:kind/test', auth('owner'), async (ctx) => {
    const kind = ctx.params.kind;
    if (!['whatsapp', 'sms', 'email', 'facebook', 'instagram'].includes(kind)) throw new HttpError(422, 'Teste não disponível para esta integração.');
    const to = String(ctx.body?.to || '').trim();
    if (!to) throw new HttpError(422, 'Informe o destino do teste (telefone com DDD ou e-mail).');
    const dest = kind === 'email' ? to : to.replace(/\D/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1');
    const res = await sendOut(ctx.salon, { channel: kind, to: dest, body: `Teste de conexão do ${ctx.salon.name} ✅`, subject: 'Teste de conexão', kind: 'reply', sender: 'system' });
    return res;
  });

  // ---------- Assinatura da plataforma ----------
  r.get('/api/billing', auth(), async (ctx) => {
    const sub = await db.get('SELECT * FROM subscriptions WHERE salon_id = ? ORDER BY created_at DESC LIMIT 1', [ctx.salon.id]);
    return {
      status: ctx.salon.status, plan: ctx.salon.plan, trial_ends_at: ctx.salon.trial_ends_at, subscription: sub ?? null,
      plans: Object.entries(cfg.plans).map(([key, p]) => ({ key, ...p })),
      providers: { stripe: stripe.stripeEnabled(), asaas: !!asaas.platformConf() },
    };
  });
  r.post('/api/billing/checkout', auth('owner'), async (ctx) => {
    const d = validate(ctx.body, { plan: 'enum:smart,pequeno,medio,grande', provider: 'enum:stripe,asaas', billing_type: 'enum?:PIX,BOLETO,CREDIT_CARD,UNDEFINED', cpf_cnpj: 'str?:11:18' });
    const plan = cfg.plans[d.plan];
    const salon = ctx.salon;
    const owner = await db.get('SELECT email, name FROM users WHERE id = ?', [ctx.user.id]);

    if (d.provider === 'stripe') {
      if (!stripe.stripeEnabled()) throw new HttpError(503, 'Stripe ainda não está configurado no servidor.');
      const session = await stripe.createCheckoutSession({
        salonId: salon.id, plan: d.plan, email: owner.email,
        successUrl: `${cfg.appUrl}/#/assinatura?ok=1`, cancelUrl: `${cfg.appUrl}/#/assinatura?cancel=1`,
        trialDays: salon.status === 'trial' && salon.trial_ends_at > nowIso() ? Math.ceil((Date.parse(salon.trial_ends_at) - Date.now()) / 86400_000) : 0,
      });
      await db.run('INSERT INTO subscriptions (id, salon_id, plan, provider, provider_ref, status, created_at) VALUES (?,?,?,?,?,?,?)', [uid(), salon.id, d.plan, 'stripe', session.id, 'pending', nowIso()]);
      await audit(ctx, 'checkout_started', 'subscription', session.id, { provider: 'stripe', plan: d.plan });
      return { url: session.url };
    }

    const conf = asaas.platformConf();
    if (!conf) throw new HttpError(503, 'Asaas ainda não está configurado no servidor.');
    const customerId = salon.asaas_customer_id
      || (await asaas.createCustomer(conf, { name: salon.name, email: owner.email, cpfCnpj: d.cpf_cnpj?.replace(/\D/g, ''), phone: salon.phone })).id;
    if (!salon.asaas_customer_id) await db.run('UPDATE salons SET asaas_customer_id = ? WHERE id = ?', [customerId, salon.id]);
    const firstDue = salon.status === 'trial' && salon.trial_ends_at > nowIso() ? salon.trial_ends_at.slice(0, 10) : localDate(new Date(Date.now() + 86400_000), salon.timezone);
    const sub = await asaas.createSubscription(conf, {
      customer: customerId, billingType: d.billing_type || 'UNDEFINED', valueCents: plan.cents, nextDueDate: firstDue,
      description: `Studio Beauty Barber — plano ${plan.name}`, externalReference: `salon:${salon.id}:${d.plan}`,
    });
    await db.run('INSERT INTO subscriptions (id, salon_id, plan, provider, provider_ref, status, created_at) VALUES (?,?,?,?,?,?,?)', [uid(), salon.id, d.plan, 'asaas', sub.id, 'pending', nowIso()]);
    await audit(ctx, 'checkout_started', 'subscription', sub.id, { provider: 'asaas', plan: d.plan });
    return { subscription_id: sub.id, message: 'Assinatura criada. O Asaas enviará a cobrança por e-mail.', first_due: firstDue };
  });
}
