import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { migrate, pool, resetForTests } from '../src/db.js';
import { nowLocal, addDays } from '../src/time.js';

let server: Server; let base = '';
before(async () => {
  process.env.NODE_ENV = 'test';
  await migrate(false); await resetForTests();
  server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});
after(async () => { server.close(); await pool.end(); });

async function api(path: string, opts: { method?: string; token?: string; body?: unknown; raw?: Buffer; type?: string } = {}) {
  const r = await fetch(base + path, {
    method: opts.method ?? (opts.body || opts.raw ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...(opts.raw ? { 'content-type': opts.type ?? 'image/jpeg' } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: (opts.raw ? new Uint8Array(opts.raw) : undefined) ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* binário */ }
  return { status: r.status, json, headers: r.headers, raw: text };
}
const reg = (n: string, email: string) => api('/auth/register', { body: { lavacarName: n, ownerName: 'Dono Teste', email, phone: '11999998888', password: 'Senha-forte-123', acceptTerms: true } });

let A = ''; let B = ''; let slugA = '';
test('cadastro exige aceite do contrato e senha forte', async () => {
  assert.equal((await api('/auth/register', { body: { lavacarName: 'X Lava', ownerName: 'Fulano', email: 'x@x.com', password: 'Senha-forte-123', acceptTerms: false } })).status, 400);
  assert.equal((await api('/auth/register', { body: { lavacarName: 'X Lava', ownerName: 'Fulano', email: 'x@x.com', password: '123', acceptTerms: true } })).status, 400);
  const a = await reg('Lava Brilho', 'a@teste.com'); assert.equal(a.status, 201); A = a.json.token; slugA = a.json.slug;
  const b = await reg('Lava Outro', 'b@teste.com'); B = b.json.token;
  assert.equal((await reg('Lava Brilho', 'a@teste.com')).status, 409);
});

test('cabeçalhos de segurança e sem sessão = 401', async () => {
  const r = await api('/r/customer');
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('strict-transport-security') ?? '', /max-age/);
  const forged = await api('/r/customer', { token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.' });
  assert.equal(forged.status, 401);
});

test('bloqueio após 5 senhas erradas', async () => {
  await reg('Lava Bloq', 'bloq@teste.com');
  for (let i = 0; i < 5; i++) assert.equal((await api('/auth/login', { body: { email: 'bloq@teste.com', password: 'errada-errada1' } })).status, 401);
  assert.equal((await api('/auth/login', { body: { email: 'bloq@teste.com', password: 'Senha-forte-123' } })).status, 429);
});

test('isolamento entre lava-rápidos', async () => {
  const cust = await api('/r/customer', { token: A, body: { name: 'Maria Silva', whatsapp: '11988887777', cpf: '529.982.247-25' } });
  assert.equal(cust.status, 201);
  assert.equal(cust.json.data.cpf, '***.***.***-25'); // lista/criação mascaram o CPF
  const asB = await api(`/r/customer/${cust.json.id}`, { token: B });
  assert.equal(asB.status, 404);
  assert.equal((await api('/r/customer', { token: B })).json.length, 0);
  const full = await api(`/r/customer/${cust.json.id}`, { token: A });
  assert.equal(full.json.data.cpf, '52998224725');
  const row = await pool.query("SELECT data FROM records WHERE id = $1", [cust.json.id]);
  assert.ok(!JSON.stringify(row.rows[0].data).includes('52998224725'), 'CPF não pode ficar em texto puro no banco');
  assert.equal((await api('/r/customer', { token: A, body: { name: 'Zé', cpf: '111.111.111-11' } })).status, 400);
});

test('fluxo completo: check-in, pronto, entrega, cashback, estoque e nota', async () => {
  const customers = (await api('/r/customer', { token: A })).json;
  const customer = customers[0];
  await api(`/r/customer/${customer.id}`, { token: A, method: 'PUT', body: { cashbackOptIn: true, consentMarketing: true } });
  const veh = await api('/r/vehicle', { token: A, body: { customerId: customer.id, plate: 'abc-1d23', brand: 'Toyota', model: 'Hilux', year: 2022, categoryKey: 'utilitario' } });
  assert.equal(veh.status, 201); assert.equal(veh.json.data.plate, 'ABC1D23');
  const svcs = (await api('/r/service', { token: A })).json;
  const completa = svcs.find((s: any) => s.data.name === 'Lavagem completa');
  const checklist = (await api('/r/checklistItem', { token: A })).json;
  const marks: Record<string, string[]> = { [checklist[0].id]: ['risco'] };
  const noAgree = await api('/orders', { token: A, body: { customerId: customer.id, vehicleId: veh.json.id, serviceIds: [completa.id], checkin: { checklist: marks, customerAgrees: false } } });
  assert.equal(noAgree.status, 400);
  const o = await api('/orders', { token: A, body: { customerId: customer.id, vehicleId: veh.json.id, serviceIds: [completa.id], checkin: { checklist: marks, fuel: '1/2', km: 45000, customerAgrees: true, photoConsent: true } } });
  assert.equal(o.status, 201);
  assert.equal(o.json.data.totalCents, 9000); // utilitário: R$ 90
  assert.equal(o.json.data.number, 1);
  // foto: arquivo falso é recusado; imagem real é regravada
  const fake = await api(`/photos?phase=checkin&angle=frente&orderId=${o.json.id}`, { token: A, raw: Buffer.from('<?php system($_GET[0]); ?>'.padEnd(200, ' ')), type: 'image/jpeg' });
  assert.equal(fake.status, 400);
  const img = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#38f' } }).jpeg().toBuffer();
  const ph = await api(`/photos?phase=checkin&angle=frente&orderId=${o.json.id}`, { token: A, raw: img });
  assert.equal(ph.status, 201);
  assert.equal((await api(`/photos/${ph.json.id}/file`, { token: B })).status, 404);
  // pronto -> aviso na fila
  const ready = await api(`/orders/${o.json.id}/ready`, { token: A, body: {} });
  assert.equal(ready.status, 200); assert.ok(ready.json.avisosEnfileirados >= 1);
  // entrega com dano novo
  const out: Record<string, string[]> = { [checklist[0].id]: ['risco'], [checklist[1].id]: ['amassado'] };
  const bad = await api(`/orders/${o.json.id}/deliver`, { token: A, body: { checklist: out, customerAgrees: true, payments: [{ method: 'pix', amountCents: 5000 }] } });
  assert.equal(bad.status, 400); // não soma o total
  const del = await api(`/orders/${o.json.id}/deliver`, { token: A, body: { checklist: out, customerAgrees: true, payments: [{ method: 'pix', amountCents: 9000 }] } });
  assert.equal(del.status, 200);
  assert.equal(del.json.newIssues.length, 1); assert.equal(del.json.newIssues[0].states[0], 'amassado'); // o risco já existia na entrada
  assert.equal(del.json.cashbackEarnedCents, 450); // 5% de R$ 90
  const again = await api(`/orders/${o.json.id}/deliver`, { token: A, body: { checklist: out, customerAgrees: true, payments: [{ method: 'pix', amountCents: 9000 }] } });
  assert.equal(again.status, 409);
  const pays = (await api('/finance/payments', { token: A })).json;
  assert.equal(pays[0].data.platformFeeCents, 900); // 10% repasse
  const sum = (await api('/finance/summary', { token: A })).json;
  assert.equal(sum.receivedCents, 9000); assert.equal(sum.platformFeeCents, 900);
  const stock = (await api('/r/stockItem', { token: A })).json.find((i: any) => i.data.name === 'Shampoo automotivo');
  assert.equal(stock.data.qty, 19960); // baixou 40 mL
  assert.equal((await api('/finance/invoices', { token: A })).json.length, 1);
  // cashback usado na próxima (mínimo de resgate zerado para o teste)
  const cur = (await api('/settings', { token: A })).json.settings;
  await api('/settings', { token: A, method: 'PUT', body: { loyalty: { ...cur.loyalty, minRedeemCents: 0 } } });
  const o2 = await api('/orders', { token: A, body: { customerId: customer.id, vehicleId: veh.json.id, serviceIds: [completa.id], checkin: { checklist: {}, customerAgrees: true } } });
  const d2 = await api(`/orders/${o2.json.id}/deliver`, { token: A, body: { checklist: {}, customerAgrees: true, cashbackUseCents: 450, payments: [{ method: 'dinheiro', amountCents: 8550 }] } });
  assert.equal(d2.status, 200);
  const tooMuch = await api('/orders', { token: A, body: { customerId: customer.id, vehicleId: veh.json.id, serviceIds: [completa.id], checkin: { checklist: {}, customerAgrees: true } } });
  const d3 = await api(`/orders/${tooMuch.json.id}/deliver`, { token: A, body: { checklist: {}, customerAgrees: true, cashbackUseCents: 9999, payments: [] } });
  assert.equal(d3.status, 400);
});

test('agenda: respeita horário, boxes e agendamento online', async () => {
  const info = await api(`/public/l/${slugA}`);
  assert.equal(info.status, 200);
  assert.ok(!JSON.stringify(info.json).includes('cpf'));
  const sid = info.json.services.find((s: any) => s.name === 'Lavagem só externa').id;
  // próximo dia útil (seg-sex) com horário
  let date = addDays(nowLocal().date, 1);
  while ([0].includes(new Date(date + 'T12:00:00Z').getUTCDay())) date = addDays(date, 1);
  const slots = await api(`/public/l/${slugA}/slots?date=${date}&serviceIds=${sid}`);
  assert.ok(slots.json.slots.length > 5);
  const start = slots.json.slots[2].start;
  const book = { name: 'João Cliente', whatsapp: '(11) 97777-6666', email: '', plate: 'XYZ9A87', brand: 'Fiat', model: 'Argo', year: 2021, categoryKey: 'carro', serviceIds: [sid], start, consentMarketing: true, acceptTerms: true };
  assert.equal((await api(`/public/l/${slugA}/book`, { body: { ...book, website: 'http://spam' } })).status, 400); // isca anti-robô
  assert.equal((await api(`/public/l/${slugA}/book`, { body: book })).status, 201);
  const b2 = { ...book, name: 'Outro Cliente', whatsapp: '11966665555', plate: 'DEF4G56' };
  assert.equal((await api(`/public/l/${slugA}/book`, { body: b2 })).status, 201); // 2 boxes
  const b3 = { ...book, name: 'Terceiro', whatsapp: '11955554444', plate: 'GHI7J89' };
  assert.equal((await api(`/public/l/${slugA}/book`, { body: b3 })).status, 409); // lotado
  const day = await api(`/agenda?from=${date}`, { token: A });
  assert.equal(day.json.length, 2);
  assert.equal((await api(`/agenda?from=${date}`, { token: B })).json.length, 0);
});

test('vitrine exige consentimento e foto do cliente certo', async () => {
  const orders = (await api('/orders', { token: A })).json;
  const withConsent = orders.find((o: any) => o.data.checkin.photoConsent);
  const noConsent = orders.find((o: any) => !o.data.checkin.photoConsent);
  const img = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  const p1 = (await api(`/photos?phase=checkin&orderId=${noConsent.id}`, { token: A, raw: img })).json.id;
  const p2 = (await api(`/photos?phase=checkout&orderId=${noConsent.id}`, { token: A, raw: img })).json.id;
  const r = await api('/showcase', { token: A, body: { orderId: noConsent.id, beforePhotoId: p1, afterPhotoId: p2, title: 'Antes e depois', plateHidden: true } });
  assert.equal(r.status, 409);
  const q1 = (await api(`/photos?phase=checkin&orderId=${withConsent.id}`, { token: A, raw: img })).json.id;
  const q2 = (await api(`/photos?phase=checkout&orderId=${withConsent.id}`, { token: A, raw: img })).json.id;
  const ok = await api('/showcase', { token: A, body: { orderId: withConsent.id, beforePhotoId: q1, afterPhotoId: q2, title: 'Hilux como nova', plateHidden: true } });
  assert.equal(ok.status, 201);
  assert.equal((await api(`/public/l/${slugA}/photo/${q1}`)).status, 200);
  assert.equal((await api(`/public/l/${slugA}/photo/${p1}`)).status, 404); // não publicada
  await api(`/showcase/${ok.json.id}/unpublish`, { token: A, body: {} });
  assert.equal((await api(`/public/l/${slugA}/photo/${q1}`)).status, 404);
});

test('clube e precificação', async () => {
  const v = (await api('/r/vehicle', { token: A })).json.find((x: any) => x.data.plate === 'ABC1D23'); const c = { id: v.data.customerId };
  const plans = (await api('/r/plan', { token: A })).json;
  const quinzenal = plans.find((p: any) => p.data.frequency === 'quinzenal');
  const sub = await api('/club/subscriptions', { token: A, body: { customerId: c.id, vehicleId: v.id, planId: quinzenal.id } });
  assert.equal(sub.status, 201); assert.equal(sub.json.priceCents, 17500);
  assert.equal((await api('/club/subscriptions', { token: A, body: { customerId: c.id, vehicleId: v.id, planId: quinzenal.id } })).status, 409);
  await api('/r/expense', { token: A, body: { description: 'Aluguel', kind: 'fixa', category: 'aluguel', amountCents: 400000, dueDate: nowLocal().date, recurring: 'mensal' } });
  const pr = await api('/finance/pricing?washesPerMonth=300', { token: A });
  assert.equal(pr.status, 200); assert.ok(pr.json.breakEvenWashes > 0); assert.ok(pr.json.services[0].byCategory.carro.suggestedCents > 0);
});

test('API de plataforma é negada ao dono e cron exige segredo', async () => {
  assert.equal((await api('/platform/tenants', { token: A })).status, 403);
  assert.equal((await api('/cron/tick')).status, 401);
  assert.equal((await api('/webhooks/asaas', { body: { event: 'PAYMENT_RECEIVED', payment: { id: 'x' } } })).status, 401);
});
