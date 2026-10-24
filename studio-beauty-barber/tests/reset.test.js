// Recuperação de senha: link por e-mail, validade, uso único e desconexão dos aparelhos.
process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = 'false';
process.env.TRUST_PROXY = 'false';
process.env.RESEND_API_KEY = 're_teste';
process.env.APP_URL = 'https://app.studiobeautybarber.com';
process.env.RECOVERY_CODE = 'codigo-de-teste-bem-longo-123';
process.env.HQ_SLUG = 'studio-beauty-barber-piloto';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { initDb, db } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { ensureHq, seedPilot } = await import('../server/seed.js');
const sec = await import('../server/security.js');

const PW = 'Piloto-Forte-2026';
const EMAIL = 'piloto@studiobeautybarber.com';
const realFetch = globalThis.fetch;
const emails = [];
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).includes('resend.com')) { emails.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ id: 're_1' }), text: async () => '{}' }; }
  return realFetch(url, opts);
};
let server, base;
async function post(path, body) {
  const r = await realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'sbb' }, body: JSON.stringify(body) });
  const t = await r.text(); let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
  return { status: r.status, data, headers: r.headers };
}
const tokenFromLastEmail = () => /#\/redefinir\/([\w-]+)/.exec(emails.at(-1).text)[1];

before(async () => {
  await (await import('./_db.js')).openTestDb(initDb);
  await seedPilot({ ownerPassword: PW }); await ensureHq();
  server = createApp({ awaitWebhooks: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { globalThis.fetch = realFetch; server.close(); await db.close(); });
beforeEach(() => sec.resetRateLimits());

test('pedir link: resposta igual para e-mail que existe e que não existe; só o existente recebe e-mail', async () => {
  const a = await post('/api/auth/forgot', { email: 'ninguem@exemplo.com' });
  assert.equal(a.status, 200); assert.equal(emails.length, 0);
  const b = await post('/api/auth/forgot', { email: EMAIL });
  assert.equal(b.status, 200); assert.deepEqual(a.data, b.data);
  assert.equal(emails.length, 1); assert.deepEqual(emails[0].to, [EMAIL]);
  assert.match(emails[0].text, /https:\/\/app\.studiobeautybarber\.com\/#\/redefinir\/[\w-]{30,}/);
  const row = await db.get('SELECT token_hash FROM password_resets');
  assert.ok(row.token_hash && !emails[0].text.includes(row.token_hash)); // só o hash fica no banco
});

test('trocar a senha: política, uso único, entrada com a nova e queda da antiga e das sessões', async () => {
  const login = await post('/api/auth/login', { email: EMAIL, password: PW });
  const oldCookie = login.headers.getSetCookie()[0].split(';')[0];
  for (let i = 0; i < 5; i++) await post('/api/auth/login', { email: EMAIL, password: 'errada-errada-' + i }); // trava a conta
  assert.equal((await post('/api/auth/login', { email: EMAIL, password: PW })).status, 423);
  await post('/api/auth/forgot', { email: EMAIL });
  const token = tokenFromLastEmail();
  assert.equal((await post('/api/auth/reset', { token, password: 'curta1' })).status, 422);
  assert.equal((await post('/api/auth/reset', { token, password: 'Nova-Senha-2026' })).status, 200);
  assert.equal((await post('/api/auth/reset', { token, password: 'Outra-Senha-2026' })).status, 400); // uso único
  assert.equal((await post('/api/auth/login', { email: EMAIL, password: PW })).status, 401);
  assert.equal((await post('/api/auth/login', { email: EMAIL, password: 'Nova-Senha-2026' })).status, 200); // e a trava saiu
  const me = await realFetch(base + '/api/auth/me', { headers: { cookie: oldCookie } });
  assert.equal(me.status, 401); // sessão antiga foi encerrada
});

test('link vencido ou inventado é recusado', async () => {
  await post('/api/auth/forgot', { email: EMAIL });
  const token = tokenFromLastEmail();
  await db.run('UPDATE password_resets SET expires_at = ?', [new Date(Date.now() - 60_000).toISOString()]);
  assert.equal((await post('/api/auth/reset', { token, password: 'Mais-Uma-Senha-2026' })).status, 400);
  assert.equal((await post('/api/auth/reset', { token: 'x'.repeat(43), password: 'Mais-Uma-Senha-2026' })).status, 400);
});

test('senha colada com espaço no começo ou no fim entra do mesmo jeito (cadastro guarda a senha limpa)', async () => {
  for (const [i, pw] of ['Senha-Forte-2026 ', '  Senha-Forte-2026', 'Senha-Forte-2026'].entries()) {
    const email = `espaco${i}@exemplo.com`;
    const s = await post('/api/auth/signup', { salon_name: `Salão ${i}`, owner_name: 'Dono Teste', phone: '44999990000', email, password: 'Senha-Forte-2026 ', terms: true });
    assert.equal(s.status, 200);
    assert.equal((await post('/api/auth/login', { email, password: pw })).status, 200, JSON.stringify(pw));
    assert.equal((await post('/api/auth/login', { email, password: 'Senha-Forte-2027' })).status, 401);
    sec.resetRateLimits();
  }
});

test('código de recuperação: só o dono do salão comercial, com o código certo e senha forte', async () => {
  const ok = { email: EMAIL, code: 'codigo-de-teste-bem-longo-123', password: 'Senha-Do-Codigo-2026' };
  assert.equal((await post('/api/auth/recover', { ...ok, code: 'errado-errado-errado' })).status, 401);
  assert.equal((await post('/api/auth/recover', { ...ok, email: 'espaco0@exemplo.com' })).status, 401); // não é o salão comercial
  assert.equal((await post('/api/auth/recover', { ...ok, password: 'curta' })).status, 422);
  assert.equal((await post('/api/auth/recover', ok)).status, 200);
  assert.equal((await post('/api/auth/login', { email: EMAIL, password: 'Senha-Do-Codigo-2026' })).status, 200);
});
