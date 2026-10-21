// Reserva paga com retenção, estorno parcial, plano por profissionais e clube de assinatura (Asaas simulado).
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const u = await import('../server/util.js');
const { refundAmounts } = await import('../server/payments.js');
const { saveIntegration } = await import('../server/integrations/store.js');

const PW = 'Piloto-Forte-2026';
const SLUG = 'studio-beauty-barber-piloto';
let server, base, pilot, cookie;
const asaasCalls = [];
let failNextGet = false;
const realFetch = globalThis.fetch;

async function call(method, path, { body, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie && !path.startsWith('/api/public') && !path.startsWith('/webhooks')) h.cookie = cookie;
  if (method !== 'GET') h['x-requested-with'] = 'sbb';
  let payload;
  if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await realFetch(base + path, { method, headers: h, body: payload });
  const t = await r.text(); let data = null; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await ensureHq();
  pilot = await seedPilot({ ownerPassword: PW });
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const l = await realFetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify({ email: 'piloto@studiobeautybarber.com', password: PW }) });
  cookie = l.headers.getSetCookie()[0].split(';')[0];
  // Asaas simulado: só intercepta chamadas ao Asaas; o resto passa direto.
  globalThis.fetch = async (url, opts = {}) => {
    if (!String(url).includes('asaas.com')) return realFetch(url, opts);
    const path = String(url).split('/v3')[1];
    const body = opts.body ? JSON.parse(opts.body) : null;
    asaasCalls.push({ method: opts.method || 'GET', path, body });
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (path === '/customers') return ok({ id: 'cus_1' });
    if (path === '/payments' && opts.method === 'POST') return ok({ id: `pay_${asaasCalls.length}`, invoiceUrl: 'https://sandbox.asaas.com/i/x', externalReference: body.externalReference, value: body.value });
    if (path.endsWith('/pixQrCode')) return ok({ payload: '000201...', encodedImage: 'AAAA' });
    if (path.endsWith('/refund')) return ok({ status: 'REFUNDED' });
    if (path.startsWith('/payments/') && (opts.method || 'GET') === 'GET') {
      if (failNextGet) { failNextGet = false; return { ok: false, status: 500, json: async () => ({ errors: [{ description: 'indisponível' }] }) }; }
      const last = [...asaasCalls].reverse().find((c) => c.path === '/payments' && c.method === 'POST');
      if (path.includes('pay_barato')) return ok({ id: 'pay_barato', externalReference: last.body.externalReference, value: 1, status: 'RECEIVED' });
      if (path.includes('pay_pendente')) return ok({ id: 'pay_pendente', externalReference: last.body.externalReference, value: last.body.value, status: 'PENDING' });
      return ok({ id: path.split('/')[2], externalReference: last.body.externalReference, value: last.body.value, status: 'RECEIVED' });
    }
    return ok({});
  };
  await saveIntegration(pilot.salonId, 'asaas', { apiKey: 'chave-de-teste', sandbox: 'true', webhookToken: 'tok-salao' });
});
after(async () => { globalThis.fetch = realFetch; server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('regra de retenção: cancelou no prazo devolve tudo; falta retém 30%', () => {
  const base = { paidCents: 4000, retentionPct: 30, freeHours: 24 };
  assert.deepEqual(refundAmounts({ ...base, reason: 'cancel', hoursLeft: 30 }), { refund: 4000, retained: 0 });
  assert.deepEqual(refundAmounts({ ...base, reason: 'cancel', hoursLeft: 5 }), { refund: 2800, retained: 1200 });
  assert.deepEqual(refundAmounts({ ...base, reason: 'noshow', hoursLeft: -1 }), { refund: 2800, retained: 1200 });
  assert.deepEqual(refundAmounts({ ...base, paidCents: 0, reason: 'noshow', hoursLeft: 0 }), { refund: 0, retained: 0 });
});

test('reserva paga: exige aceite, bloqueia o horário, confirma no webhook e retém 30% na falta', async () => {
  await db.run('UPDATE salons SET deposit_required = 1 WHERE id = ?', [pilot.salonId]);
  const pub = (await call('GET', `/api/public/salons/${SLUG}`)).data;
  assert.equal(pub.salon.deposit_required, true);
  assert.match(pub.salon.policy, /retemos 30%/);
  const svc = pub.services[0];
  let date = u.addDays(u.localDate(new Date()), 3), slots = [];
  for (let i = 0; i < 10 && !slots.length; i++, date = u.addDays(date, 1)) {
    slots = (await call('GET', `/api/public/salons/${SLUG}/slots?service_id=${svc.id}&date=${date}`)).data.slots;
  }
  const body = { service_id: svc.id, staff_id: slots[0].staffId, starts_at: slots[0].startsAt, name: 'Ana Pagante', phone: '(11) 97777-1122', cpf_cnpj: '12345678909', pay_method: 'PIX' };
  assert.equal((await call('POST', `/api/public/salons/${SLUG}/book`, { body })).status, 422); // sem aceite da política
  const ok = await call('POST', `/api/public/salons/${SLUG}/book`, { body: { ...body, accept_policy: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.pending_payment, true);
  assert.ok(ok.data.payment.pix.copy_paste);
  const apptId = ok.data.appointment.id;
  // horário segurado enquanto aguarda pagamento
  assert.equal((await call('POST', `/api/public/salons/${SLUG}/book`, { body: { ...body, phone: '11966665555', accept_policy: true } })).status, 409);

  // webhook do Asaas do salão confirma
  const hook = { id: 'evt_pay1', event: 'PAYMENT_RECEIVED', payment: { id: (await db.get('SELECT pay_ref FROM appointments WHERE id = ?', [apptId])).pay_ref } };
  assert.equal((await call('POST', `/webhooks/asaas/${pilot.salonId}`, { body: hook, headers: { 'asaas-access-token': 'tok-salao' } })).status, 200);
  let a = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
  assert.equal(a.status, 'scheduled'); assert.equal(a.pay_status, 'paid'); assert.equal(a.paid_cents, svc.price_cents);
  // webhook repetido não duplica nada
  assert.equal((await call('POST', `/webhooks/asaas/${pilot.salonId}`, { body: hook, headers: { 'asaas-access-token': 'tok-salao' } })).data.duplicate, true);

  // falta: retém 30% e devolve 70% pelo Asaas
  const r = await call('PATCH', `/api/appointments/${apptId}`, { body: { status: 'noshow' } });
  assert.equal(r.status, 200);
  const retained = Math.round(svc.price_cents * 0.3);
  assert.equal(r.data.money.retained, retained);
  assert.equal(r.data.money.refunded, svc.price_cents - retained);
  const refund = asaasCalls.filter((c) => c.path.endsWith('/refund')).pop();
  assert.equal(refund.body.value, (svc.price_cents - retained) / 100);
  a = await db.get('SELECT * FROM appointments WHERE id = ?', [apptId]);
  assert.equal(a.pay_status, 'partial_refund'); assert.equal(a.refunded_cents, svc.price_cents - retained);
  await db.run('UPDATE salons SET deposit_required = 0 WHERE id = ?', [pilot.salonId]);
});

test('reserva sem pagamento em 15 minutos libera o horário', async () => {
  const { expirePendingPayments } = await import('../server/payments.js');
  const id = u.uid();
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const c = await db.get('SELECT id FROM clients WHERE salon_id = ? LIMIT 1', [pilot.salonId]);
  const st = await db.get('SELECT id FROM staff WHERE salon_id = ? LIMIT 1', [pilot.salonId]);
  const sv = await db.get('SELECT id FROM services WHERE salon_id = ? LIMIT 1', [pilot.salonId]);
  await db.run("INSERT INTO appointments (id, salon_id, client_id, staff_id, service_id, starts_at, ends_at, status, price_cents, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, pilot.salonId, c.id, st.id, sv.id, '2031-01-01T12:00:00.000Z', '2031-01-01T12:30:00.000Z', 'pending_payment', 1000, old]);
  await expirePendingPayments();
  assert.equal((await db.get('SELECT status FROM appointments WHERE id = ?', [id])).status, 'cancelled');
});

test('clube: intervalos 7/15/30/45/60 geram 6 visitas e rejeitam outros valores', async () => {
  const pub = (await call('GET', `/api/public/salons/${SLUG}`)).data;
  const svc = pub.services[0];
  const staff = pub.staff.find((s) => s.service_ids.includes(svc.id));
  const client = (await call('GET', '/api/clients')).data.clients[0];
  const mk = (interval_days) => call('POST', '/api/club', { body: { client_id: client.id, service_id: svc.id, staff_id: staff.id, interval_days, preferred_time: '10:00', discount_pct: 10 } });
  assert.equal((await mk(20)).status, 422);
  for (const d of [7, 15, 30, 45, 60]) {
    const r = await mk(d);
    assert.equal(r.status, 200, `intervalo ${d}`);
    assert.equal(r.data.visits.length, 6);
    assert.equal(r.data.visit_cents, Math.round(svc.price_cents * 0.9));
    const gap = (Date.parse(r.data.visits[1]) - Date.parse(r.data.visits[0])) / 86400_000;
    assert.ok(Math.abs(gap - d) <= 4, `espaçamento ${gap} para ${d}`);
  }
  const list = (await call('GET', '/api/club')).data;
  assert.equal(list.memberships.filter((m) => m.status === 'active').length, 5);
  const first = list.memberships.find((m) => m.status === 'active');
  const cancel = await call('POST', `/api/club/${first.id}/cancel`);
  assert.equal(cancel.status, 200); assert.equal(cancel.data.released, 6);
});

test('plano limita profissionais ativos depois do teste', async () => {
  await db.run("UPDATE salons SET status = 'active', plan = 'smart' WHERE id = ?", [pilot.salonId]);
  const r = await call('POST', '/api/staff', { body: { name: 'Novo Profissional' } });
  assert.equal(r.status, 402);
  assert.match(r.data.error || r.data.message || JSON.stringify(r.data), /plano permite até 1/);
  await db.run("UPDATE salons SET status = 'active', plan = 'medio' WHERE id = ?", [pilot.salonId]);
});

test('webhook do Asaas: só confirma pagamento quitado, com valor e referência certos, e permite reenvio se falhar', async () => {
  await db.run('UPDATE salons SET deposit_required = 1 WHERE id = ?', [pilot.salonId]);
  const pub = (await call('GET', `/api/public/salons/${SLUG}`)).data;
  const svc = pub.services[1];
  let date = u.addDays(u.localDate(new Date()), 5), slots = [];
  for (let i = 0; i < 10 && !slots.length; i++, date = u.addDays(date, 1)) {
    slots = (await call('GET', `/api/public/salons/${SLUG}/slots?service_id=${svc.id}&date=${date}`)).data.slots;
  }
  const body = { service_id: svc.id, starts_at: slots[0].startsAt, name: 'Bia Valores', phone: '(11) 95555-4433', cpf_cnpj: '12345678909', pay_method: 'PIX', accept_policy: true };
  const ok = await call('POST', `/api/public/salons/${SLUG}/book`, { body });
  assert.equal(ok.status, 200);
  const id = ok.data.appointment.id;
  const hdr = { 'asaas-access-token': 'tok-salao' };
  const hook = (event, payId) => call('POST', `/webhooks/asaas/${pilot.salonId}`, { body: { id: `evt_${event}_${payId}`, event, payment: { id: payId } }, headers: hdr });

  await hook('PAYMENT_RECEIVED', 'pay_barato');   // valor diferente do combinado
  await hook('PAYMENT_RECEIVED', 'pay_pendente'); // ainda não quitado
  assert.equal((await db.get('SELECT status FROM appointments WHERE id = ?', [id])).status, 'pending_payment');

  failNextGet = true; // a consulta ao Asaas falha: precisa devolver erro para o Asaas reenviar
  const first = await hook('PAYMENT_RECEIVED', 'pay_ok');
  assert.equal(first.status, 500);
  const again = await hook('PAYMENT_RECEIVED', 'pay_ok'); // mesmo evento reenviado
  assert.equal(again.status, 200);
  assert.notEqual(again.data.duplicate, true);
  // o id do pagamento precisa ser o da reserva: pay_ok não é o criado, então segue pendente; o correto confirma
  const real = (await db.get('SELECT pay_ref FROM appointments WHERE id = ?', [id])).pay_ref;
  assert.equal((await hook('PAYMENT_RECEIVED', real)).status, 200);
  assert.equal((await db.get('SELECT status, pay_status FROM appointments WHERE id = ?', [id])).pay_status, 'paid');
  await db.run('UPDATE salons SET deposit_required = 0 WHERE id = ?', [pilot.salonId]);
});
