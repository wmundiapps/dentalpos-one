// Testes de ponta a ponta: sobem o servidor real com SQLite em memória e batem na API por HTTP.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.META_APP_SECRET = 'meta-secret-de-teste';
process.env.META_VERIFY_TOKEN = 'verify-de-teste';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
process.env.ASAAS_WEBHOOK_TOKEN = 'asaas-token-teste';
process.env.TRUST_PROXY = 'false';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const { tick } = await import('../server/scheduler.js');
const u = await import('../server/util.js');

const PW = 'Piloto-Forte-2026';
let server, base, pilot;

async function call(method, path, { body, cookie, headers = {}, raw, csrf = true } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (csrf && method !== 'GET') h['x-requested-with'] = 'sbb';
  let payload = raw;
  if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + path, { method, headers: h, body: payload });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}

async function login(email = 'piloto@studiobeautybarber.com', password = PW, extra = {}) {
  const r = await call('POST', '/api/auth/login', { body: { email, password, ...extra } });
  const setCookie = r.headers.getSetCookie?.()[0] || '';
  return { ...r, cookie: setCookie.split(';')[0] };
}

before(async () => {
  await initDb({ sqlitePath: ':memory:' });
  await ensureHq();
  pilot = await seedPilot({ ownerPassword: PW });
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('saúde e cabeçalhos de segurança', async () => {
  const r = await call('GET', '/healthz');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('strict-transport-security'), /max-age/);
});

test('login: senha errada, CSRF, sessão e bloqueio por tentativas', async () => {
  assert.equal((await login('piloto@studiobeautybarber.com', 'errada-errada-1')).status, 401);
  const ok = await login();
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie.startsWith('sbb_session='));
  const me = await call('GET', '/api/auth/me', { cookie: ok.cookie });
  assert.equal(me.data.user.role, 'owner');
  // sem cabeçalho anti-CSRF, ações que alteram dados são bloqueadas
  const noCsrf = await call('POST', '/api/clients', { cookie: ok.cookie, csrf: false, body: { name: 'Teste' } });
  assert.equal(noCsrf.status, 403);
  // sem sessão
  assert.equal((await call('GET', '/api/clients')).status, 401);
  // bloqueio após 5 erros seguidos (usuário de recepção)
  for (let i = 0; i < 5; i++) await login('recepcao.piloto@studiobeautybarber.com', 'errada-errada-' + i);
  const locked = await login('recepcao.piloto@studiobeautybarber.com', PW);
  assert.equal(locked.status, 423);
  await db.run("UPDATE users SET locked_until = NULL WHERE email = 'recepcao.piloto@studiobeautybarber.com'");
});

test('rate limit de login por IP', async () => {
  let last;
  for (let i = 0; i < 22; i++) last = await login('ninguem@exemplo.com', 'qualquer-coisa-1');
  assert.equal(last.status, 429);
});

test('cadastro: senha fraca recusada, cadastro ok, e-mail duplicado e lead no funil HQ', async () => {
  const body = { salon_name: 'Barbearia Teste', owner_name: 'Dono Teste', email: 'dono@teste.com', password: 'curta', phone: '44999990000', terms: true };
  assert.equal((await call('POST', '/api/auth/signup', { body })).status, 422);
  const ok = await call('POST', '/api/auth/signup', { body: { ...body, password: 'Senha-Muito-Boa-9' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/api/auth/signup', { body: { ...body, password: 'Senha-Muito-Boa-9' } })).status, 409);
  assert.equal((await call('POST', '/api/auth/signup', { body: { ...body, email: 'x@teste.com', password: 'Senha-Muito-Boa-9', terms: false } })).status, 422);
  const hq = await db.get('SELECT id FROM salons WHERE slug = ?', ['studiobeautybarber-hq']);
  const lead = await db.get('SELECT * FROM leads WHERE salon_id = ? AND email = ?', [hq.id, 'dono@teste.com']);
  assert.equal(lead.source, 'cadastro-teste');
});

test('isolamento entre salões (multi-tenant)', async () => {
  const a = await login();
  const clients = (await call('GET', '/api/clients', { cookie: a.cookie })).data.clients;
  const other = await login('dono@teste.com', 'Senha-Muito-Boa-9');
  assert.equal(other.status, 200);
  assert.equal((await call('GET', `/api/clients/${clients[0].id}`, { cookie: other.cookie })).status, 404);
  assert.equal((await call('GET', '/api/clients', { cookie: other.cookie })).data.clients.length, 0);
  assert.equal((await call('PATCH', `/api/clients/${clients[0].id}`, { cookie: other.cookie, body: { name: 'Invasor' } })).status, 404);
});

test('agenda: conflito de horário e disponibilidade', async () => {
  const s = await login();
  const staff = (await call('GET', '/api/staff', { cookie: s.cookie })).data.staff.find((x) => x.name.startsWith('Camila'));
  const svc = (await call('GET', '/api/services', { cookie: s.cookie })).data.services.find((x) => x.name === 'Corte feminino');
  const client = (await call('GET', '/api/clients', { cookie: s.cookie })).data.clients[0];
  // procura um horário livre
  let date = u.addDays(u.localDate(new Date()), 2);
  let slot;
  for (let i = 0; i < 10 && !slot; i++, date = u.addDays(date, 1)) {
    const av = await call('GET', `/api/availability?service_id=${svc.id}&date=${date}&staff_id=${staff.id}`, { cookie: s.cookie });
    slot = av.data.slots[0];
  }
  assert.ok(slot, 'deve haver horário livre');
  const make = () => call('POST', '/api/appointments', { cookie: s.cookie, body: { client_id: client.id, staff_id: staff.id, service_id: svc.id, starts_at: slot.startsAt } });
  assert.equal((await make()).status, 200);
  assert.equal((await make()).status, 409);
  const av2 = await call('GET', `/api/availability?service_id=${svc.id}&date=${date}&staff_id=${staff.id}`, { cookie: s.cookie });
  assert.ok(!av2.data.slots.some((x) => x.startsAt === slot.startsAt));
  // profissional que não faz o serviço
  const barber = (await call('GET', '/api/staff', { cookie: s.cookie })).data.staff.find((x) => x.name.startsWith('Rafael'));
  assert.equal((await call('POST', '/api/appointments', { cookie: s.cookie, body: { client_id: client.id, staff_id: barber.id, service_id: svc.id, starts_at: slot.startsAt } })).status, 422);
});

test('página pública: reserva só em horário realmente livre', async () => {
  const pub = (await call('GET', '/api/public/salons/studio-beauty-barber-piloto')).data;
  const svc = pub.services.find((x) => x.name === 'Manicure');
  let date = u.addDays(u.localDate(new Date()), 3), slots = [];
  for (let i = 0; i < 10 && !slots.length; i++, date = u.addDays(date, 1)) {
    slots = (await call('GET', `/api/public/salons/studio-beauty-barber-piloto/slots?service_id=${svc.id}&date=${date}`)).data.slots;
  }
  assert.ok(slots.length);
  const body = { service_id: svc.id, starts_at: slots[0].startsAt, name: 'Maria Teste', phone: '(11) 98888-7766', consent_marketing: true };
  assert.equal((await call('POST', '/api/public/salons/studio-beauty-barber-piloto/book', { body })).status, 200);
  assert.equal((await call('POST', '/api/public/salons/studio-beauty-barber-piloto/book', { body: { ...body, phone: '11977776666' } })).status, 409); // mesmo horário
  const forged = new Date(Date.now() + 5 * 86400_000); forged.setUTCMinutes(7);
  assert.equal((await call('POST', '/api/public/salons/studio-beauty-barber-piloto/book', { body: { ...body, starts_at: forged.toISOString() } })).status, 409); // horário inventado
  const c = await db.get("SELECT * FROM clients WHERE phone = '5511988887766'");
  assert.equal(c.consent_marketing, 1);
  assert.equal((await call('GET', '/api/public/salons/nao-existe')).status, 404);
});

test('lead da landing: consentimento, honeypot e rate limit', async () => {
  const lead = { name: 'Carlos Dono', phone: '44988887777', company: 'Barber Carlos', city: 'Londrina', consent: true, utm: { utm_source: 'meta', utm_campaign: 'teste' } };
  assert.equal((await call('POST', '/api/public/leads', { body: { ...lead, consent: false } })).status, 422);
  assert.equal((await call('POST', '/api/public/leads', { body: lead })).status, 200);
  const hq = await db.get('SELECT id FROM salons WHERE slug = ?', ['studiobeautybarber-hq']);
  const row = await db.get('SELECT * FROM leads WHERE salon_id = ? AND phone = ?', [hq.id, '5544988887777']);
  assert.equal(row.consent, 1);
  assert.match(row.utm_json, /meta/);
  const before = (await db.get('SELECT COUNT(*) n FROM leads WHERE salon_id = ?', [hq.id])).n;
  await call('POST', '/api/public/leads', { body: { ...lead, phone: '44977776666', website: 'http://spam' } });
  assert.equal((await db.get('SELECT COUNT(*) n FROM leads WHERE salon_id = ?', [hq.id])).n, before);
  let last;
  for (let i = 0; i < 12; i++) last = await call('POST', '/api/public/leads', { body: { ...lead, phone: `4498000${1000 + i}` } });
  assert.equal(last.status, 429);
});

test('CORS: só a landing autorizada', async () => {
  const ok = await fetch(base + '/api/public/config', { headers: { origin: 'https://studiobeautybarber.com' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://studiobeautybarber.com');
  const bad = await fetch(base + '/api/public/config', { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

// ---------- Meta / robô ----------
const metaBody = (obj) => JSON.stringify(obj);
const metaSig = (b) => 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(b).digest('hex');
const waMessage = (from, text, id) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PNID-1' }, contacts: [{ wa_id: from, profile: { name: 'Cliente Zap' } }], messages: [{ from, id, type: 'text', text: { body: text } }] } }] }],
});

test('webhook Meta: verificação, assinatura, robô responde e duplicata é ignorada', async () => {
  const s = await login();
  const put = await call('PUT', '/api/integrations/whatsapp', { cookie: s.cookie, body: { phoneNumberId: 'PNID-1', accessToken: 'token-falso' } });
  assert.equal(put.status, 200);
  const list = await call('GET', '/api/integrations', { cookie: s.cookie });
  assert.ok(!JSON.stringify(list.data).includes('token-falso'), 'token nunca volta para o navegador');
  const raw = await db.get("SELECT config_enc FROM integrations WHERE kind = 'whatsapp'");
  assert.ok(!raw.config_enc.includes('token-falso'), 'token é gravado criptografado');

  assert.equal((await call('GET', '/webhooks/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123')).status, 403);
  const v = await call('GET', '/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-de-teste&hub.challenge=abc123');
  assert.equal(v.status, 200); assert.equal(v.data, 'abc123');

  const b = metaBody(waMessage('5511977770001', 'oi', 'wamid.AAA'));
  assert.equal((await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } })).status, 403);
  assert.equal((await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json' } })).status, 403);
  const ok = await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSig(b) } });
  assert.equal(ok.status, 200);
  const conv = await db.get("SELECT * FROM conversations WHERE external_id = '5511977770001'");
  const msgs = await db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at', [conv.id]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].sender, 'bot');
  assert.match(msgs[1].body, /assistente virtual/);
  // reenvio da Meta (mesmo id) não gera nova resposta
  await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSig(b) } });
  assert.equal((await db.get('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?', [conv.id])).n, 2);
});

test('robô: agenda de ponta a ponta pelo WhatsApp', async () => {
  const from = '5511977770002';
  const say = async (text, id) => {
    const b = metaBody(waMessage(from, text, id));
    await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSig(b) } });
    const conv = await db.get('SELECT id FROM conversations WHERE external_id = ?', [from]);
    return (await db.get("SELECT body FROM messages WHERE conversation_id = ? AND sender = 'bot' ORDER BY created_at DESC, rowid DESC LIMIT 1", [conv.id])).body;
  };
  assert.match(await say('quero agendar', 'w1'), /Qual serviço/);
  assert.match(await say('Corte masculino', 'w2'), /Para qual dia/);
  assert.match(await say('1', 'w3'), /Horários livres/);
  assert.match(await say('1', 'w4'), /Como é o seu nome/);
  assert.match(await say('Joana Silva', 'w5'), /Confirma\?/);
  assert.match(await say('sim', 'w6'), /Agendado/);
  const appt = await db.get("SELECT a.*, c.name FROM appointments a JOIN clients c ON c.id = a.client_id WHERE c.phone = ?", [from]);
  assert.ok(appt); assert.equal(appt.status, 'scheduled'); assert.match(appt.source, /robô/);
  // cancelamento pelo robô
  assert.match(await say('cancelar', 'w7'), /Responda SIM para cancelar/);
  assert.match(await say('sim', 'w8'), /cancelado/);
  assert.equal((await db.get('SELECT status FROM appointments WHERE id = ?', [appt.id])).status, 'cancelled');
});

test('robô: transferência para humano e sinalização anti-phishing', async () => {
  const from = '5511977770003';
  const send = async (text, id) => { const b = metaBody(waMessage(from, text, id)); return call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSig(b) } }); };
  await send('quero falar com um atendente', 'h1');
  const conv = await db.get('SELECT * FROM conversations WHERE external_id = ?', [from]);
  assert.equal(conv.mode, 'human');
  const before = (await db.get('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?', [conv.id])).n;
  await send('olha esse link https://bit.ly/promo-gratis e me manda o código de verificação', 'h2');
  const after2 = await db.get('SELECT * FROM conversations WHERE id = ?', [conv.id]);
  assert.equal(after2.flagged, 1);
  assert.equal((await db.get('SELECT COUNT(*) n FROM messages WHERE conversation_id = ?', [conv.id])).n, before + 1, 'em modo humano o robô não responde');
});

test('opt-out (PARAR) e campanhas: só com consentimento, anti-phishing e fila', async () => {
  const s = await login();
  // cliente com consentimento pede para sair
  const target = await db.get("SELECT * FROM clients WHERE consent_marketing = 1 AND phone IS NOT NULL AND salon_id = ? LIMIT 1", [pilot.salonId]);
  const b = metaBody(waMessage(target.phone, 'PARAR', 'stop1'));
  await call('POST', '/webhooks/meta', { raw: b, headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSig(b) } });
  assert.equal((await db.get('SELECT consent_marketing FROM clients WHERE id = ?', [target.id])).consent_marketing, 0);

  const pv = await call('POST', '/api/campaigns/preview', { cookie: s.cookie, body: { channel: 'whatsapp', body: 'Oi {{nome}}!', segment: { audience: 'clients' } } });
  const consented = (await db.get('SELECT COUNT(*) n FROM clients WHERE salon_id = ? AND consent_marketing = 1 AND phone IS NOT NULL AND deleted_at IS NULL', [pilot.salonId])).n;
  assert.equal(pv.data.eligible, Number(consented));

  const bad = await call('POST', '/api/campaigns', { cookie: s.cookie, body: { name: 'Golpe', channel: 'whatsapp', body: 'Ganhe agora https://bit.ly/xyz', segment: {} } });
  assert.equal(bad.status, 422);
  assert.match(bad.data.error, /anti-phishing/);
  const unk = await call('POST', '/api/campaigns', { cookie: s.cookie, body: { name: 'Link', channel: 'whatsapp', body: 'Veja https://site-desconhecido.com.br/oferta', segment: {} } });
  assert.equal(unk.status, 422);

  const c = await call('POST', '/api/campaigns', { cookie: s.cookie, body: { name: 'Teste fila', channel: 'whatsapp', body: 'Oi, {{nome}}! Novidades no {{salao}}.', segment: { audience: 'clients' } } });
  assert.equal(c.status, 200);
  const l = await call('POST', `/api/campaigns/${c.data.id}/launch`, { cookie: s.cookie });
  assert.equal(l.status, 200);
  assert.equal((await call('POST', `/api/campaigns/${c.data.id}/launch`, { cookie: s.cookie })).status, 409);
  // dispara o agendador em um horário fora do silêncio (14h no fuso de SP)
  const noon = new Date(u.zonedToUtc(u.localDate(new Date()), '14:00'));
  const stats = await tick(noon);
  assert.ok(stats.campaigns > 0 && stats.campaigns <= 20, 'envia em lotes de até 20');
  const camp = await db.get('SELECT * FROM campaigns WHERE id = ?', [c.data.id]);
  assert.equal(camp.sent + camp.failed, stats.campaigns);
  // texto da mensagem foi personalizado e traz instrução de saída
  const m = await db.get("SELECT body FROM messages WHERE sender = 'system' AND body LIKE '%Novidades%' LIMIT 1");
  assert.match(m.body, /PARAR/);
  assert.ok(!m.body.includes('{{'));
  // horário de silêncio: nada é enviado às 22h
  const night = new Date(u.zonedToUtc(u.localDate(new Date()), '22:00'));
  const before = camp.sent;
  await tick(night);
  assert.equal((await db.get('SELECT sent FROM campaigns WHERE id = ?', [c.data.id])).sent, before);
});

test('vendas: pagamento quita, baixa estoque e limita desconto da recepção', async () => {
  const s = await login();
  const rec = await login('recepcao.piloto@studiobeautybarber.com', PW);
  assert.equal(rec.status, 200);
  const svc = (await call('GET', '/api/services', { cookie: s.cookie })).data.services.find((x) => x.name === 'Barba completa');
  const prod = (await call('GET', '/api/products', { cookie: s.cookie })).data.products.find((x) => x.name === 'Óleo para barba');
  const client = (await call('GET', '/api/clients', { cookie: s.cookie })).data.clients[3];
  const items = [{ kind: 'service', ref_id: svc.id, qty: 1 }, { kind: 'product', ref_id: prod.id, qty: 2 }];
  const big = await call('POST', '/api/sales', { cookie: rec.cookie, body: { client_id: client.id, payment_method: 'card', items, discount_cents: 5000 } });
  assert.equal(big.status, 403);
  const ok = await call('POST', '/api/sales', { cookie: s.cookie, body: { client_id: client.id, payment_method: 'card', items, discount_cents: 1000 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.total_cents, svc.price_cents + 2 * prod.price_cents - 1000);
  const after1 = (await call('GET', '/api/products', { cookie: s.cookie })).data.products.find((x) => x.id === prod.id);
  assert.equal(after1.stock, prod.stock - 2);
  const c2 = (await call('GET', `/api/clients/${client.id}`, { cookie: s.cookie })).data.client;
  assert.equal(c2.visits, client.visits + 1);
  const tooMany = await call('POST', '/api/sales', { cookie: s.cookie, body: { payment_method: 'cash', items: [{ kind: 'product', ref_id: prod.id, qty: 99 }] } });
  assert.equal(tooMany.status, 409);
  // Pix sem Asaas configurado (piloto): fica pendente com código simulado e depois é quitado manualmente
  const pix = await call('POST', '/api/sales', { cookie: s.cookie, body: { client_id: client.id, payment_method: 'pix_asaas', items: [{ kind: 'service', ref_id: svc.id, qty: 1 }] } });
  assert.equal(pix.data.status, 'pending'); assert.ok(pix.data.pix.simulated);
  assert.equal((await call('POST', `/api/sales/${pix.data.id}/pay`, { cookie: s.cookie })).data.settled, true);
  assert.equal((await call('POST', `/api/sales/${pix.data.id}/pay`, { cookie: s.cookie })).data.settled, false, 'não quita duas vezes');
});

test('Stripe: assinatura inválida, ativação e idempotência', async () => {
  const salonId = (await db.get("SELECT id FROM salons WHERE email = 'dono@teste.com'")).id;
  const ev = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', customer: 'cus_1', client_reference_id: salonId, metadata: { salon_id: salonId, plan: 'medio' } } } };
  const raw = JSON.stringify(ev);
  const t = Math.floor(Date.now() / 1000);
  const good = `t=${t},v1=${createHmac('sha256', 'whsec_teste').update(`${t}.${raw}`).digest('hex')}`;
  assert.equal((await call('POST', '/webhooks/stripe', { raw, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${'a'.repeat(64)}` } })).status, 400);
  const old = `t=${t - 4000},v1=${createHmac('sha256', 'whsec_teste').update(`${t - 4000}.${raw}`).digest('hex')}`;
  assert.equal((await call('POST', '/webhooks/stripe', { raw, headers: { 'content-type': 'application/json', 'stripe-signature': old } })).status, 400, 'assinatura antiga (replay) é recusada');
  assert.equal((await call('POST', '/webhooks/stripe', { raw, headers: { 'content-type': 'application/json', 'stripe-signature': good } })).status, 200);
  const salon = await db.get('SELECT * FROM salons WHERE id = ?', [salonId]);
  assert.equal(salon.status, 'active'); assert.equal(salon.plan, 'medio');
  const dup = await call('POST', '/webhooks/stripe', { raw, headers: { 'content-type': 'application/json', 'stripe-signature': good } });
  assert.equal(dup.data.duplicate, true);
  // pagamento recusado -> past_due
  const ev2 = JSON.stringify({ id: 'evt_2', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } });
  const sig2 = `t=${t},v1=${createHmac('sha256', 'whsec_teste').update(`${t}.${ev2}`).digest('hex')}`;
  await call('POST', '/webhooks/stripe', { raw: ev2, headers: { 'content-type': 'application/json', 'stripe-signature': sig2 } });
  assert.equal((await db.get('SELECT status FROM salons WHERE id = ?', [salonId])).status, 'past_due');
});

test('Asaas: token do webhook obrigatório', async () => {
  const body = { id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };
  assert.equal((await call('POST', '/webhooks/asaas', { body })).status, 401);
  assert.equal((await call('POST', '/webhooks/asaas', { body, headers: { 'asaas-access-token': 'errado' } })).status, 401);
  assert.equal((await call('POST', '/webhooks/asaas', { body, headers: { 'asaas-access-token': 'asaas-token-teste' } })).status, 200);
  assert.equal((await call('POST', `/webhooks/asaas/${pilot.salonId}`, { body, headers: { 'asaas-access-token': 'qualquer' } })).status, 401);
});

test('2FA (TOTP): ativação e login exigindo código', async () => {
  const s = await login('dono@teste.com', 'Senha-Muito-Boa-9');
  const setup = await call('POST', '/api/auth/2fa/setup', { cookie: s.cookie });
  assert.match(setup.data.uri, /^otpauth:\/\/totp\//);
  assert.equal((await call('POST', '/api/auth/2fa/enable', { cookie: s.cookie, body: { code: '000000' } })).status, 422);
  assert.equal((await call('POST', '/api/auth/2fa/enable', { cookie: s.cookie, body: { code: sec.totpCode(setup.data.secret) } })).status, 200);
  const need = await login('dono@teste.com', 'Senha-Muito-Boa-9');
  assert.equal(need.data.need_2fa, true);
  assert.equal(need.cookie, '', 'sem código não cria sessão');
  assert.equal((await login('dono@teste.com', 'Senha-Muito-Boa-9', { code: '123456' })).status, 401);
  assert.equal((await login('dono@teste.com', 'Senha-Muito-Boa-9', { code: sec.totpCode(setup.data.secret) })).status, 200);
});

test('upload de logo: só imagem real, com limite de tamanho', async () => {
  const s = await login();
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
  const up = (buf) => call('POST', '/api/settings/logo', { cookie: s.cookie, raw: buf, headers: { 'content-type': 'image/png' } });
  assert.equal((await up(png)).status, 200);
  assert.equal((await up(Buffer.from('<svg onload=alert(1)></svg>'))).status, 415);
  assert.equal((await up(Buffer.from('<?php system($_GET[1]); ?>'))).status, 415);
  assert.equal((await up(Buffer.concat([png, Buffer.alloc(2_100_000)]))).status, 413);
  const logo = (await call('GET', '/api/settings', { cookie: s.cookie })).data.salon.logo;
  const served = await fetch(base + logo);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
});

test('LGPD: exportação e exclusão (anonimização) de cliente', async () => {
  const s = await login();
  const c = (await call('POST', '/api/clients', { cookie: s.cookie, body: { name: 'Titular Teste', phone: '11955554444', email: 'titular@teste.com', consent_marketing: true } })).data;
  const exp = await call('GET', `/api/clients/${c.id}/export`, { cookie: s.cookie });
  assert.equal(exp.data.client.email, 'titular@teste.com');
  assert.equal((await call('DELETE', `/api/clients/${c.id}`, { cookie: s.cookie })).status, 200);
  const row = await db.get('SELECT * FROM clients WHERE id = ?', [c.id]);
  assert.equal(row.phone, null); assert.equal(row.email, null); assert.equal(row.name, 'Cliente removido');
  const audit = await call('GET', '/api/audit', { cookie: s.cookie });
  assert.ok(audit.data.events.some((e) => e.action === 'client_erased'));
});

test('arquivos estáticos: sem path traversal e páginas servidas', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/..%2f..%2fserver%2fconfig.js')).status, 404);
  assert.equal((await fetch(base + '/../server/config.js')).status, 404);
  assert.equal((await fetch(base + '/server/config.js')).status, 404);
  assert.equal((await fetch(base + '/uploads/..%2f..%2fsbb.db')).status, 404);
});
