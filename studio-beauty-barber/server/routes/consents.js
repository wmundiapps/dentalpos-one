// Base de contatos autorizados (somente salão comercial/HQ): uma aba por empresa, exportação e revogação.
// Outros sistemas da WMundi enviam as autorizações por /api/ingest/consent com a chave da própria empresa.
import { db } from '../db.js';
import { cfg } from '../config.js';
import { HttpError, validate, uid, nowIso, json } from '../util.js';
import { auth, audit } from '../auth.js';
import { rateLimit, newToken, sha256 } from '../security.js';
import { CHANNELS, CONSENT_TEXT, recordConsent, consentsCsv } from '../consents.js';

const hqOnly = () => async (ctx) => { if (ctx.salon.slug !== cfg.hqSlug) throw new HttpError(403, 'Recurso disponível apenas para o salão comercial.'); };

export default function register(r) {
  r.get('/api/consents/companies', auth('manager'), hqOnly(), async () => {
    const rows = await db.all('SELECT company, COUNT(*) AS total, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active FROM contact_consents GROUP BY company ORDER BY company');
    const keys = await db.all('SELECT id, company, last4, created_at, revoked_at FROM consent_sources ORDER BY created_at DESC');
    return { companies: rows.map((x) => ({ company: x.company, total: Number(x.total), active: Number(x.active) })), keys, channels: CHANNELS, text: CONSENT_TEXT };
  });

  r.get('/api/consents', auth('manager'), hqOnly(), async (ctx) => {
    const company = String(ctx.query?.company ?? '');
    if (!company) throw new HttpError(422, 'Escolha a empresa.');
    const q = String(ctx.query?.q ?? '').trim().toLowerCase();
    const rows = await db.all('SELECT * FROM contact_consents WHERE company = ? ORDER BY consent_at DESC LIMIT 500', [company]);
    const out = rows.filter((x) => !q || `${x.name ?? ''} ${x.phone ?? ''} ${x.email ?? ''}`.toLowerCase().includes(q))
      .map((x) => ({ id: x.id, name: x.name, phone: x.phone, email: x.email, channels: json(x.channels_json, []), source: x.source, consent_at: x.consent_at, revoked_at: x.revoked_at, text_version: x.text_version }));
    return { consents: out };
  });

  r.get('/api/consents/export', auth('manager'), hqOnly(), async (ctx) => {
    const company = String(ctx.query?.company ?? '');
    if (!company) throw new HttpError(422, 'Escolha a empresa.');
    const rows = await db.all('SELECT * FROM contact_consents WHERE company = ? AND revoked_at IS NULL ORDER BY consent_at DESC', [company]);
    await audit(ctx, 'consents_export', 'consent', null, { company, rows: rows.length });
    return ctx.csv(`autorizacoes-${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nowIso().slice(0, 10)}.csv`, consentsCsv(rows));
  });

  r.post('/api/consents/:id/revoke', auth('manager'), hqOnly(), async (ctx) => {
    const x = await db.run('UPDATE contact_consents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), ctx.params.id]);
    if (!x.changes) throw new HttpError(404, 'Autorização não encontrada.');
    await audit(ctx, 'consent_revoked', 'consent', ctx.params.id);
    return { ok: true };
  });

  // Chave de uma empresa/sistema para enviar autorizações. Aparece uma única vez, na tela de quem criou.
  r.post('/api/consents/sources', auth('owner'), hqOnly(), async (ctx) => {
    const d = validate(ctx.body, { company: 'str:2:80' });
    const key = `cs_${newToken(32)}`;
    await db.run('INSERT INTO consent_sources (id, company, key_hash, last4, created_at) VALUES (?,?,?,?,?)', [uid(), d.company, sha256(key), key.slice(-4), nowIso()]);
    await audit(ctx, 'consent_source_created', 'consent', null, { company: d.company });
    return { ok: true, key };
  });

  r.delete('/api/consents/sources/:id', auth('owner'), hqOnly(), async (ctx) => {
    const x = await db.run('UPDATE consent_sources SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), ctx.params.id]);
    if (!x.changes) throw new HttpError(404, 'Chave não encontrada.');
    await audit(ctx, 'consent_source_revoked', 'consent', ctx.params.id);
    return { ok: true };
  });

  // Entrada para os outros sistemas (Dentalpos, Revah, Space Hour...). A empresa vem da chave, nunca do corpo.
  r.post('/api/ingest/consent', async (ctx) => {
    rateLimit(`ingest:${ctx.ip}`, 300, 60_000);
    const got = String(ctx.req.headers.authorization || '').replace(/^Bearer /, '');
    const src = got ? await db.get('SELECT company FROM consent_sources WHERE key_hash = ? AND revoked_at IS NULL', [sha256(got)]) : null;
    if (!src) throw new HttpError(401, 'Chave inválida.');
    const d = validate(ctx.body, { name: 'str?:0:100', phone: 'phone?', email: 'email?', source: 'str?:0:40', text_version: 'str?:0:60', text_shown: 'str?:0:1500', lang: 'str?:0:5', ip: 'str?:0:60', consent_at: 'str?:0:40' });
    const id = await recordConsent({ company: src.company, source: d.source, name: d.name, phone: d.phone, email: d.email, channels: ctx.body?.channels, textVersion: d.text_version, text: d.text_shown, lang: d.lang, ip: d.ip, consentAt: d.consent_at && !Number.isNaN(Date.parse(d.consent_at)) ? new Date(d.consent_at).toISOString() : null });
    if (!id) throw new HttpError(422, 'Informe pelo menos um canal autorizado e um telefone ou e-mail.');
    return { ok: true, id };
  });
}
