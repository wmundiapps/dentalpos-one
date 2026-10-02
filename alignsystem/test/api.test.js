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
let payCounter = 0;
const payStatus = {}; // status que o Asaas simulado devolve ao consultar um pagamento
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
  if (u.endsWith('/payments') && init.method === 'POST') {
    const n = ++payCounter;
    return json(body.installmentCount
      ? { id: `pay_${n}`, installment: `ins_${n}`, invoiceUrl: `https://asaas/i/${n}`, status: 'PENDING', dueDate: body.dueDate }
      : { id: `pay_${n}`, invoiceUrl: `https://asaas/i/${n}`, status: 'PENDING', dueDate: body.dueDate });
  }
  if (init.method === 'DELETE') return json({ deleted: true });
  let m = u.match(/\/installments\/(ins_\d+)\/payments/);
  if (m) return json({ data: [1, 2].map((k) => ({ id: `${m[1]}_${k}`, installment: m[1], value: 100, dueDate: `2026-11-0${k}`, status: 'PENDING', billingType: 'BOLETO', invoiceUrl: `https://asaas/b/${k}` })) });
  m = u.match(/\/payments\/(pay_\d+)$/);
  if (m) return json({ id: m[1], value: 100, dueDate: '2026-10-02', status: payStatus[m[1]] || 'PENDING', billingType: 'PIX', invoiceUrl: `https://asaas/i/${m[1]}` });
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
  const ap = await call('POST', `/api/admin/dentists/${dentistId}/approve`, { who: 'admin', body: { terms: { avulsaValue: '150' } } });
  assert.equal(ap.status, 200);
  const termToken = new URL(ap.data.contractUrl).searchParams.get('t');
  const term = await call('GET', `/api/contracts/${termToken}`);
  assert.match(term.data.body, /R\$\s?150,00/);
  assert.match(term.data.body, /30% \(trinta por cento\) do valor efetivamente pago/);
  assert.match(term.data.body, /limitado a 8 \(oito\) consultas nos casos simples, 10 \(dez\) nos casos de média complexidade e 15 \(quinze\) nos casos complexos/);
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

  // cobertura da rede e questionário de atendimento presencial (dentista ativo em Maringá/PR)
  const cov = await call('GET', '/api/public/cobertura');
  assert.deepEqual(cov.data.cities, [{ city: 'Maringá', uf: 'PR' }]);
  assert.ok(!JSON.stringify(cov.data).includes('Ana')); // sem nome de dentista
  assert.ok((await call('GET', '/api/geo/cidades?uf=PR')).data.cities.includes('Sarandi'));
  const near = await call('POST', `/api/portal/${t}/atendimento/simular`, { body: { uf: 'PR', city: 'Sarandi' } });
  assert.equal(near.data.withinRadius, true);
  assert.equal(near.data.travelTotal, 0);
  const far = await call('POST', `/api/portal/${t}/atendimento/simular`, { body: { uf: 'MT', city: 'Cuiabá' } });
  assert.equal(far.data.withinRadius, false);
  assert.ok(far.data.nearest.km > 300);
  assert.equal(far.data.travelTotal, Math.round(far.data.travelPerTrip * 4 * 100) / 100);
  assert.equal((await call('POST', `/api/portal/${t}/atendimento/simular`, { body: { uf: 'PR', city: 'Cidade Inventada' } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${t}/atendimento`, { body: { uf: 'MT', city: 'Cuiabá' } })).status, 400); // sem concordância
  const att = await call('POST', `/api/portal/${t}/atendimento`, { body: { uf: 'MT', city: 'Cuiabá', agree: true } });
  assert.equal(att.data.attendance.choice, 'mais_proximo_viagem');
  const att2 = await call('POST', `/api/portal/${t}/atendimento`, { body: { uf: 'PR', city: 'Sarandi', choice: 'mais_proximo', agree: true } });
  assert.equal(att2.data.attendance.choice, 'mais_proximo');
  const covAdm = await call('GET', '/api/admin/cobertura', { who: 'admin' });
  assert.equal(covAdm.data.hubs[0].city, 'Maringá');
  assert.ok(covAdm.data.hubs[0].leads >= 2);
  // modelo AlignSystem 100%: contrato traz a cláusula de atendimento pela rede em até 300 km
  const { patientContract } = await import('../lib/contracts.js');
  const redeBody = patientContract({ code: 1, name: 'X', plan: { model: 'rede', total: 10000 }, attendance: att.data.attendance && { ...att.data.attendance, choice: 'mais_proximo_viagem', km: 1216, nearestCity: 'Maringá', nearestUf: 'PR', travelTotal: 2918.4, trips: 4 } }, null).body;
  assert.match(redeBody, /qualquer dentista credenciado|dentista credenciado mais próximo/);
  assert.match(redeBody, /R\$\s?12\.918,40/);
  assert.doesNotMatch(redeBody, /interveniente/);

  // direciona o caso, plano, contrato
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { dentist_id: dentistId, cpf: '529.982.247-25', address: 'Rua B, 20, Maringá/PR', email: 'maria@x.com' } });
  const noPlan = await call('POST', `/api/admin/cases/${caseId}/contract`, { who: 'admin', body: {} });
  assert.equal(noPlan.status, 400);
  await call('PATCH', `/api/admin/cases/${caseId}`, { who: 'admin', body: { plan: { brand: 'ClearCorrect', months: 18, complexity: 'mediano', total: '11570', maxInstallments: 12, replacementValue: '200' } } });
  const ct = await call('POST', `/api/admin/cases/${caseId}/contract`, { who: 'admin', body: {} });
  assert.equal(ct.status, 201);
  const ctToken = new URL(ct.data.url).searchParams.get('t');
  const doc = await call('GET', `/api/contracts/${ctToken}`);
  assert.match(doc.data.body, /ClearCorrect/);
  assert.equal((await call('POST', `/api/contracts/${ctToken}/accept`, { body: { name: 'Maria da Silva', doc: '52998224725', agree: true, hash: doc.data.hash } })).status, 200);
  portal = await call('GET', `/api/portal/${t}`);
  assert.equal(portal.data.case.status, 'contrato_assinado');

  // cobrança no modelo único: Pix −12%, cartão até 18x, boleto (entrada 50% + saldo)
  assert.match(doc.data.body, /50% \(cinquenta por cento\) referentes ao fornecimento dos alinhadores/);
  assert.match(doc.data.body.replace(/<[^>]+>/g, ''), /até 10 \(dez\) consultas presenciais incluídas/);
  assert.match(doc.data.body, /termo aditivo/);
  const posts = () => asaasCalls.filter((c) => c.url.endsWith('/payments') && c.method === 'POST');
  const ch = await call('POST', `/api/admin/cases/${caseId}/charges`, { who: 'admin', body: { value: '10000', boletoMax: 12, dentistShare: true } });
  assert.equal(ch.status, 201, JSON.stringify(ch.data));
  assert.equal(ch.data.status, 'aguardando_escolha');
  assert.equal(posts().length, 0); // nada no Asaas até o paciente escolher
  const payTok = new URL(ch.data.pay_url).searchParams.get('t');
  const pg = await call('GET', `/api/pay/${payTok}`);
  assert.equal(pg.status, 200);
  assert.equal(pg.data.quote.pix, 8800);
  assert.equal(pg.data.quote.card.length, 18);
  assert.equal(pg.data.quote.boleto.entry, 5000);
  assert.equal(pg.data.quote.boleto.options.length, 12);
  assert.equal((await call('POST', `/api/pay/${payTok}`, { body: { option: 'CHEQUE' } })).status, 400);
  // Pix: 12% de desconto, dentista recebe 30% do líquido
  assert.equal((await call('POST', `/api/pay/${payTok}`, { body: { option: 'PIX' } })).status, 200);
  let last = posts().at(-1).body;
  assert.equal(last.billingType, 'PIX');
  assert.equal(last.value, 8800);
  assert.deepEqual(last.split, [{ walletId: 'wal_1', percentualValue: 30 }]);
  // troca para cartão 18x sem juros: cancela o Pix
  assert.equal((await call('POST', `/api/pay/${payTok}`, { body: { option: 'CREDIT_CARD', installments: 18 } })).status, 200);
  assert.ok(asaasCalls.some((c) => c.method === 'DELETE' && /\/payments\/pay_\d+$/.test(c.url)));
  last = posts().at(-1).body;
  assert.equal(last.billingType, 'CREDIT_CARD');
  assert.equal(last.installmentCount, 18);
  assert.equal(last.totalValue, 10000);
  assert.deepEqual(last.split, [{ walletId: 'wal_1', percentualValue: 30 }]);
  // troca para boleto: entrada de 50% no Pix, sem repasse (alinhadores)
  const bol = await call('POST', `/api/pay/${payTok}`, { body: { option: 'BOLETO', installments: 12, entryMethod: 'PIX' } });
  assert.equal(bol.status, 200, JSON.stringify(bol.data));
  assert.ok(asaasCalls.some((c) => c.method === 'DELETE' && /\/installments\/ins_\d+$/.test(c.url)));
  last = posts().at(-1).body;
  assert.equal(last.billingType, 'PIX');
  assert.equal(last.value, 5000);
  assert.equal(last.split, undefined);
  const [chRow] = await sql`select asaas_payment_id from alignsystem_test.charges where id = ${ch.data.id}`;
  const before = posts().length;
  payStatus[chRow.asaas_payment_id] = 'RECEIVED';
  // webhook: sem token é recusado; entrada paga → gera 12 boletos do saldo com 60% para o dentista
  assert.equal((await call('POST', '/api/webhooks/asaas', { body: { event: 'PAYMENT_RECEIVED' } })).status, 401);
  const wh = await call('POST', '/api/webhooks/asaas', {
    headers: { 'asaas-access-token': 'wh-token' },
    body: { event: 'PAYMENT_RECEIVED', payment: { id: chRow.asaas_payment_id, value: 5000, dueDate: '2026-10-01', status: 'RECEIVED', billingType: 'PIX', paymentDate: '2026-10-01', externalReference: ch.data.id } },
  });
  assert.equal(wh.status, 200);
  const [paid] = await sql`select status, paid_at from alignsystem_test.payments where asaas_payment_id = ${chRow.asaas_payment_id}`;
  assert.equal(paid.status, 'RECEIVED');
  assert.ok(paid.paid_at);
  assert.equal(posts().length, before + 1);
  last = posts().at(-1).body;
  assert.equal(last.billingType, 'BOLETO');
  assert.equal(last.installmentCount, 12);
  assert.equal(last.totalValue, 5000);
  assert.deepEqual(last.split, [{ walletId: 'wal_1', percentualValue: 60 }]);
  // webhook repetido não duplica os boletos
  await call('POST', '/api/webhooks/asaas', { headers: { 'asaas-access-token': 'wh-token' }, body: { event: 'PAYMENT_CONFIRMED', payment: { id: chRow.asaas_payment_id, value: 5000, dueDate: '2026-10-01', status: 'CONFIRMED', billingType: 'PIX', externalReference: ch.data.id } } });
  assert.equal(posts().length, before + 1);
  const pg2 = await call('GET', `/api/pay/${payTok}`);
  assert.equal(pg2.data.status, 'entrada_paga');
  assert.equal(pg2.data.boletos.length, 2);
  assert.equal((await call('POST', `/api/pay/${payTok}`, { body: { option: 'PIX' } })).status, 409);

  // pagamento de outro negócio na mesma conta Asaas: ignorado e não armazenado
  const other = await call('POST', '/api/webhooks/asaas', {
    headers: { 'asaas-access-token': 'wh-token' },
    body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_outro', value: 50, dueDate: '2026-10-01', status: 'RECEIVED', billingType: 'PIX' } },
  });
  assert.equal(other.status, 200);
  assert.equal(other.data.ignored, true);
  assert.equal((await sql`select 1 from alignsystem_test.payments where asaas_payment_id = 'pay_outro'`).length, 0);

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
