// Captação pela base da Receita (somente salão comercial): termo, busca, funil, planilha, bloqueio e convites por e-mail.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';
process.env.BASE_URL = 'https://app.studiobeautybarber.com';
process.env.HQ_SLUG = 'studio-beauty-barber-piloto'; // neste teste o salão piloto faz o papel de salão comercial

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');
const { tick } = await import('../server/scheduler.js');
const { saveIntegration } = await import('../server/integrations/store.js');
const P = await import('../server/prospect.js');

const PW = 'Piloto-Forte-2026';
const realFetch = globalThis.fetch;
const resendCalls = [];
// Resend simulado: o teste não envia e-mail de verdade
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('resend.com')) { resendCalls.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ id: 're_msg_1' }), text: async () => '{"id":"re_msg_1"}' }; }
  return realFetch(url, opts);
};
let server, base, cookie, salonId;

async function call(method, path, body, withCookie = true) {
  const h = {};
  if (withCookie && cookie) h.cookie = cookie;
  if (method !== 'GET') h['x-requested-with'] = 'sbb';
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, data, headers: r.headers };
}
const company = (o) => ({ cnpj: '10000000000001', legal_name: 'EMPRESA LTDA', trade_name: 'SALÃO TESTE', cnae: '9602501', uf: 'PR', city: 'MARINGA', city_norm: 'maringa', district: 'CENTRO', address: 'RUA A, 1', phone: '5544991230001', email: 'a@teste.com', is_mei: 0, opened_at: '20240101', ...o });
async function addCompany(o) {
  const c = company(o);
  await db.run('INSERT INTO company_base (cnpj, legal_name, trade_name, cnae, uf, city, city_norm, district, address, phone, email, is_mei, opened_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [c.cnpj, c.legal_name, c.trade_name, c.cnae, c.uf, c.city, c.city_norm, c.district, c.address, c.phone, c.email, c.is_mei, c.opened_at]);
}

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await seedPilot({ ownerPassword: PW });
  salonId = await ensureHq();
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const l = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify({ email: 'piloto@studiobeautybarber.com', password: PW }) });
  cookie = l.headers.getSetCookie()[0].split(';')[0];
  await addCompany({});
  await addCompany({ cnpj: '10000000000002', trade_name: 'BARBEARIA MEI', is_mei: 1, phone: '5544991230002', email: null });
  await addCompany({ cnpj: '10000000000003', trade_name: '=HYPERLINK("http://x")', phone: '5544991230003', email: 'c@teste.com' });
  await addCompany({ cnpj: '10000000000004', trade_name: 'SEM CONTATO', phone: null, email: null });
  await addCompany({ cnpj: '10000000000005', trade_name: 'OUTRO ESTADO', uf: 'SP', city: 'SAO PAULO', city_norm: 'sao paulo' });
  await addCompany({ cnpj: '10000000000006', trade_name: 'OFICINA', cnae: '4520001' });
});
after(async () => { globalThis.fetch = realFetch; server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('sem login é negado, e a busca exige o termo de responsabilidade', async () => {
  assert.equal((await call('GET', '/api/prospect/status', undefined, false)).status, 401);
  const st = (await call('GET', '/api/prospect/status')).data;
  assert.equal(st.terms.accepted, false); assert.equal(st.base.total, 6);
  assert.equal((await call('POST', '/api/prospect/search', { cnaes: ['9602501'], uf: 'PR' })).status, 402);
  assert.equal((await call('POST', '/api/prospect/terms', { signer_name: 'Robson Ravel', signer_document: '12345678909' })).status, 200);
  assert.equal((await call('GET', '/api/prospect/status')).data.terms.accepted, true);
});

test('busca por segmento e estado: ignora inativos sem contato, outro estado e outro segmento; filtro de MEI', async () => {
  const r = await call('POST', '/api/prospect/search', { cnaes: ['9602501'], uf: 'PR', limit: 50 });
  assert.equal(r.status, 200);
  const names = r.data.results.map((x) => x.name).sort();
  assert.deepEqual(names, ['=HYPERLINK("http://x")', 'BARBEARIA MEI', 'SALÃO TESTE']);
  const noMei = (await call('POST', '/api/prospect/search', { cnaes: ['9602501'], uf: 'PR', mei: 'EXCLUDE' })).data.results;
  assert.ok(!noMei.some((x) => x.name === 'BARBEARIA MEI'));
  assert.equal((await call('POST', '/api/prospect/search', { cnaes: ['9602501'] })).status, 422); // sem estado nem cidade
  const byCity = (await call('POST', '/api/prospect/search', { cnaes: ['9602501'], city: 'Maringá' })).data.results; // acento e caixa não atrapalham
  assert.equal(byCity.length, 3);
});

test('salvar leva ao funil sem repetir e a busca seguinte não mostra quem já foi salvo', async () => {
  const s = await call('POST', '/api/prospect/save', { documents: ['10000000000001', '10000000000002', '10000000000003'] });
  assert.equal(s.data.saved, 3);
  assert.equal((await call('POST', '/api/prospect/save', { documents: ['10000000000001'] })).data.saved, 0);
  const lead = await db.get("SELECT * FROM leads WHERE document = '10000000000001'");
  assert.equal(lead.source, 'cnpj_public'); assert.equal(lead.consent, 0);
  assert.equal((await call('POST', '/api/prospect/search', { cnaes: ['9602501'], uf: 'PR' })).data.results.length, 0);
});

test('planilha traz link de WhatsApp e protege contra fórmula maliciosa', async () => {
  const r = await fetch(base + '/api/prospect/export', { headers: { cookie } });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM para o Excel abrir os acentos certos
  const t = buf.toString('utf8');
  assert.match(t, /https:\/\/wa\.me\/5544991230001/);
  assert.ok(!/;"=HYPERLINK/.test(t) && /"'=HYPERLINK/.test(t));

});

test('"não quero receber" bloqueia para sempre pelo hash e apaga o contato', async () => {
  const lead = await db.get("SELECT id FROM leads WHERE document = '10000000000002'");
  assert.equal((await call('POST', '/api/prospect/optout', { lead_ids: [lead.id] })).data.optedOut, 1);
  const after = await db.get('SELECT phone, email, stage FROM leads WHERE id = ?', [lead.id]);
  assert.equal(after.phone, null); assert.equal(after.stage, 'lost');
  // outra empresa com o mesmo telefone bloqueado não volta nas buscas
  await addCompany({ cnpj: '10000000000009', trade_name: 'MESMO TELEFONE', phone: '5544991230002', email: null });
  const r = (await call('POST', '/api/prospect/search', { cnaes: ['9602501'], uf: 'PR' })).data.results;
  assert.ok(!r.some((x) => x.document === '10000000000009'));
  assert.ok(await db.get('SELECT 1 AS x FROM lead_blocks WHERE salon_id = ? AND hash = ?', [salonId, P.blockHash('cnpj', '10000000000002')]));
});

test('convite por e-mail: exige e-mail conectado, agenda em dia útil, envia no horário e o link de sair bloqueia', async () => {
  const leads = (await db.all("SELECT id FROM leads WHERE document IN ('10000000000001','10000000000003')")).map((l) => l.id);
  assert.equal((await call('POST', '/api/prospect/invites', { lead_ids: leads, subject: 'Olá, tudo bem?', body: 'Conheça o Studio Beauty Barber: agenda online e reserva paga.', per_day: 1 })).status, 409);
  await saveIntegration(salonId, 'email', { apiKey: 're_teste', from: 'contato@studiobeautybarber.com' });
  const ok = await call('POST', '/api/prospect/invites', { lead_ids: leads, subject: 'Olá, tudo bem?', body: 'Conheça o Studio Beauty Barber: agenda online e reserva paga.', per_day: 1 });
  assert.equal(ok.status, 200); assert.equal(ok.data.scheduled, 2);
  const inv = await db.all('SELECT * FROM prospect_invites ORDER BY scheduled_at');
  assert.equal(inv.length, 2);
  for (const i of inv) { const wd = new Date(i.scheduled_at).getUTCDay(); assert.ok(wd >= 1 && wd <= 5, 'só dia útil'); }
  assert.notEqual(inv[0].scheduled_at.slice(0, 10), inv[1].scheduled_at.slice(0, 10)); // 1 por dia

  // fora do horário comercial nada sai; no horário, sai e o lead vira "contatado"
  const night = new Date(new Date(inv[0].scheduled_at).getTime() + 12 * 3600_000 * 0); // mesmo instante (09h local = 12h UTC)
  assert.equal((await tick(new Date(Date.parse(inv[0].scheduled_at) - 3600_000))).invites, 0);
  const s = await tick(new Date(Date.parse(inv[0].scheduled_at) + 60_000));
  assert.equal(s.invites, 1);
  assert.equal((await db.get('SELECT status FROM prospect_invites WHERE id = ?', [inv[0].id])).status, 'sent');
  assert.equal((await db.get('SELECT stage FROM leads WHERE id = ?', [inv[0].lead_id])).stage, 'contacted');
  assert.equal(resendCalls.length, 1);
  assert.match(JSON.stringify(resendCalls[0]), /api\/public\/optout\//); // todo convite leva o link para sair
  void night;

  // quem clica em "sair" deixa de receber os envios pendentes
  const out = await fetch(base + `/api/public/optout/${inv[1].token}`);
  assert.equal(out.status, 200); assert.match(await out.text(), /não receberá mais/);
  assert.equal((await db.get('SELECT status FROM prospect_invites WHERE id = ?', [inv[1].id])).status, 'cancelled');
});
