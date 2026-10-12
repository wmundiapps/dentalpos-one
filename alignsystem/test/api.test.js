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
import sharp from 'sharp';
// foto válida com EXIF (GPS) e um "anexo" escondido após o fim da imagem, para testar a recriação no servidor
const JPEG = Buffer.concat([
  await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c99' } }).jpeg().withExif({ IFD3: { GPSLatitudeRef: 'S' } }).toBuffer(),
  Buffer.from('<script>alert(1)</script>MALWARE-MARKER'),
]);

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
  let dc = await call('GET', `/api/dentist/cases/${caseId}`, { who: 'dent' });
  assert.equal(dc.status, 200);
  const hidden = (await sql`select id from alignsystem_test.photos where case_id = ${caseId} and uploaded_by = 'paciente' limit 1`)[0].id;
  assert.equal(dc.data.photos.filter((p) => p.uploaded_by === 'paciente').length, 0); // aguardando revisão
  assert.equal((await call('GET', `/api/photos/${hidden}`, { who: 'dent' })).status, 404);
  assert.equal((await call('POST', `/api/admin/cases/${caseId}/photos/release`, { who: 'admin', body: {} })).data.released, 7);
  dc = await call('GET', `/api/dentist/cases/${caseId}`, { who: 'dent' });
  assert.equal(dc.data.photos.filter((p) => p.uploaded_by === 'paciente').length, 7);
  const served = await fetch(`${base}/api/photos/${hidden}`, { headers: { cookie: jars.dent } });
  assert.equal(served.status, 200);
  assert.match(served.headers.get('content-security-policy'), /sandbox/);
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.ok(!bytes.includes('MALWARE-MARKER')); // conteúdo escondido removido
  assert.equal((await sharp(bytes).metadata()).exif, undefined); // sem EXIF/GPS
  assert.equal(dc.data.case.cpf, undefined); // CPF não vai para o dentista
  // autorização prévia → atendimento com o que foi feito + assinaturas do paciente e do dentista → validação
  const SIG = 'data:image/png;base64,' + (await sharp({ create: { width: 600, height: 200, channels: 3, background: '#fff' } })
    .composite([{ input: Buffer.from('<svg width="600" height="200"><path d="M20 150 C 120 20, 220 180, 320 60 S 520 160, 580 40" stroke="#111" stroke-width="8" fill="none"/></svg>'), top: 0, left: 0 }]).png().toBuffer()).toString('base64');
  const BLANK = 'data:image/png;base64,' + (await sharp({ create: { width: 600, height: 200, channels: 3, background: '#fff' } }).png().toBuffer()).toString('base64');
  const evBody = { notes: 'Instalação dos attachments e entrega dos alinhadores 1 a 3.', patientSigner: 'Maria da Silva', patientSignature: SIG, dentistSignature: SIG };
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { milestone: 'instalacao', ...evBody } })).status, 409); // sem autorização
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/authorizations`, { who: 'dent', body: { milestone: 'instalacao', urgency: 'rotina', justification: 'x' } })).status, 400);
  const au = await call('POST', `/api/dentist/cases/${caseId}/authorizations`, { who: 'dent', body: { milestone: 'instalacao', urgency: 'rotina', justification: 'Início do tratamento: instalação dos attachments.', planned_for: '2026-10-20' } });
  assert.equal(au.status, 201, JSON.stringify(au.data));
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { authorizationId: au.data.id, ...evBody } })).status, 409); // ainda não autorizada
  assert.equal((await call('POST', `/api/admin/authorizations/${au.data.id}/decide`, { who: 'dent', body: { approve: true } })).status, 403);
  assert.equal((await call('POST', `/api/admin/authorizations/${au.data.id}/decide`, { who: 'admin', body: { approve: false } })).status, 400); // negar exige motivo
  assert.equal((await call('POST', `/api/admin/authorizations/${au.data.id}/decide`, { who: 'admin', body: { approve: true } })).status, 200);
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { authorizationId: au.data.id, ...evBody, dentistSignature: BLANK } })).status, 400); // assinatura em branco
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { authorizationId: au.data.id, ...evBody, notes: 'ok' } })).status, 400); // sem descrição
  const ev = await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { authorizationId: au.data.id, ...evBody } });
  assert.equal(ev.status, 201, JSON.stringify(ev.data));
  assert.equal((await call('POST', `/api/dentist/cases/${caseId}/evidences`, { who: 'dent', body: { authorizationId: au.data.id, ...evBody } })).status, 409); // uma autorização, um atendimento
  const sigImg = await call('GET', `/api/evidences/${ev.data.id}/signature/paciente`, { who: 'admin' });
  assert.equal(sigImg.status, 200);
  assert.equal((await sharp(Buffer.from(sigImg.data)).metadata()).format, 'png');
  const ad = (await call('GET', `/api/admin/cases/${caseId}`, { who: 'admin' })).data;
  assert.equal(ad.authorizations[0].status, 'realizada');
  assert.equal(ad.evidences[0].has_patient_signature, true);
  assert.equal(ad.evidences[0].patient_signature, undefined); // imagem não vai na lista
  assert.equal((await call('GET', '/api/admin/overview', { who: 'admin' })).data.pendingAuth.length, 0);
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

test('segurança: bloqueio de caso e verificação em duas etapas', { skip }, async () => {
  const totp = await import('../lib/totp.js');
  // bloqueio: apaga as fotos do paciente e desativa o link
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Fulano Teste', age: 30, whatsapp: '44911112222', city: 'Maringá', uf: 'PR', consent: true } });
  const tk = lead.data.token;
  const cs = await call('POST', `/api/portal/${tk}/consent`, { body: { acceptedName: 'Fulano Teste', birthDate: '1990-01-01', adult: true, agree: true, hash: (await call('GET', `/api/portal/${tk}`)).data.tcle.hash } });
  assert.equal(cs.status, 201, JSON.stringify(cs.data));
  assert.equal((await call('POST', `/api/portal/${tk}/photos?slot=1`, { raw: JPEG })).status, 201);
  const [c] = await sql`select id from alignsystem_test.cases where token = ${tk}`;
  const blk = await call('POST', `/api/admin/cases/${c.id}/block`, { who: 'admin', body: { reason: 'teste' } });
  assert.equal(blk.data.deleted, 1);
  assert.equal((await call('GET', `/api/portal/${tk}`)).status, 403);
  assert.equal((await call('POST', `/api/admin/cases/${c.id}/unblock`, { who: 'admin', body: {} })).status, 200);
  assert.equal((await call('GET', `/api/portal/${tk}`)).status, 200);

  // duas etapas
  const setup = await call('POST', '/api/auth/totp/setup', { who: 'admin', body: {} });
  assert.match(setup.data.qr, /<svg/);
  const step = Math.floor(Date.now() / 30000);
  assert.equal((await call('POST', '/api/auth/totp/enable', { who: 'admin', body: { code: '000000' } })).status, 400);
  const en = await call('POST', '/api/auth/totp/enable', { who: 'admin', body: { code: totp.codeAt(setup.data.secret, step) } });
  assert.equal(en.status, 200);
  assert.equal(en.data.recoveryCodes.length, 8);
  const noCode = await call('POST', '/api/auth/login', { body: { email: 'admin@teste.com', password: 'senhaforte123' } });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.data.needCode, true);
  // mesmo código não pode ser reutilizado
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@teste.com', password: 'senhaforte123', code: totp.codeAt(setup.data.secret, step) } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { who: 'admin', body: { email: 'admin@teste.com', password: 'senhaforte123', code: totp.codeAt(setup.data.secret, step + 1) } })).status, 200);
  // código de recuperação funciona uma vez
  const rc = en.data.recoveryCodes[0];
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@teste.com', password: 'senhaforte123', code: rc } })).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'admin@teste.com', password: 'senhaforte123', code: rc } })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { who: 'admin' })).data.user.totpEnabled, true);
});

test('captação: importação da Receita, prioridade, celular antigo e "não quero receber"', { skip }, async () => {
  const row = (cnpj, name, extra = {}) => ({ cnpj, name, category: 'odontologia', cnae: '8630504', city: 'Maringa', phone: '4499887766', email: null, ...extra });
  const body = { uf: 'PR', sourceMonth: '2026-09', rows: [
    row('11111111000199', 'ORTODONTIA SORRISO'),
    row('22222222000199', 'CLINICA ODONTO LTDA', { phone: '4430301010', category: 'odontologia-secundaria' }),
    row('33333333000199', 'SEM CONTATO', { phone: null }),
    row('44444444000199', 'CATEGORIA ERRADA', { category: 'padaria' }),
  ] };
  assert.equal((await call('POST', '/api/admin/prospects/import', { body })).status, 401); // só administrador
  const imp = await call('POST', '/api/admin/prospects/import', { who: 'admin', body });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.equal(imp.data.saved, 2);
  let list = await call('GET', '/api/admin/prospects', { who: 'admin' });
  const orto = list.data.prospects.find((p) => p.cnpj === '11111111000199');
  assert.equal(orto.priority, true);
  assert.equal(orto.phone, '44999887766'); // celular antigo ganhou o 9
  assert.equal(orto.mobile, true);
  assert.equal(list.data.prospects.find((p) => p.cnpj === '22222222000199').mobile, false); // fixo
  assert.equal(list.data.counts.novo, 2);
  assert.equal((await call('GET', '/api/admin/prospects?priority=1', { who: 'admin' })).data.total, 1);
  // "não quer": apaga telefone e e-mail e bloqueia reimportação para sempre
  assert.equal((await call('POST', `/api/admin/prospects/${orto.id}/optout`, { who: 'admin', body: {} })).status, 200);
  const again = await call('POST', '/api/admin/prospects/import', { who: 'admin', body: { ...body, rows: [row('11111111000199', 'ORTODONTIA SORRISO')] } });
  assert.equal(again.data.saved, 0);
  // mesmo telefone em outro CNPJ também fica bloqueado
  assert.equal((await call('POST', '/api/admin/prospects/import', { who: 'admin', body: { ...body, rows: [row('55555555000199', 'OUTRA', { phone: '44999887766' })] } })).data.saved, 0);
  const [gone] = await sql`select status, phone, email from alignsystem_test.prospects where cnpj = '11111111000199'`;
  assert.deepEqual({ ...gone }, { status: 'saiu', phone: null, email: null });
  list = await call('GET', '/api/admin/prospects', { who: 'admin' });
  assert.equal(list.data.counts.saiu, 1);
});

test('escaneamento: preços no painel, termo, pagamento e preferência de horário', { skip }, async () => {
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Clara Scan', age: 35, whatsapp: '44933334444', city: 'Maringá', uf: 'PR', consent: true } });
  const tk = lead.data.token;
  const tcle = (await call('GET', `/api/portal/${tk}`)).data.tcle;
  await call('POST', `/api/portal/${tk}/consent`, { body: { acceptedName: 'Clara Scan', birthDate: '1990-01-01', adult: true, agree: true, hash: tcle.hash } });
  const [c] = await sql`select id from alignsystem_test.cases where token = ${tk}`;
  assert.equal((await call('GET', `/api/portal/${tk}`)).data.scan, null); // sem parecer, sem botão
  await call('PATCH', `/api/admin/cases/${c.id}`, { who: 'admin', body: { assessment: 'indicado', publish_assessment: true } });
  assert.equal((await call('GET', `/api/portal/${tk}`)).data.scan, null); // sem preço, sem botão
  assert.equal((await call('PUT', '/api/admin/settings/prices', { who: 'admin', body: { scan: '350', simples: '6900', mediano: '8900', complexo: '11900' } })).status, 200);
  const S = (await call('GET', `/api/portal/${tk}`)).data.scan;
  assert.equal(S.price, 350);
  assert.deepEqual(S.table.map((r) => [r.key, r.consults, r.price]), [['simples', 8, 6900], ['mediano', 10, 8900], ['complexo', 15, 11900]]);
  assert.match(S.terms.body, /7 \(sete\) dias/);
  const body = { name: 'Clara Scan Souza', cpf: '529.982.247-25', email: 'clara@x.com', whatsapp: '44933334444', postalCode: '87013-230', address: 'Rua A, 10', city: 'Maringá', uf: 'PR', agree: true, hash: S.terms.hash, billingType: 'CREDIT_CARD' };
  assert.equal((await call('POST', `/api/portal/${tk}/escaneamento`, { body: { ...body, agree: false } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${tk}/escaneamento`, { body: { ...body, cpf: '11111111111' } })).status, 400);
  const ok = await call('POST', `/api/portal/${tk}/escaneamento`, { body });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.invoiceUrl);
  const pay = asaasCalls.filter((x) => x.url.endsWith('/payments') && x.method === 'POST').at(-1).body;
  assert.equal(pay.billingType, 'CREDIT_CARD');
  assert.equal(pay.value, 350);
  assert.equal(pay.split, undefined);
  const [ch] = await sql`select id, asaas_payment_id from alignsystem_test.charges where case_id = ${c.id} and kind = 'escaneamento'`;
  assert.equal((await call('POST', `/api/portal/${tk}/escaneamento/preferencia`, { body: { preference: 'segunda à tarde' } })).status, 409); // ainda não pago
  payStatus[ch.asaas_payment_id] = 'RECEIVED';
  await call('POST', '/api/webhooks/asaas', { headers: { 'asaas-access-token': 'wh-token' }, body: { event: 'PAYMENT_RECEIVED', payment: { id: ch.asaas_payment_id, value: 350, status: 'RECEIVED', billingType: 'CREDIT_CARD', dueDate: '2026-10-12', externalReference: ch.id } } });
  let P = (await call('GET', `/api/portal/${tk}`)).data.scan;
  assert.equal(P.order.status, 'pago');
  assert.equal((await call('POST', `/api/portal/${tk}/escaneamento`, { body })).status, 409); // não paga duas vezes
  assert.equal((await call('POST', `/api/portal/${tk}/escaneamento/preferencia`, { body: { preference: 'segunda à tarde' } })).status, 200);
  P = (await call('GET', `/api/portal/${tk}`)).data.scan;
  assert.equal(P.order.preference, 'segunda à tarde');
  const adm = await call('GET', `/api/admin/cases/${c.id}`, { who: 'admin' });
  assert.equal(adm.data.scanOrders[0].status, 'pago');
  assert.equal(adm.data.case.cpf, '52998224725');
  assert.equal(adm.data.case.scanPaid, 350);
  // o escaneamento pago é descontado do valor do tratamento
  assert.equal((await call('POST', `/api/admin/cases/${c.id}/charges`, { who: 'admin', body: { value: '300' } })).status, 400);
  const tr = await call('POST', `/api/admin/cases/${c.id}/charges`, { who: 'admin', body: { value: '8900' } });
  assert.equal(tr.status, 201, JSON.stringify(tr.data));
  assert.equal(Number(tr.data.value), 8550);
  assert.equal(Number(tr.data.scan_deducted), 350);
});

test('má oclusão: classificação no parecer, só tipos válidos', { skip }, async () => {
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Davi Oclusao', age: 28, whatsapp: '44922223333', city: 'Maringá', uf: 'PR', consent: true } });
  const [c] = await sql`select id from alignsystem_test.cases where token = ${lead.data.token}`;
  const r = await call('PATCH', `/api/admin/cases/${c.id}`, { who: 'admin', body: { malocclusion: { types: ['classe_ii', 'sobremordida', 'agenesia', 'inventado'], agenesisTeeth: '12, 22' } } });
  assert.equal(r.status, 200);
  const d = await call('GET', `/api/admin/cases/${c.id}`, { who: 'admin' });
  assert.deepEqual(d.data.case.malocclusion, { types: ['classe_ii', 'sobremordida', 'agenesia'], agenesisTeeth: '12, 22' });
  assert.equal(d.data.labels.MALOCCLUSION.classe_iii, 'Classe III');
  assert.equal((await call('GET', `/api/portal/${lead.data.token}`)).data.case.malocclusion, undefined); // paciente não vê
});

test('preço próprio: dentista define valores, alinhadores ficam com a AlignSystem e o resto vai 80/20', { skip }, async () => {
  const { ownPriceDentistPct } = await import('../lib/pricing.js');
  assert.equal(ownPriceDentistPct(10000, 3000), 56);
  assert.equal(ownPriceDentistPct(3000, 3000), 0);
  const dentistId = (await call('GET', '/api/admin/dentists', { who: 'admin' })).data.dentists[0].id;
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { simples: '7500', mediano: '0', complexo: '12000' } })).status, 400);
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { simples: '7500', mediano: '9500', complexo: '12000' } })).status, 200);
  assert.equal((await call('GET', '/api/dentist/prices', { who: 'dent' })).data.prices.mediano, 9500);
  // tabela por marca: escaneamento e submissão, 3 graus e refinamento; o paciente vê o menor valor ("a partir de")
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { brands: [{ name: '', simples: '1' }] } })).status, 400);
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { brands: [{ name: 'Smiller', refCount: '99' }] } })).status, 400);
  const tb = await call('PUT', '/api/dentist/prices', { who: 'dent', body: { brands: [
    { name: 'Smiller', origin: 'nacional', scan: '600', simples: '9000', mediano: '12000', complexo: '14000', refValue: '250', refCount: '3' },
    { name: 'Invisalign', origin: 'importado', scan: '900', simples: '14500', mediano: '9500', complexo: '24000', refValue: '400', refCount: '4' },
  ] } });
  assert.equal(tb.status, 200, JSON.stringify(tb.data));
  const gp = (await call('GET', '/api/dentist/prices', { who: 'dent' })).data.prices;
  assert.equal(gp.brands[1].origin, 'importado');
  assert.equal(gp.brands[0].refCount, 3);
  assert.deepEqual([gp.simples, gp.mediano, gp.complexo], [9000, 9500, 14000]);
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { simples: '7500', mediano: '9500', complexo: '12000' } })).status, 200);
  assert.equal((await call('PUT', '/api/admin/dentists/00000000-0000-0000-0000-000000000000/prices', { who: 'admin', body: { simples: '1' } })).status, 404);
  await call('PUT', '/api/admin/settings/prices', { who: 'admin', body: { scan: '350', simples: '6900', mediano: '8900', complexo: '11900', aligner_simples: '2000', aligner_mediano: '3000', aligner_complexo: '4000' } });

  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Bruno Proprio', age: 30, whatsapp: '44955556666', city: 'Maringá', uf: 'PR', consent: true } });
  const tk = lead.data.token;
  const tcle = (await call('GET', `/api/portal/${tk}`)).data.tcle;
  await call('POST', `/api/portal/${tk}/consent`, { body: { acceptedName: 'Bruno Proprio', birthDate: '1990-01-01', adult: true, agree: true, hash: tcle.hash } });
  const [c] = await sql`select id from alignsystem_test.cases where token = ${tk}`;
  await call('PATCH', `/api/admin/cases/${c.id}`, { who: 'admin', body: { assessment: 'indicado', publish_assessment: true, dentist_id: dentistId, cpf: '529.982.247-25', address: 'Rua C, 30, Maringá/PR', email: 'bruno@x.com' } });
  // portal mostra a tabela do dentista do caso
  const S = (await call('GET', `/api/portal/${tk}`)).data.scan;
  assert.deepEqual(S.table.map((r) => r.price), [7500, 9500, 12000]);
  assert.deepEqual(S.options, []); // tabela antiga, sem marcas
  const four = [1, 2, 3, 4].map((n) => ({ name: `Marca ${n}`, simples: '9000' }));
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { brands: four } })).status, 400); // até 3 marcas
  assert.equal((await call('PUT', '/api/dentist/prices', { who: 'dent', body: { brands: [
    { name: 'Smiller', origin: 'nacional', scan: '600', simples: '7500', mediano: '9500', complexo: '12000', refValue: '250', refCount: '2' },
    { name: 'ClearCorrect', origin: 'importado', simples: '11500', mediano: '14500', complexo: '16500' },
    { name: 'Invisalign', origin: 'importado', simples: '14500', mediano: '18000', complexo: '24000' },
  ] } })).status, 200);
  const S2 = (await call('GET', `/api/portal/${tk}`)).data.scan;
  assert.deepEqual(S2.options.map((o) => o.name), ['Smiller', 'ClearCorrect', 'Invisalign']);
  assert.equal(S2.options[0].scan, undefined); // escaneamento: valor único da AlignSystem
  assert.equal(S2.price, 350);
  assert.equal(S2.breakage, 195); // consulta por quebra: consulta combinada (150) + 30%
  assert.equal(S2.options[0].refCount, 2);
  assert.deepEqual(S2.options[2].table.map((r) => r.price), [14500, 18000, 24000]);
  assert.deepEqual(S2.table.map((r) => r.price), [7500, 9500, 12000]); // "a partir de" = menor valor

  await call('PATCH', `/api/admin/cases/${c.id}`, { who: 'admin', body: { plan: { model: 'proprio', brand: 'Invisalign', months: 12, complexity: 'mediano', total: '10000' } } });
  const ct = await call('POST', `/api/admin/cases/${c.id}/contract`, { who: 'admin', body: {} });
  assert.equal(ct.status, 201, JSON.stringify(ct.data));
  const doc = await call('GET', `/api/contracts/${new URL(ct.data.url).searchParams.get('t')}`);
  assert.match(doc.data.body.replace(/<[^>]+>/g, ''), /R\$\s?3\.000,00 referentes ao fornecimento dos alinhadores/);
  assert.match(doc.data.body, /80% correspondem aos atendimentos clínicos/);

  const ch = await call('POST', `/api/admin/cases/${c.id}/charges`, { who: 'admin', body: { value: '10000', dentistShare: '80/20' } });
  assert.equal(ch.status, 201, JSON.stringify(ch.data));
  assert.equal(ch.data.split.value, 56);
  assert.equal(ch.data.split.alignerCost, 3000);
  const payTok = new URL(ch.data.pay_url).searchParams.get('t');
  assert.equal((await call('POST', `/api/pay/${payTok}`, { body: { option: 'CREDIT_CARD', installments: 10 } })).status, 200);
  const last = asaasCalls.filter((x) => x.url.endsWith('/payments') && x.method === 'POST').at(-1).body;
  assert.deepEqual(last.split, [{ walletId: 'wal_1', percentualValue: 56 }]);
  assert.equal((await call('POST', `/api/admin/cases/${c.id}/charges`, { who: 'admin', body: { value: '2500', dentistShare: '80/20' } })).status, 400); // abaixo do custo dos alinhadores
  // consulta por quebra: paciente paga 195, dentista recebe 150 (consulta combinada) por split fixo, 45 ficam com a AlignSystem
  const q = await call('POST', `/api/admin/cases/${c.id}/charges/quebra`, { who: 'admin', body: {} });
  assert.equal(q.status, 201, JSON.stringify(q.data));
  assert.deepEqual([q.data.value, q.data.dentist], [195, 150]);
  const qp = asaasCalls.filter((x) => x.url.endsWith('/payments') && x.method === 'POST').at(-1).body;
  assert.equal(qp.value, 195);
  assert.deepEqual(qp.split, [{ walletId: 'wal_1', fixedValue: 150 }]);
  assert.match(doc.data.body.replace(/<[^>]+>/g, ''), /quebra de alinhador não integra as consultas incluídas[\s\S]*?R\$\s?195,00 por consulta/);
});

test('cidades de atendimento: até 10 por parceiro, mesmo estado; outro estado é outro cadastro', { skip }, async () => {
  const r = await call('POST', '/api/leads/parceiro', { body: { name: 'Dr. Paulo Rede', cro: '777 / PR', whatsapp: '44988887777', email: 'paulo@x.com', city: 'Maringá', consent: true,
    otherCities: 'Londrina/PR, Curitiba, Cascavel - PR\nCampo Mourão; Maringá/PR, Florianópolis/SC, Cidade Inventada' } });
  assert.equal(r.status, 201);
  const [d] = await sql`select id, extra_cities from alignsystem_test.dentists where email = 'paulo@x.com'`;
  assert.deepEqual(d.extra_cities.map((c) => c.city), ['Londrina', 'Curitiba', 'Cascavel', 'Campo Mourão']);
  const patch = (extra_cities) => call('PATCH', `/api/admin/dentists/${d.id}`, { who: 'admin', body: { extra_cities } });
  assert.equal((await patch('Joinville/SC')).status, 400); // outro estado
  assert.equal((await patch('Cidade Inventada')).status, 400);
  assert.equal((await patch('Londrina, Curitiba, Cascavel, Campo Mourão, Ponta Grossa, Toledo, Umuarama, Apucarana, Arapongas, Paranavaí')).status, 400); // 11 cidades
  assert.equal((await patch('Londrina, PR\nCuritiba/PR')).status, 200);
  await call('PATCH', `/api/admin/dentists/${d.id}`, { who: 'admin', body: { status: 'ativo' } });
  const cov = (await call('GET', '/api/public/cobertura')).data.cities.map((c) => c.city);
  for (const c of ['Maringá', 'Londrina', 'Curitiba']) assert.ok(cov.includes(c), c);
  // paciente em Ponta Grossa: Curitiba é a mais próxima
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Lia Ponta', age: 30, whatsapp: '42999990000', city: 'Ponta Grossa', uf: 'PR', consent: true } });
  const near = await call('POST', `/api/portal/${lead.data.token}/atendimento/simular`, { body: { uf: 'PR', city: 'Ponta Grossa' } });
  assert.equal(near.data.nearest.city, 'Curitiba');
  // CRO de outro estado com o mesmo e-mail: novo cadastro, mas a aprovação pede outro e-mail
  await call('POST', '/api/leads/parceiro', { body: { name: 'Dr. Paulo Rede', cro: '999 / SC', whatsapp: '44988887777', email: 'paulo@x.com', city: 'Joinville', uf: 'SC', consent: true } });
  const [sc] = await sql`select id from alignsystem_test.dentists where cro = '999'`;
  await call('PATCH', `/api/admin/dentists/${d.id}`, { who: 'admin', body: { cpf_cnpj: '529.982.247-25' } });
  assert.equal((await call('POST', `/api/admin/dentists/${d.id}/approve`, { who: 'admin', body: { terms: {} } })).status, 200);
  assert.equal((await call('POST', `/api/admin/dentists/${sc.id}/approve`, { who: 'admin', body: { terms: {} } })).status, 409);
});

test('data de pagamento por atendimento: dia 10 do mês seguinte ao registro, até o último dia útil', async () => {
  const { payoutDate, lastBusinessDay } = await import('../lib/payout.js');
  assert.equal(payoutDate('2026-10-15T14:00:00-03:00'), '2026-11-10');
  assert.equal(payoutDate('2026-10-30T23:30:00-03:00'), '2026-11-10'); // último dia útil de outubro/2026 (sexta)
  assert.equal(payoutDate('2026-10-31T10:00:00-03:00'), '2026-12-10'); // sábado, depois do último dia útil
  assert.equal(payoutDate('2026-11-01T10:00:00-03:00'), '2026-12-10');
  assert.equal(payoutDate('2026-12-31T10:00:00-03:00'), '2027-01-11'); // 10/01/2027 é domingo → segunda
  assert.equal(payoutDate('2027-03-15T10:00:00-03:00'), '2027-04-12'); // 10/04/2027 é sábado → segunda
  assert.equal(lastBusinessDay(2027, 4), 30);
  const { partnerContract } = await import('../lib/contracts.js');
  const body = partnerContract({ name: 'Dra. Teste', cro: '1', cro_uf: 'PR', city: 'Maringá' }).body.replace(/<[^>]+>/g, '');
  assert.match(body, /dia 10 \(dez\) do mês seguinte ao do registro/);
  assert.match(body, /autorização prévia/);
  assert.doesNotMatch(body, /dias úteis após/);
  assert.match(body, /multa rescisória fixa de R\$\s?5\.000,00\./);
  assert.doesNotMatch(body, /repasses médios/);
  assert.match(body, /acrescido de 30% \(trinta por cento\), totalizando R\$\s?156,00/); // consulta avulsa padrão 120 + 30%
  assert.match(body, /negligência, imperícia ou imprudência/);
  assert.match(body, /não for dia útil, o pagamento é feito no primeiro dia útil seguinte/);
});

test('Preços da AlignSystem por marca: valores com ponto de milhar, erro que diz o campo, custo dos alinhadores pela marca do caso', { skip }, async () => {
  const put = (body) => call('PUT', '/api/admin/settings/prices', { who: 'admin', body });
  const bad = await put({ scan: '300,00', brands: [{ name: 'Alligner', simples: 'Alligner 9.000,00' }] });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /Alligner — tratamento caso simples/);
  assert.equal((await put({ scan: '300,00', brands: [{ simples: '9.000,00' }] })).status, 400); // sem nome da marca
  const ok = await put({ scan: 'R$ 300,00', brands: [
    { name: 'Alligner', origin: 'nacional', simples: '9.000,00', mediano: '10.000,00', complexo: '12.000,00', aligner: { simples: '2500,00', mediano: '3000,00', complexo: '3800,00' } },
    { name: 'ClearCorrect', origin: 'importado', simples: '11.000,00', mediano: '12.000,00', complexo: '18.000,00', aligner: { simples: '3200,00', mediano: '4200,00', complexo: '5200,00' } },
    { name: 'Invisalign', origin: 'importado', simples: '12.000,00', mediano: '14.000,00', complexo: '20.000,00', aligner: { simples: '4200,00', mediano: '5200,00', complexo: '6200,00' } },
  ] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const P = ok.data.prices;
  assert.equal(P.scan, 300);
  assert.deepEqual(P.brands.map((b) => [b.name, b.simples, b.aligner.complexo]), [['Alligner', 9000, 3800], ['ClearCorrect', 11000, 5200], ['Invisalign', 12000, 6200]]);
  assert.deepEqual([P.simples, P.mediano, P.complexo], [9000, 10000, 12000]);
  const { alignerCostFor } = await import('../lib/scan.js');
  assert.equal(alignerCostFor(P, 'clear correct', 'mediano'), 4200); // nome sem diferenciar maiúsculas/espaços
  assert.equal(alignerCostFor(P, 'Spark', 'mediano'), null);
});

test('negociação on-line: termo do dentista, teto da AlignSystem, abrir, contraproposta, fechar e cobrança com juros acima de 18x', { skip }, async () => {
  const [{ dentist_id: dentistId }] = await sql`select dentist_id from alignsystem_test.users where role = 'dentist' and dentist_id = (select id from alignsystem_test.dentists where cro = '12345' limit 1)`;
  // teto da AlignSystem
  assert.equal((await call('PUT', '/api/admin/settings/negotiation', { who: 'admin', body: { maxDiscountPct: '80', maxBoletos: '36', interestPctMonth: '1,99' } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/settings/negotiation', { who: 'admin', body: { maxDiscountPct: '15', maxBoletos: '36', interestPctMonth: '1,99' } })).status, 200);
  // dentista: sem aceite do termo não salva; com aceite, limites presos ao teto
  const g = (await call('GET', '/api/dentist/negotiation', { who: 'dent' })).data;
  assert.equal(g.ceiling.maxDiscountPct, 15);
  assert.equal((await call('PUT', '/api/dentist/negotiation', { who: 'dent', body: { maxDiscountPct: 10 } })).status, 400);
  const sv = await call('PUT', '/api/dentist/negotiation', { who: 'dent', body: { agree: true, hash: g.terms.hash, maxDiscountPct: 40, cardMax: 12, boleto: true, boletoMax: 99, counter: true, counterFloorPct: 15 } });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.deepEqual([sv.data.config.maxDiscountPct, sv.data.config.cardMax, sv.data.config.boletoMax], [15, 12, 36]); // presos ao teto
  await call('PUT', '/api/dentist/negotiation', { who: 'dent', body: { maxDiscountPct: 10, cardMax: 12, boleto: true, boletoMax: 24, counter: true, counterFloorPct: 15 } });

  // caso do dentista com plano
  await sql`delete from alignsystem_test.rate_hits`; // os testes anteriores já usaram o limite de cadastros por IP
  const lead = await call('POST', '/api/leads/paciente', { body: { name: 'Nina Negocia', age: 31, whatsapp: '44977776666', city: 'Maringá', uf: 'PR', consent: true } });
  const tk = lead.data.token;
  const [c] = await sql`select id from alignsystem_test.cases where token = ${tk}`;
  await call('PATCH', `/api/admin/cases/${c.id}`, { who: 'admin', body: { dentist_id: dentistId, email: 'nina@x.com', cpf: '529.982.247-25', address: 'Rua N, 1, Maringá/PR', plan: { brand: 'ClearCorrect', months: 12, complexity: 'mediano', total: '10000' } } });
  assert.equal((await call('GET', `/api/portal/${tk}`)).data.negotiation, null); // fechada até o dentista abrir
  const op = await call('POST', `/api/dentist/cases/${c.id}/negotiation/open`, { who: 'dent', body: {} });
  assert.equal(op.status, 200, JSON.stringify(op.data));
  assert.match(op.data.whatsappUrl, /wa\.me\/5544977776666/);
  let N = (await call('GET', `/api/portal/${tk}`)).data.negotiation;
  assert.deepEqual([N.status, N.total, N.maxDiscountPct, N.cardMax, N.boletoMax, N.counter, N.counterMin], ['aberta', 10000, 10, 12, 24, true, 8500]);
  assert.equal(N.quoteMax.total, 9000);
  assert.equal(N.quote.boleto.options[23].interest, true); // 24x: acima de 18, com juros
  assert.equal(N.quote.boleto.options[17].interest, false);
  // contraproposta: dentro das condições não precisa; abaixo do piso é recusada; no intervalo vai para o dentista
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/contraproposta`, { body: { value: '9.500,00' } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/contraproposta`, { body: { value: '8.000,00' } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/contraproposta`, { body: { value: '8.700,00', message: 'Consigo isso no Pix' } })).status, 200);
  assert.equal((await call('GET', `/api/portal/${tk}`)).data.negotiation.status, 'contraproposta');
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/fechar`, { body: { discountPct: 5, option: 'PIX', agree: true } })).status, 409); // aguardando resposta
  assert.equal((await call('POST', `/api/dentist/cases/${c.id}/negotiation/counter`, { who: 'dent', body: { accept: true, note: 'Fechado!' } })).status, 200);
  N = (await call('GET', `/api/portal/${tk}`)).data.negotiation;
  assert.equal(N.maxDiscountPct, 13);
  assert.equal(N.lastDecision.accepted, true);
  // fechar: acima do desconto liberado é recusado; dentro, fecha
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/fechar`, { body: { discountPct: 20, option: 'PIX', agree: true } })).status, 400);
  assert.equal((await call('POST', `/api/portal/${tk}/negociacao/fechar`, { body: { discountPct: 13, option: 'BOLETO', installments: 24 } })).status, 400); // sem confirmação
  const fe = await call('POST', `/api/portal/${tk}/negociacao/fechar`, { body: { discountPct: 13, option: 'BOLETO', installments: 24, agree: true } });
  assert.equal(fe.status, 200, JSON.stringify(fe.data));
  assert.equal(fe.data.deal.total, 8700);
  const adm = (await call('GET', `/api/admin/cases/${c.id}`, { who: 'admin' })).data.case;
  assert.equal(adm.negotiation.status, 'fechada');
  assert.equal(adm.plan.negotiatedTotal, 8700);
  // contrato sai com o valor negociado e o desconto
  const ct = await call('POST', `/api/admin/cases/${c.id}/contract`, { who: 'admin', body: {} });
  assert.equal(ct.status, 201, JSON.stringify(ct.data));
  const doc = (await call('GET', `/api/contracts/${new URL(ct.data.url).searchParams.get('t')}`)).data.body.replace(/<[^>]+>/g, '');
  assert.match(doc, /R\$\s?8\.700,00 \("Contrato Fechado"\)/);
  assert.match(doc, /desconto de 13% concedido na negociação on-line/);
  // cobrança: saldo do boleto em 24x com juros
  const ch = await call('POST', `/api/admin/cases/${c.id}/charges`, { who: 'admin', body: { value: '8700', boletoMax: 24, cardMax: 12 } });
  assert.equal(ch.status, 201, JSON.stringify(ch.data));
  assert.equal(Number(ch.data.interest_pct), 1.99);
  const pg = (await call('GET', `/api/pay/${new URL(ch.data.pay_url).searchParams.get('t')}`)).data;
  assert.equal(pg.quote.card.length, 12);
  assert.equal(pg.quote.boleto.options.length, 24);
  assert.ok(pg.quote.boleto.options[23].totalRest > 4350);
});
