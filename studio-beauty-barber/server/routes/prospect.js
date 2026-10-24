// Captação (somente salão comercial/HQ): busca de empresas pela Receita, funil, Excel com WhatsApp e convite por e-mail agendado.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, validate, uid, nowIso, json, localHour, localDate, zonedToUtc, addDays, escapeHtml } from '../util.js';
import { auth, audit } from '../auth.js';
import { rateLimit } from '../security.js';
import * as P from '../prospect.js';

const isHq = (salon) => salon.slug === cfg.hqSlug;
const hqOnly = () => async (ctx) => { if (!isHq(ctx.salon)) throw new HttpError(403, 'Recurso disponível apenas para o salão comercial.'); };
const needTerms = async (ctx) => { if (!(await P.termsAccepted(ctx.salon))) throw new HttpError(402, 'Aceite o termo de responsabilidade para usar a captação.'); };

export default function register(r) {
  r.get('/api/prospect/status', auth('manager'), hqOnly(), async (ctx) => ({
    base: await P.baseStatus(), segments: P.SEGMENTS, terms: { version: P.TERMS_VERSION, text: P.TERMS_TEXT, accepted: await P.termsAccepted(ctx.salon) },
    email_ready: !!(await db.get("SELECT 1 AS x FROM integrations WHERE salon_id = ? AND kind = 'email'", [ctx.salon.id])),
  }));

  r.post('/api/prospect/terms', auth('owner'), hqOnly(), async (ctx) => {
    const d = validate(ctx.body, { signer_name: 'str:3:100', signer_document: 'str:11:18' });
    const brand = json(ctx.salon.brand_json, {});
    brand.prospect_terms = { version: P.TERMS_VERSION, hash: P.termsHash(), signer_name: d.signer_name, signer_document: P.digits(d.signer_document), user_id: ctx.user.id, ip: ctx.ip, accepted_at: nowIso() };
    await db.run('UPDATE salons SET brand_json = ? WHERE id = ?', [JSON.stringify(brand), ctx.salon.id]);
    await audit(ctx, 'prospect_terms_accepted', 'salon', ctx.salon.id, { version: P.TERMS_VERSION });
    return { ok: true };
  });

  r.post('/api/prospect/search', auth('manager'), hqOnly(), needTerms, async (ctx) => {
    rateLimit(`prospect:${ctx.user.id}`, 60, 3600_000);
    const d = validate(ctx.body, { uf: 'str?:2:2', city: 'str?:0:80', mei: 'enum?:ALL,ONLY,EXCLUDE', limit: 'int?:1:200' });
    const cnaes = Array.isArray(ctx.body?.cnaes) ? ctx.body.cnaes.map(String).slice(0, 10) : [];
    const status = await P.baseStatus();
    if (!status.available) throw new HttpError(409, 'A base da Receita ainda não foi carregada. Veja as instruções em Captação.');
    const results = await P.searchCompanies(ctx.salon.id, { cnaes, uf: d.uf, city: d.city, mei: d.mei || 'ALL', limit: d.limit || 50 });
    await audit(ctx, 'prospect_search', 'salon', ctx.salon.id, { cnaes, uf: d.uf, city: d.city, found: results.length });
    return { results };
  });

  r.post('/api/prospect/lookup', auth('manager'), hqOnly(), needTerms, async (ctx) => {
    rateLimit(`prospect-lookup:${ctx.user.id}`, 60, 3600_000);
    const d = validate(ctx.body, { cnpj: 'str:11:20' });
    return { company: await P.lookupCompany(d.cnpj) };
  });

  // O servidor só confia nos documentos recebidos: relê cada empresa na base (ou na consulta oficial) antes de salvar.
  r.post('/api/prospect/save', auth('manager'), hqOnly(), needTerms, async (ctx) => {
    const docs = (Array.isArray(ctx.body?.documents) ? ctx.body.documents : []).map(P.digits).filter((x) => x.length === 14).slice(0, 200);
    if (!docs.length) throw new HttpError(422, 'Escolha ao menos uma empresa.');
    const companies = [];
    for (const doc of docs) { try { companies.push(await P.lookupCompany(doc)); } catch { /* pula */ } }
    const out = await P.saveAsLeads(ctx.salon.id, companies);
    await audit(ctx, 'prospect_saved', 'salon', ctx.salon.id, out);
    return out;
  });

  r.get('/api/prospect/export', auth('manager'), hqOnly(), needTerms, async (ctx) => {
    const rows = await db.all("SELECT * FROM leads WHERE salon_id = ? AND source = 'cnpj_public' AND stage <> 'lost' ORDER BY created_at DESC LIMIT 2000", [ctx.salon.id]);
    await audit(ctx, 'prospect_export', 'salon', ctx.salon.id, { rows: rows.length });
    return ctx.csv(`captacao-${localDate(new Date(), ctx.salon.timezone)}.csv`, P.leadsCsv(rows));
  });

  r.post('/api/prospect/optout', auth('manager'), hqOnly(), async (ctx) => {
    const ids = (Array.isArray(ctx.body?.lead_ids) ? ctx.body.lead_ids : []).map(String).slice(0, 200);
    const n = await P.optOutLeads(ctx.salon.id, ids);
    await audit(ctx, 'prospect_optout', 'salon', ctx.salon.id, { n });
    return { optedOut: n };
  });

  // Convite por e-mail agendado: espalha os envios em horário comercial, no máximo "por dia" por dia útil.
  r.post('/api/prospect/invites', auth('manager'), hqOnly(), needTerms, async (ctx) => {
    const d = validate(ctx.body, { subject: 'str:5:120', body: 'str:20:2000', per_day: 'int?:1:100', start_date: 'date?' });
    const ids = (Array.isArray(ctx.body?.lead_ids) ? ctx.body.lead_ids : []).map(String).slice(0, 500);
    if (!(await db.get("SELECT 1 AS x FROM integrations WHERE salon_id = ? AND kind = 'email'", [ctx.salon.id]))) throw new HttpError(409, 'Conecte o e-mail (Resend) em Integrações antes de agendar convites.');
    const leads = await P.withoutBlocked(ctx.salon.id, (await Promise.all(ids.map((id) => db.get("SELECT * FROM leads WHERE id = ? AND salon_id = ? AND email IS NOT NULL AND stage <> 'lost'", [id, ctx.salon.id])))).filter(Boolean).map((l) => ({ ...l })));
    if (!leads.length) throw new HttpError(422, 'Nenhum lead com e-mail disponível.');
    const perDay = d.per_day || 30, tz = ctx.salon.timezone;
    let day = d.start_date || addDays(localDate(new Date(), tz), 1), slot = 0, scheduled = 0;
    const isWeekend = (ds) => { const w = new Date(`${ds}T12:00:00Z`).getUTCDay(); return w === 0 || w === 6; };
    for (const l of leads) {
      while (isWeekend(day)) day = addDays(day, 1);
      const minute = 9 * 60 + Math.floor((slot * 8 * 60) / perDay);
      const at = zonedToUtc(day, `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, tz);
      await db.run('INSERT INTO prospect_invites (id, salon_id, lead_id, email, subject, body, token, scheduled_at, status) VALUES (?,?,?,?,?,?,?,?,?)',
        [uid(), ctx.salon.id, l.id, l.email, d.subject, d.body, randomBytes(18).toString('base64url'), at, 'scheduled']);
      scheduled++; slot++;
      if (slot >= perDay) { slot = 0; day = addDays(day, 1); }
    }
    await audit(ctx, 'prospect_invites_scheduled', 'salon', ctx.salon.id, { scheduled });
    return { scheduled, until: day };
  });

  r.get('/api/prospect/invites', auth('manager'), hqOnly(), async (ctx) => ({
    summary: await db.all('SELECT status, COUNT(*) AS n FROM prospect_invites WHERE salon_id = ? GROUP BY status', [ctx.salon.id]),
  }));

  // Pedido de sair, pelo link do e-mail (público): bloqueia para sempre e cancela os envios pendentes.
  r.get('/api/public/optout/:token', async (ctx) => {
    rateLimit(`optout:${ctx.ip}`, 60, 3600_000);
    const inv = await db.get('SELECT * FROM prospect_invites WHERE token = ?', [String(ctx.params.token).slice(0, 80)]);
    if (inv) await P.optOutLeads(inv.salon_id, [inv.lead_id]);
    return ctx.html('<h1 style="font:600 22px Georgia,serif">Pronto.</h1><p style="font:16px system-ui">Você não receberá mais mensagens nossas.</p>');
  });
}
