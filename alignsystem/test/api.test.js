// Teste ponta a ponta da API contra um Postgres de teste.
// Uso: TEST_DATABASE_URL=postgres://... npm test   (sem a variável, os testes de API são pulados)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const DB = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = DB || '';
process.env.DATABASE_SCHEMA = 'alignsystem_test';
process.env.SET_ROLE_SEARCH_PATH = 'false';
process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-24-caracteres';
process.env.APP_URL = 'http://localhost';
process.env.ASAAS_API_KEY = 'teste';
process.env.ASAAS_WEBHOOK_TOKEN = 'wh-token';

const skip = !DB && 'TEST_DATABASE_URL não definida';
let server, base, sql;
const jars = {};

// Simula o Asaas
const asaasCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.includes('asaas.com')) return realFetch(url, init);
  const body = init.body ? JSON.parse(init.body) : null;
  asaasCalls.push({ method: init.method, url: u, body });
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.includes('/customers?')) return json({ data: [] });
  if (u.endsWith('/customers')) return json({ id: 'cus_1' });
  if (u.endsWith('/accounts')) return json({ id: 'acc_1', walletId: 'wal_1' });
  if (u.endsWith('/payments') && init.method === 'POST') return json({ id: 'pay_1', installment: body.installmentCount ? 'ins_1' : null, invoiceUrl: 'https://asaas/i/1', status: 'PENDING' });
  if (u.includes('/installments/ins_1/payments')) return json({ data: [1, 2].map((n) => ({ id: 'pay_' + n, value: 100, dueDate: '2026-10-0' + n, status: 'PENDING', billingType: 'CREDIT_CARD', invoiceUrl: 'https://asaas/i/' + n })) });
  if (u.includes('/payments/pay_1')) return json({ id: 'pay_1', value: 250, dueDate: '2026-10-01', status: 'PENDING', billingType: 'PIX', invoiceUrl: 'https://asaas/i/1' });
  return json({});
};

async function call(method, path, { body, who, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (who && jars[who]) h.cookie = jars[who];
  let payload;
  if (raw) { payload = raw; h['content-type'] = 'image/jpeg'; }
  else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await realFetch(base + path, { method, headers: h, body: payload });
  const set = r.headers.get('set-cookie');
  if (set && who) jars[who] = set.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, data: ct.includes('json') ? await r.json() : await r.arrayBuffer() };
}

// JPEG mínimo válido (cabeçalho basta para a validação de tipo)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);

before(async () => {
  if (skip) return;
  const { db } = await import('../lib/db.js');
  const { migrate } = await import('../scripts/migrate.js');
  sql = db();
  await sql.unsafe('drop schema if exists alignsystem_test cascade');
  await migrate();
  const { default: handler } = await import('../lib/app.js');
  server = http.createServer(handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server?.close();
  await sql.unsafe('drop schema if exists alignsystem_test cascade');
  await sql.end();
});

test('fluxo completo: paciente, fotos, parecer, contrato, cobrança com split, parceiro', { skip }, async () => {
  // config pública
  const cfg = await call('GET', '/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.data.photoSlots.length, 7);

  // lead do paciente
  const bad = await call('POST', '/api/leads/paciente', { body: { name: 'A', whatsapp: '1', city: '', age: 5 } });
  assert.equal(bad.status, 400);
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Maria da Silva', age: 30, whatsapp: '(44) 99999-1111', city: 'Maringá', reason: 'Dentes tortos', consent: true } });
  assert.equal(lead.status, 201);
  const t = lead.data.token;

  // portal + fotos
  let portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.status, 200);
  assert.equal(portal.data.case.firstName, 'Maria');
  // termo de consentimento obrigatório antes das fotos
  assert.ok(portal.data.tcle?.body.includes('Teleodontologia'));
  assert.equal((await call('POST', `/api/portal/${t}/photos?slot=1`, { raw: JPEG })).status, 409);
  const ok = { agree: true, adult: true, hash: portal.data.tcle.hash, acceptedName: 'Maria da Silva', birthDate: '1995-04-10' };
  assert.equal((await call('POST', `/api/portal/${t}/consent`, { body: { ...ok, agree: false } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${t}/consent`, { body: { ...ok, hash: 'velho' } })).status, 409);
  assert.equal((await call('POST', `/api/portal/${t}/consent`, { body: { ...ok, adult: false } })).status, 400);
  const teen = new Date(); teen.setFullYear(teen.getFullYear() - 17);
  const tooYoung = await call('POST', `/api/portal/${t}/consent`, { body: { ...ok, birthDate: teen.toISOString().slice(0, 10) } });
  assert.equal(tooYoung.status, 400);
  assert.match(tooYoung.data.error, /maior de 18/);
  assert.match(portal.data.tcle.body, /não são gravadas[\s\S]*não podem ser recuperadas/);
  assert.equal((await call('POST', `/api/portal/${t}/consent`, { body: ok })).status, 201);
  const [consentRow] = await sql`select * from alignsystem_test.consents where case_code = ${lead.data.code}`;
  assert.equal(consentRow.accepted_name, 'Maria da Silva');
  assert.equal(new Date(consentRow.accepted_birth_date).toISOString().slice(0, 10), '1995-04-10');
  assert.ok(consentRow.ip);
  assert.equal(consentRow.body_hash, portal.data.tcle.hash);
  const txt = await call('GET', `/api/consent-text?v=${consentRow.version}`);
  assert.equal(txt.data.hash, consentRow.body_hash);
  // menor de idade: exige responsável
  const kid = await call('POST', '/api/leads/paciente', { body: { name: 'Pedro Menor', age: 15, whatsapp: '44977776666', city: 'Maringá', consent: true } });
  const kp = await call('GET', `/api/portal/${kid.data.token}`);
  assert.equal(kp.data.case.isMinor, true);
  const kidOk = { agree: true, adult: true, hash: kp.data.tcle.hash, acceptedName: 'Ana Menor Responsável', birthDate: '1980-01-20' };
  assert.equal((await call('POST', `/api/portal/${kid.data.token}/consent`, { body: { ...kidOk, acceptedName: '' } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${kid.data.token}/consent`, { body: { ...kidOk, birthDate: '2011-03-03' } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${kid.data.token}/consent`, { body: kidOk })).status, 201);
  const [kidRow] = await sql`select accepted_by_guardian, guardian_name from alignsystem_test.consents where case_code = ${kid.data.code}`;
  assert.equal(kidRow.accepted_by_guardian, true);
  assert.equal(kidRow.guardian_name, 'Ana Menor Responsável');
  const notImg = await call('POST', `/api/portal/${t}/photos?slot=1`, { raw: Buffer.from('não é imagem, só texto qualquer') });
  assert.equal(notImg.status, 415);
  const early = await call('POST', `/api/portal/${t}/submit`, { body: {} });
  assert.equal(early.status, 400);
  for (let s = 1; s <= 7; s++) assert.equal((await call('POST', `/api/portal/${t}/photos?slot=${s}`, { raw: JPEG })).status, 201);
  // trocar a foto 1 não duplica
  await call('POST', `/api/portal/${t}/photos?slot=1`, { raw: JPEG });
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.photos.length, 7);
  const img = await call('GET', `/api/portal/${t}/photos/${portal.data.photos[0].id}`);
  assert.equal(img.status, 200);
  assert.equal((await call('POST', `/api/portal/${t}/submit`, { body: {} })).status, 200);

  // admin
  const { hashPassword } = await import('../lib/auth.js');
  await sql`insert into users (email, name, role, password_hash) values ('admin@teste.com', 'Admin', 'admin', ${await hashPassword('senhaforte123')})`;
  assert.equal((await call('GET', '/api/admin/cases', { who: 'admin' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { who: 'admin', body: { email: 'admin@teste.com', password: 'errada' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { who: 'admin', body: { email: 'admin@teste.com', password: 'senhaforte123' } })).status, 200);
  const list = await call('GET', '/api/admin/cases?status=fotos_enviadas', { who: 'admin' });
  assert.equal(list.data.cases.length, 1);
  const caseId = list.data.cases[0].id;
  // busca por nome não pode casar com todos por causa do filtro de WhatsApp
  await call('POST', '/api/leads/paciente', { body: { name: 'João Souza', age: 40, whatsapp: '44988887777', city: 'Sarandi', consent: true } });
  const search = await call('GET', '/api/admin/cases?q=Maria', { who: 'admin' });
  assert.equal(search.data.cases.length, 1);
  const det = await call('GET', `/api/admin/cases/${caseId}`, { who: 'admin' });
  assert.equal(det.data.consents.length, 1);
  const proof = await call('GET', `/api/admin/consents/${det.data.consents[0].id}/comprovante`, { who: 'admin' });
  assert.equal(proof.status, 200);
  assert.match(Buffer.from(proof.data).toString('utf8'), /Comprovante de aceite eletrônico[\s\S]*Maria da Silva/);
  assert.equal((await call('GET', `/api/admin/consents/${det.data.consents[0].id}/comprovante`)).status, 401);

  // parecer ainda não publicado não aparece para o paciente
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { assessment: 'indicado', assessment_notes: 'Bom caso.' } });
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.case.assessment, null);
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { publish_assessment: true } });
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.case.assessment, 'indicado');
  assert.equal(portal.data.case.status, 'parecer_enviado');

  // parceiro
  const pl = await call('POST', '/api/leads/parceiro', { body: { name: 'Dra. Ana Lima', cro: '12345 / PR', whatsapp: '44991112222', email: 'ana@clinica.com', city: 'Maringá', experience: 'Já trato', consent: true } });
  assert.equal(pl.status, 201);
  const dl = await call('GET', '/api/admin/dentists', { who: 'admin' });
  const dentistId = dl.data.dentists[0].id;
  await call('PATCH', `/api/admin/dentists/${dentistId}`, { who: 'admin', body: { cpf_cnpj: '529.982.247-25', birth_date: '1990-05-10', address: 'Rua A', address_number: '10', province: 'Centro', postal_code: '87000-000', income_value: '15000' } });
  const badPct = await call('POST', `/api/admin/dentists/${dentistId}/approve`, { who: 'admin', body: { terms: { pctInstall: 50 } } });
  assert.equal(badPct.status, 400);
  const ap = await call('POST', `/api/admin/dentists/${dentistId}/approve`, { who: 'admin', body: { terms: { caseValue: '2200' } } });
  assert.equal(ap.status, 200);
  const termToken = new URL(ap.data.contractUrl).searchParams.get('t');
  const term = await call('GET', `/api/contracts/${termToken}`);
  assert.match(term.data.body, /R\$\s?2\.200,00/);
  assert.equal((await call('POST', `/api/contracts/${termToken}/accept`, { body: { name: 'Ana Lima', doc: '52998224725', agree: true, hash: 'x' } })).status, 409);
  assert.equal((await call('POST', `/api/contracts/${termToken}/accept`, { body: { name: 'Ana Lima', doc: '11111111111', agree: true, hash: term.data.hash } })).status, 400);
  assert.equal((await call('POST', `/api/contracts/${termToken}/accept`, { body: { name: 'Ana Lima', doc: '52998224725', agree: true, hash: term.data.hash } })).status, 200);
  const sub = await call('POST', `/api/admin/dentists/${dentistId}/asaas-account`, { who: 'admin', body: {} });
  assert.equal(sub.data.walletId, 'wal_1');

  // dentista cria senha e entra
  const pwToken = new URL(ap.data.setPasswordUrl).searchParams.get('t');
  assert.equal((await call('POST', '/api/auth/set-password', { who: 'dent', body: { token: pwToken, password: 'curta' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/set-password', { who: 'dent', body: { token: pwToken, password: 'dentista2026ok' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/set-password', { body: { token: pwToken, password: 'dentista2026ok' } })).status, 400); // link de uso único
  assert.equal((await call('GET', `/api/dentist/cases/${caseId}`, { who: 'dent' })).status, 404); // ainda não é dele
  assert.equal((await call('GET', '/api/admin/cases', { who: 'dent' })).status, 403);

  // direciona o caso, plano, contrato
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { dentist_id: dentistId, cpf: '529.982.247-25', address: 'Rua B, 20, Maringá/PR', email: 'maria@x.com' } });
  const noPlan = await call('POST', `/api/admin/cases/${caseId}/contract`, { who: 'admin', body: {} });
  assert.equal(noPlan.status, 400);
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { plan: { brand: 'ClearCorrect', months: 18, total: '11570', entry: '2000', entryInstallments: 18, monthlyCount: 30, monthlyValue: '319', dueDay: 10, replacementValue: '200' } } });
  const ct = await call('POST', `/api/admin/cases/${caseId}/contract`, { who: 'admin', body: {} });
  assert.equal(ct.status, 201);
  const ctToken = new URL(ct.data.url).searchParams.get('t');
  const doc = await call('GET', `/api/contracts/${ctToken}`);
  assert.match(doc.data.body, /ClearCorrect/);
  assert.equal((await call('POST', `/api/contracts/${ctToken}/accept`, { body: { name: 'Maria da Silva', doc: '52998224725', agree: true, hash: doc.data.hash } })).status, 200);
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.case.status, 'contrato_assinado');

  // cobrança parcelada com split fixo
  const ch = await call('POST', `/api/admin/cases/${caseId}/charges`, { who: 'admin', body: { kind: 'parcelada', billingType: 'CREDIT_CARD', value: '2000', installmentCount: 18, split: { type: 'fixed', value: '600' } } });
  assert.equal(ch.status, 201, JSON.stringify(ch.data));
  const payCall = asaasCalls.find((c) => c.url.endsWith('/payments') && c.method === 'POST');
  assert.equal(payCall.body.installmentCount, 18);
  assert.equal(payCall.body.totalValue, 2000);
  assert.deepEqual(payCall.body.split, [{ walletId: 'wal_1', totalFixedValue: 600 }]);
  const tooBig = await call('POST', `/api/admin/cases/${caseId}/charges`, { who: 'admin', body: { kind: 'avulsa', billingType: 'PIX', value: '100', split: { type: 'fixed', value: '150' } } });
  assert.equal(tooBig.status, 400);

  // webhook
  assert.equal((await call('POST', '/api/webhooks/asaas', { body: { event: 'PAYMENT_RECEIVED' } })).status, 401);
  const wh = await call('POST', '/api/webhooks/asaas', {
    headers: { 'asaas-access-token': 'wh-token' },
    body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', installment: 'ins_1', value: 111.11, dueDate: '2026-10-01', status: 'RECEIVED', billingType: 'CREDIT_CARD', paymentDate: '2026-10-01', externalReference: ch.data.id } },
  });
  assert.equal(wh.status, 200);
  const [paid] = await sql`select status, paid_at from alignsystem_test.payments where asaas_payment_id = 'pay_1'`;
  assert.equal(paid.status, 'RECEIVED');
  assert.ok(paid.paid_at);

  // dentista registra atendimento com foto; admin valida
  const dc = await call('GET', `/api/dentist/cases/${caseId}`, { who: 'dent' });
  assert.equal(dc.status, 200);
  assert.equal(dc.data.case.cpf, undefined); // CPF não vai para o dentista
  const ev = await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { milestone: 'instalacao', notes: 'Instalado.' } });
  assert.equal(ev.status, 201);
  assert.equal((await call('POST', `/api/dentist/evidences/${ev.data.id}/photos`, { who: 'dent', raw: JPEG })).status, 201);
  assert.equal((await call('POST', `/api/admin/evidences/${ev.data.id}/validate`, { who: 'admin', body: {} })).status, 200);
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.case.status, 'em_tratamento');
  assert.equal(portal.data.photos.length, 7); // foto do dentista não aparece no portal

  // teleorientação gera sala de vídeo
  const appt = await call('POST', `/api/admin/cases/${caseId}/appointments`, { who: 'admin', body: { kind: 'teleorientacao', starts_at: new Date(Date.now() + 3600e3).toISOString() } });
  assert.match(appt.data.room_url, /^https:\/\/meet\.jit\.si\/AlignSystem-/);

  // origem diferente é bloqueada em escrita
  assert.equal((await call('POST', '/api/auth/logout', { headers: { origin: 'https://malicioso.com' }, body: {} })).status, 403);
});

test('validações de documento', async () => {
  const { validCpf, validCnpj } = await import('../lib/util.js');
  assert.ok(validCpf('529.982.247-25'));
  assert.ok(!validCpf('111.111.111-11'));
  assert.ok(validCnpj('11.222.333/0001-81'));
  assert.ok(!validCnpj('11.222.333/0001-80'));
});

test('páginas públicas não citam preço, gratuidade nem condições de pagamento', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const dir = new URL('../public/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.html'));
  for (const f of files) {
    const text = (await readFile(new URL(f, dir), 'utf8')).replace(/<script[\s\S]*?<\/script>/g, '');
    assert.doesNotMatch(text, /gr[aá]tis|gratuit|sem custo|n[aã]o tem custo|de gra[cç]a|R\$\s?\d|\d+x|parcelamento facilitado|sem taxa/i, `${f} menciona preço/gratuidade`);
  }
});
