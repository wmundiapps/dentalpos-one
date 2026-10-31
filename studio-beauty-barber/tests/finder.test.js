// Indicador de profissionais: só cidades antes do clique, só a cidade clicada depois, nunca dados de contato do profissional.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';
process.env.RESEND_API_KEY = 're_teste';
process.env.APP_URL = 'https://app.studiobeautybarber.com';
process.env.HQ_SLUG = 'studio-beauty-barber-piloto';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');

const realFetch = globalThis.fetch;
const emails = [];
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('resend.com')) { emails.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ id: 're_1' }), text: async () => '{}' }; }
  return realFetch(url, opts);
};
let server, base, salon, other;
async function post(path, body) {
  const r = await realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify(body) });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, data, text: t };
}
const buyer = (n) => ({ name: 'Joana Silva', phone: `(44) 99${String(900000 + n).padStart(7, '0')}`, service: 'Corte', consent: true });

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await seedPilot({ ownerPassword: 'Piloto-Forte-2026' }); await ensureHq();
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  salon = await db.get('SELECT * FROM salons ORDER BY created_at LIMIT 1');
  await db.run('UPDATE salons SET city = ?, email = ?, brand_json = ? WHERE id = ?', ['Maringá - PR', 'dono@salao.test', JSON.stringify({ finder: { enabled: true, accepted_at: new Date().toISOString() } }), salon.id]);
  // segundo salão em outra cidade, também participante
  const id = 'outro-salao-1';
  await db.run(`INSERT INTO salons (id, slug, name, email, phone, city, hours_json, brand_json, plan, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, 'outro-salao', 'Barbearia do Sul', 'sul@salao.test', '5544988887777', 'Londrina - PR', '{}', JSON.stringify({ finder: { enabled: true } }), 'smart', 'active', new Date().toISOString()]);
  await db.run('INSERT INTO services (id, salon_id, name, category, duration_min, price_cents, active) VALUES (?,?,?,?,?,?,1)', ['svc-sul', id, 'Corte masculino', 'Cabelo', 30, 5000]);
  other = id;
});

after(async () => { globalThis.fetch = realFetch; server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('sem consentimento não busca', async () => {
  const r = await post('/api/public/finder/search', { ...buyer(1), consent: false });
  assert.equal(r.status, 422);
});

test('a busca devolve só cidades, nunca nomes ou contatos de profissionais', async () => {
  const r = await post('/api/public/finder/search', buyer(2));
  assert.equal(r.status, 200);
  assert.ok(r.data.cities.length >= 1);
  assert.ok(r.data.cities.every((c) => Object.keys(c).sort().join() === 'count,key,label'));
  assert.ok(!r.text.includes(salon.name) && !r.text.includes('Barbearia do Sul') && !r.text.includes('salao.test'));
});

test('abre só a cidade clicada; outra cidade na mesma busca é recusada; nenhum contato do profissional vaza', async () => {
  const s = (await post('/api/public/finder/search', buyer(3))).data;
  const londrina = s.cities.find((c) => c.label === 'Londrina');
  assert.ok(londrina);
  const o = await post('/api/public/finder/open', { request_id: s.request_id, token: s.token, city: londrina.key });
  assert.equal(o.status, 200);
  assert.deepEqual(o.data.pros.map((p) => p.name), ['Barbearia do Sul']);
  for (const leak of ['5544988887777', 'sul@salao.test', 'outro-salao', other, 'Maringá']) assert.ok(!o.text.includes(leak), `vazou ${leak}`);
  const again = await post('/api/public/finder/open', { request_id: s.request_id, token: s.token, city: 'maringa' });
  assert.equal(again.status, 403);
  const bad = await post('/api/public/finder/open', { request_id: s.request_id, token: 'errado', city: londrina.key });
  assert.equal(bad.status, 404);
});

test('pedido de contato avisa o profissional pelo sistema, cria o lead e não devolve contato', async () => {
  const s = (await post('/api/public/finder/search', buyer(4))).data;
  const o = (await post('/api/public/finder/open', { request_id: s.request_id, token: s.token, city: 'londrina' })).data;
  const before = emails.length;
  const c = await post('/api/public/finder/contact', { request_id: s.request_id, token: s.token, ref: o.pros[0].ref });
  assert.equal(c.status, 200);
  assert.ok(!c.text.includes('sul@salao.test') && !c.text.includes('5544988887777'));
  assert.equal(emails.length, before + 1);
  assert.deepEqual(emails.at(-1).to, ['sul@salao.test']);
  assert.ok(!emails.at(-1).text.includes('99'), 'telefone do cliente não vai no e-mail');
  const lead = await db.get("SELECT * FROM leads WHERE salon_id = ? AND source = 'indicador'", [other]);
  assert.ok(lead && lead.consent === 1 && /Corte/.test(lead.notes));
  const dup = await post('/api/public/finder/contact', { request_id: s.request_id, token: s.token, ref: o.pros[0].ref });
  assert.equal(dup.data.already, true);
  assert.equal(emails.length, before + 1);
});

test('ref inventado ou de outra cidade não funciona', async () => {
  const s = (await post('/api/public/finder/search', buyer(5))).data;
  await post('/api/public/finder/open', { request_id: s.request_id, token: s.token, city: 'londrina' });
  const c = await post('/api/public/finder/contact', { request_id: s.request_id, token: s.token, ref: 'abc' });
  assert.equal(c.status, 404);
});

test('salão que não aderiu não aparece', async () => {
  await db.run('UPDATE salons SET brand_json = ? WHERE id = ?', [JSON.stringify({ finder: { enabled: false } }), other]);
  const s = (await post('/api/public/finder/search', buyer(6))).data;
  assert.ok(!s.cities.some((c) => c.label === 'Londrina'));
});
