// Recall, confirmação de agendamento, adesão ao Cashbacksmart e conta vitalícia.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const { tick } = await import('../server/scheduler.js');
const u = await import('../server/util.js');

const PW = 'Piloto-Forte-2026';
const SLUG = 'studio-beauty-barber-piloto';
let server, base, cookie, pilot;

async function call(method, path, body, withCookie = true) {
  const h = {};
  if (withCookie && cookie) h.cookie = cookie;
  if (method !== 'GET') h['x-requested-with'] = 'sbb';
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, data };
}

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await ensureHq();
  pilot = await seedPilot({ ownerPassword: PW });
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const l = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify({ email: 'piloto@studiobeautybarber.com', password: PW }) });
  cookie = l.headers.getSetCookie()[0].split(';')[0];
});
after(async () => { server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('recall: chama o cliente no ciclo do serviço, uma vez por ciclo, e só com autorização', async () => {
  await call('PATCH', '/api/settings', { automations: { recall: true, reminders: true } });
  const svc = await db.get('SELECT * FROM services WHERE salon_id = ? LIMIT 1', [pilot.salonId]);
  await call('PATCH', `/api/services/${svc.id}`, { recall_days: 25 });
  assert.equal((await db.get('SELECT recall_days FROM services WHERE id = ?', [svc.id])).recall_days, 25);
  const staff = await db.get('SELECT id FROM staff WHERE salon_id = ? LIMIT 1', [pilot.salonId]);
  const mk = async (name, phone, consent) => {
    const id = u.uid();
    await db.run('INSERT INTO clients (id, salon_id, name, phone, consent_marketing, visits, created_at) VALUES (?,?,?,?,?,?,?)', [id, pilot.salonId, name, phone, consent, 1, u.nowIso()]);
    const last = new Date(Date.now() - 30 * 86400_000).toISOString();
    await db.run("INSERT INTO appointments (id, salon_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [u.uid(), pilot.salonId, id, staff.id, svc.id, last, last, 'done', 1000, last]);
    return id;
  };
  await mk('Cliente Autorizou', '5544991110001', 1);
  await mk('Cliente Sem Autorização', '5544991110002', 0);
  // meio-dia local evita a janela silenciosa de mensagens
  const noon = new Date(`${u.localDate(new Date())}T15:00:00Z`);
  const s1 = await tick(noon);
  assert.ok(s1.recall >= 1);
  const conv = await db.get("SELECT id FROM conversations WHERE salon_id = ? AND external_id = '5544991110001'", [pilot.salonId]);
  const msg = await db.get("SELECT body FROM messages WHERE conversation_id = ? AND body LIKE '%Já faz%'", [conv.id]);
  assert.match(msg.body, /Já faz \d+ dias/); assert.match(msg.body, /PARAR/);
  assert.equal(await db.get("SELECT id FROM conversations WHERE salon_id = ? AND external_id = '5544991110002'", [pilot.salonId]), undefined); // sem autorização: nada enviado
  await tick(new Date(noon.getTime() + 60_000));
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND body LIKE '%Já faz%'", [conv.id])).n, 1); // não repete no mesmo ciclo
});

test('confirmação na hora: agendar pelo painel e pela página pública avisa o cliente', async () => {
  const pub = (await call('GET', `/api/public/salons/${SLUG}`, undefined, false)).data;
  const svc = pub.services[0];
  let date = u.addDays(u.localDate(new Date()), 4), slots = [];
  for (let i = 0; i < 10 && !slots.length; i++, date = u.addDays(date, 1)) slots = (await call('GET', `/api/public/salons/${SLUG}/slots?service_id=${svc.id}&date=${date}`, undefined, false)).data.slots;
  const r = await call('POST', `/api/public/salons/${SLUG}/book`, { service_id: svc.id, staff_id: slots[0].staffId, starts_at: slots[0].startsAt, name: 'Dora Cashback', phone: '(44) 99888-1234', cashback_optin: true }, false);
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 150)); // o aviso sai sem bloquear a resposta
  const m = await db.get("SELECT body FROM messages WHERE salon_id = ? AND body LIKE 'Agendamento recebido%' ORDER BY created_at DESC LIMIT 1", [pilot.salonId]);
  assert.match(m.body, /Responda 1 para confirmar/);
  const c = await db.get("SELECT cashback_optin, cashback_optin_at FROM clients WHERE salon_id = ? AND name = 'Dora Cashback'", [pilot.salonId]);
  assert.equal(c.cashback_optin, 1); assert.ok(c.cashback_optin_at);
});

test('Cashbacksmart: o dono adere pelo sistema e o cliente liga e desliga no cadastro', async () => {
  assert.equal((await call('GET', '/api/settings')).data.salon.cashback.enabled, false);
  assert.equal((await call('PATCH', '/api/settings', { cashback: { enabled: true } })).status, 200);
  const cb = (await call('GET', '/api/settings')).data.salon.cashback;
  assert.equal(cb.enabled, true); assert.ok(cb.accepted_at);
  const c = await db.get("SELECT id FROM clients WHERE salon_id = ? AND name = 'Dora Cashback'", [pilot.salonId]);
  assert.equal((await call('PATCH', `/api/clients/${c.id}`, { cashback_optin: false })).status, 200);
  assert.equal((await db.get('SELECT cashback_optin FROM clients WHERE id = ?', [c.id])).cashback_optin, 0);
  assert.equal((await call('PATCH', `/api/clients/${c.id}`, { cashback_optin: true })).status, 200);
  assert.equal((await db.get('SELECT cashback_optin FROM clients WHERE id = ?', [c.id])).cashback_optin, 1);
  assert.equal((await call('POST', '/api/clients', { name: 'Novo Cashback', phone: '(44) 97777-0001', cashback_optin: true })).status, 200);
});

test('clube sem cobrança: repete o horário e não gera fatura', async () => {
  const pub = (await call('GET', `/api/public/salons/${SLUG}`, undefined, false)).data;
  const svc = pub.services[0]; const staff = pub.staff.find((s) => s.service_ids.includes(svc.id));
  const client = (await call('GET', '/api/clients')).data.clients[0];
  const r = await call('POST', '/api/club', { client_id: client.id, service_id: svc.id, staff_id: staff.id, interval_days: 15, preferred_time: '11:00', charge: false });
  assert.equal(r.status, 200);
  assert.equal((await db.get('SELECT charge FROM club_memberships WHERE id = (SELECT id FROM club_memberships ORDER BY created_at DESC LIMIT 1)')).charge, 0);
});

test('conta vitalícia: o teste não expira e o limite de profissionais não vale', async () => {
  await db.run("UPDATE salons SET status = 'trial', trial_ends_at = ?, lifetime = 1, plan = 'smart' WHERE id = ?", [new Date(Date.now() - 86400_000).toISOString(), pilot.salonId]);
  await tick(new Date());
  assert.equal((await db.get('SELECT status FROM salons WHERE id = ?', [pilot.salonId])).status, 'trial'); // não virou trial_expired
  await db.run("UPDATE salons SET status = 'active' WHERE id = ?", [pilot.salonId]);
  assert.equal((await call('POST', '/api/staff', { name: 'Profissional Extra 1' })).status, 200);
  assert.equal((await call('POST', '/api/staff', { name: 'Profissional Extra 2' })).status, 200);
  assert.equal((await call('GET', '/api/auth/me')).data.salon.lifetime, true);
  // sem vitalício, o trial vencido expira
  await db.run("UPDATE salons SET lifetime = 0, status = 'trial' WHERE id = ?", [pilot.salonId]);
  await tick(new Date());
  assert.equal((await db.get('SELECT status FROM salons WHERE id = ?', [pilot.salonId])).status, 'trial_expired');
});
