// Base central de autorizações: só grava com canal marcado, por empresa, e só entra com a chave certa.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';
process.env.APP_URL = 'https://app.studiobeautybarber.com';
process.env.HQ_SLUG = 'studio-beauty-barber-piloto';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');

let server, base, cookie = '';
async function call(method, path, body, headers = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb', cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  const sc = r.headers.getSetCookie?.() || []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, data, text: t, headers: r.headers };
}
before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await seedPilot({ ownerPassword: 'Piloto-Forte-2026' }); await ensureHq();
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('indicador: só grava autorização quando algum canal é marcado; guarda texto, versão e IP', async () => {
  const base1 = { name: 'Ana Souza', phone: '(44) 99911-2233', service: 'Corte', consent: true };
  await call('POST', '/api/public/finder/search', base1);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM contact_consents')).n, 0);
  await call('POST', '/api/public/finder/search', { ...base1, marketing: { whatsapp: true, email: false, sms: true } });
  const row = await db.get('SELECT * FROM contact_consents');
  assert.equal(row.company, 'Studio Beauty Barber');
  assert.deepEqual(JSON.parse(row.channels_json), ['whatsapp', 'sms']);
  assert.ok(row.text_shown.includes('WMundi') && row.text_version && row.ip);
});

test('painel: login, abas por empresa, planilha só com autorizações válidas e revogação', async () => {
  const login = await call('POST', '/api/auth/login', { email: 'piloto@studiobeautybarber.com', password: 'Piloto-Forte-2026' });
  assert.equal(login.status, 200, login.text);
  const key = (await call('POST', '/api/consents/sources', { company: 'DentalPos' })).data.key;
  assert.match(key, /^cs_/);
  const noKey = await call('POST', '/api/ingest/consent', { phone: '(11) 98888-7777', channels: { sms: true } }, { cookie: '' });
  assert.equal(noKey.status, 401);
  const bad = await call('POST', '/api/ingest/consent', { phone: '(11) 98888-7777', channels: {} }, { cookie: '', authorization: `Bearer ${key}` });
  assert.equal(bad.status, 422);
  const ok = await call('POST', '/api/ingest/consent', { name: 'Carlos', phone: '(11) 98888-7777', email: 'c@x.com', channels: { sms: true, email: true }, company: 'Outra', source: 'app', text_version: 'v1' }, { cookie: '', authorization: `Bearer ${key}` });
  assert.equal(ok.status, 200);
  const comps = (await call('GET', '/api/consents/companies')).data.companies.map((c) => c.company);
  assert.ok(comps.includes('DentalPos') && !comps.includes('Outra'), 'a empresa vem da chave, não do corpo');
  const csv = await call('GET', '/api/consents/export?company=DentalPos');
  assert.ok(csv.text.includes('Carlos') && csv.text.includes('SIM'));
  const id = (await call('GET', '/api/consents?company=DentalPos')).data.consents[0].id;
  assert.equal((await call('POST', `/api/consents/${id}/revoke`)).status, 200);
  assert.ok(!(await call('GET', '/api/consents/export?company=DentalPos')).text.includes('Carlos'));
});
