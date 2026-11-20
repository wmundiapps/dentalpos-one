// Carteira de crédito: recarga por Pix (Asaas simulado) e no balcão, pagamento de comanda com desconto, saldo atômico,
// estorno, ajuste do gerente, Pix estornado e resposta do robô.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const { saveIntegration } = await import('../server/integrations/store.js');
const { handleInbound } = await import('../server/bot.js');
const { walletDiscountCents, getBalance } = await import('../server/wallet.js');

const PW = 'Piloto-Forte-2026';
let server, base, pilot, owner, reception, client, service, product;
const payments = new Map();
const realFetch = globalThis.fetch;

async function login(email) {
  const l = await realFetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify({ email, password: PW }) });
  return l.headers.getSetCookie()[0].split(';')[0];
}
async function call(method, path, { body, headers = {}, as = owner } = {}) {
  const h = { ...headers };
  if (as && !path.startsWith('/webhooks')) h.cookie = as;
  if (method !== 'GET') h['x-requested-with'] = 'sbb';
  let payload;
  if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await realFetch(base + path, { method, headers: h, body: payload });
  const t = await r.text(); let data = null; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const hook = (event, payId, extra = {}) => call('POST', `/webhooks/asaas/${pilot.salonId}`, { body: { id: `evt_${event}_${payId}_${extra.n || 0}`, event, payment: { id: payId } }, headers: { 'asaas-access-token': 'tok-salao' } });
const balance = async () => (await call('GET', `/api/wallet/clients/${client.id}`)).data.balance_cents;
const sale = (items, extra = {}) => call('POST', '/api/sales', { body: { client_id: client.id, payment_method: 'wallet', items, ...extra } });

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await ensureHq();
  pilot = await seedPilot({ ownerPassword: PW });
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await login('piloto@studiobeautybarber.com');
  reception = await login('recepcao.piloto@studiobeautybarber.com');
  globalThis.fetch = async (url, opts = {}) => {
    if (!String(url).includes('asaas.com')) return realFetch(url, opts);
    const path = String(url).split('/v3')[1];
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (path === '/customers') return ok({ id: 'cus_1' });
    if (path === '/payments' && method === 'POST') {
      const id = `pay_w${payments.size + 1}`;
      payments.set(id, { id, externalReference: body.externalReference, value: body.value, status: 'PENDING' });
      return ok({ ...payments.get(id), invoiceUrl: 'https://sandbox.asaas.com/i/x' });
    }
    if (path.endsWith('/pixQrCode')) return ok({ payload: '000201WALLETPIX', encodedImage: 'AAAA' });
    if (method === 'DELETE') { payments.get(path.split('/')[2]).deleted = true; return ok({ deleted: true }); }
    if (path.startsWith('/payments/') && method === 'GET') return ok(payments.get(path.split('/')[2]));
    return ok({});
  };
  await saveIntegration(pilot.salonId, 'asaas', { apiKey: 'chave-de-teste', sandbox: 'true', webhookToken: 'tok-salao' });
  client = (await call('GET', '/api/clients')).data.clients[0];
  service = (await call('GET', '/api/services')).data.services.find((s) => s.active && s.price_cents >= 3000);
  product = (await call('GET', '/api/products')).data.products.find((p) => p.active && p.stock >= 3);
  await db.run('UPDATE clients SET phone = ? WHERE id = ?', ['5511988887777', client.id]);
});
after(async () => { globalThis.fetch = realFetch; server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('desconto de benefício: arredonda em centavos e só incide sobre serviços', () => {
  assert.equal(walletDiscountCents(4000, 10), 400);
  assert.equal(walletDiscountCents(3333, 10), 333);
  assert.equal(walletDiscountCents(4000, 0), 0);
});

test('recarga por Pix: cria cobrança no Asaas do salão, credita uma única vez no webhook e ignora valor errado', async () => {
  assert.equal((await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 500, method: 'pix' } })).status, 422); // abaixo do mínimo
  const r = await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 30000, method: 'pix', send: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'pending');
  assert.equal(r.data.pix.payload, '000201WALLETPIX');
  const tp = await db.get('SELECT * FROM wallet_topups WHERE id = ?', [r.data.id]);
  assert.equal(tp.asaas_payment_id, 'pay_w1');
  assert.equal(payments.get('pay_w1').externalReference, `wallet:${tp.id}`);
  assert.equal(await balance(), 0); // ainda não pagou

  payments.get('pay_w1').value = 1; payments.get('pay_w1').status = 'RECEIVED'; // pagou valor errado
  await hook('PAYMENT_RECEIVED', 'pay_w1');
  assert.equal(await balance(), 0);

  payments.get('pay_w1').value = 300; // valor certo
  await hook('PAYMENT_RECEIVED', 'pay_w1', { n: 1 });
  assert.equal(await balance(), 30000);
  await hook('PAYMENT_CONFIRMED', 'pay_w1', { n: 2 }); // outro evento do mesmo pagamento: não duplica
  assert.equal(await balance(), 30000);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM wallet_ledger WHERE kind = 'topup' AND ref_id = ?", [tp.id])).n, 1);
});

test('recarga no balcão: recepção até R$ 1.000, acima só gerente', async () => {
  const before = await balance();
  const ok = await call('POST', '/api/wallet/topups', { as: reception, body: { client_id: client.id, amount_cents: 5000, method: 'cash' } });
  assert.equal(ok.status, 200); assert.equal(ok.data.status, 'paid'); assert.equal(ok.data.balance_cents, before + 5000);
  assert.equal((await call('POST', '/api/wallet/topups', { as: reception, body: { client_id: client.id, amount_cents: 200000, method: 'cash' } })).status, 403);
  assert.equal((await call('POST', '/api/wallet/topups', { body: { client_id: 'nao-existe', amount_cents: 5000, method: 'cash' } })).status, 404);
  await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: -5000, note: 'Teste: desfaz o dinheiro do balcão' } });
  assert.equal(await balance(), before);
});

test('comanda paga com crédito: 10% só nos serviços, débito do saldo e extrato', async () => {
  const start = await balance();
  const r = await sale([{ kind: 'service', ref_id: service.id, qty: 1 }, { kind: 'product', ref_id: product.id, qty: 1 }]);
  assert.equal(r.status, 200);
  const disc = Math.round(service.price_cents * 0.1);
  assert.equal(r.data.wallet_discount_cents, disc);
  assert.equal(r.data.total_cents, service.price_cents + product.price_cents - disc);
  assert.equal(r.data.status, 'paid');
  assert.equal(await balance(), start - r.data.total_cents);
  const s = await db.get('SELECT * FROM sales WHERE id = ?', [r.data.id]);
  assert.equal(s.wallet_cents, r.data.total_cents); assert.equal(s.wallet_discount_cents, disc);
  const ledger = (await call('GET', `/api/wallet/clients/${client.id}`)).data.ledger;
  assert.equal(ledger[0].kind, 'spend'); assert.equal(ledger[0].amount_cents, -r.data.total_cents); assert.equal(ledger[0].balance_after, start - r.data.total_cents);
});

test('sem saldo suficiente a comanda não é criada; sem cliente também não', async () => {
  const bal = await balance();
  const n = (await db.get('SELECT COUNT(*) AS n FROM sales')).n;
  const big = await sale([{ kind: 'service', ref_id: service.id, qty: 50 }]);
  assert.equal(big.status, 409);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM sales')).n, n);
  assert.equal(await balance(), bal);
  const noClient = await call('POST', '/api/sales', { body: { payment_method: 'wallet', items: [{ kind: 'service', ref_id: service.id, qty: 1 }] } });
  assert.equal(noClient.status, 422);
});

test('duas comandas ao mesmo tempo nunca gastam o mesmo saldo duas vezes', async () => {
  const bal = await balance();
  const one = Math.round(service.price_cents * 0.9);
  // zera e deixa saldo para apenas uma comanda
  await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: -bal, note: 'Teste: zera o saldo' } });
  await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: one + 100, note: 'Teste: saldo para uma comanda' } });
  const results = await Promise.all([1, 2, 3].map(() => sale([{ kind: 'service', ref_id: service.id, qty: 1 }])));
  assert.equal(results.filter((x) => x.status === 200).length, 1);
  assert.equal(results.filter((x) => x.status === 409).length, 2);
  assert.equal(await balance(), 100);
});

test('estorno de comanda devolve o crédito, o estoque e só vale uma vez', async () => {
  await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: 20000, note: 'Teste: saldo' } });
  const stock0 = (await db.get('SELECT stock FROM products WHERE id = ?', [product.id])).stock;
  const r = await sale([{ kind: 'product', ref_id: product.id, qty: 2 }]);
  assert.equal(r.status, 200);
  assert.equal((await db.get('SELECT stock FROM products WHERE id = ?', [product.id])).stock, stock0 - 2);
  const bal = await balance();
  assert.equal((await call('POST', `/api/wallet/sales/${r.data.id}/reverse`, { as: reception })).status, 403); // só gerente
  const rev = await call('POST', `/api/wallet/sales/${r.data.id}/reverse`, { body: {} });
  assert.equal(rev.status, 200);
  assert.equal(await balance(), bal + r.data.total_cents);
  assert.equal((await db.get('SELECT stock FROM products WHERE id = ?', [product.id])).stock, stock0);
  assert.equal((await db.get('SELECT status FROM sales WHERE id = ?', [r.data.id])).status, 'refunded');
  assert.equal((await call('POST', `/api/wallet/sales/${r.data.id}/reverse`, { body: {} })).status, 409);
});

test('ajuste do gerente exige motivo, nunca deixa o saldo negativo e fica no extrato', async () => {
  const bal = await balance();
  assert.equal((await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: 1000 } })).status, 422); // sem motivo
  assert.equal((await call('POST', '/api/wallet/adjust', { as: reception, body: { client_id: client.id, amount_cents: 1000, note: 'Cortesia da casa' } })).status, 403);
  assert.equal((await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: -(bal + 1), note: 'Tentando passar do saldo' } })).status, 409);
  const ok = await call('POST', '/api/wallet/adjust', { body: { client_id: client.id, amount_cents: 1000, note: 'Cortesia da casa' } });
  assert.equal(ok.data.balance_cents, bal + 1000);
});

test('Pix de recarga estornado no Asaas tira o valor do saldo (até o que sobrou)', async () => {
  const r = await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 10000, method: 'pix' } });
  const payId = (await db.get('SELECT asaas_payment_id FROM wallet_topups WHERE id = ?', [r.data.id])).asaas_payment_id;
  payments.get(payId).status = 'RECEIVED';
  await hook('PAYMENT_RECEIVED', payId, { n: 5 });
  const bal = await balance();
  payments.get(payId).status = 'REFUNDED';
  await hook('PAYMENT_REFUNDED', payId, { n: 6 });
  assert.equal(await balance(), bal - 10000);
  assert.equal((await db.get('SELECT status FROM wallet_topups WHERE id = ?', [r.data.id])).status, 'reversed');
  await hook('PAYMENT_REFUNDED', payId, { n: 7 }); // repetido
  assert.equal(await balance(), bal - 10000);
});

test('Pix pendente: gerente confirma (e cancela a cobrança no Asaas); recepção não; vence em 3 dias', async () => {
  const { expireTopups } = await import('../server/wallet.js');
  const a = await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 2000, method: 'pix' } });
  const payA = (await db.get('SELECT asaas_payment_id FROM wallet_topups WHERE id = ?', [a.data.id])).asaas_payment_id;
  const bal = await balance();
  assert.equal((await call('POST', `/api/wallet/topups/${a.data.id}/confirm`, { as: reception, body: {} })).status, 403);
  assert.equal((await call('POST', `/api/wallet/topups/${a.data.id}/confirm`, { body: {} })).status, 200);
  assert.equal(await balance(), bal + 2000);
  assert.equal(payments.get(payA).deleted, true);
  assert.equal((await call('POST', `/api/wallet/topups/${a.data.id}/confirm`, { body: {} })).status, 404); // já confirmada

  const b = await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 2000, method: 'pix' } });
  await db.run("UPDATE wallet_topups SET created_at = ? WHERE id = ?", [new Date(Date.now() - 4 * 86400_000).toISOString(), b.data.id]);
  assert.equal(await expireTopups(), 1);
  assert.equal((await db.get('SELECT status FROM wallet_topups WHERE id = ?', [b.data.id])).status, 'expired');
});

test('painel mostra o saldo a prestar contas e o desconto dado; desligar a carteira bloqueia recarga e uso', async () => {
  const w = (await call('GET', '/api/wallet')).data;
  assert.equal(w.discount_pct, 10);
  assert.equal(w.summary.held_cents, w.accounts.reduce((a, x) => a + x.balance_cents, 0));
  assert.ok(w.summary.discount_given_cents > 0);
  assert.equal((await call('PATCH', '/api/settings', { body: { wallet_discount_pct: 15 } })).status, 200);
  assert.equal((await call('GET', '/api/wallet')).data.discount_pct, 15);
  await call('PATCH', '/api/settings', { body: { wallet_discount_pct: 10, wallet_enabled: false } });
  assert.equal((await call('POST', '/api/wallet/topups', { body: { client_id: client.id, amount_cents: 5000, method: 'cash' } })).status, 409);
  assert.equal((await sale([{ kind: 'service', ref_id: service.id, qty: 1 }])).status, 409);
  await call('PATCH', '/api/settings', { body: { wallet_enabled: true } });
});

test('robô responde o saldo do cliente pelo WhatsApp', async () => {
  const salon = await db.get('SELECT * FROM salons WHERE id = ?', [pilot.salonId]);
  await handleInbound(salon, { channel: 'whatsapp', externalId: '5511988887777', text: 'qual meu saldo?' });
  const last = await db.get("SELECT body FROM messages WHERE salon_id = ? AND direction = 'out' ORDER BY created_at DESC, id DESC LIMIT 1", [pilot.salonId]);
  assert.match(last.body, /saldo de crédito é R\$/);
  assert.match(last.body, /10%/);
  assert.equal(await getBalance(pilot.salonId, client.id) > 0, true);
});
