// Limpeza total antes do lançamento: apaga usuários, anúncios e fotos; o app continua funcionando.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://spacehour:spacehour@localhost:5432/spacehour_test';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED ??= 'true'; // limites de tentativas têm teste próprio
if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Banco de testes precisa terminar em _test');

const { dropAll, migrate, one, pool } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const repo = await import('../src/repo.js');
const { createApp } = await import('../src/app.js');
const { signToken } = await import('../src/auth.js');

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let base = '';
before(async () => {
  await dropAll();
  await migrate(false);
  await seed();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async () => {
  server.close();
  await pool.end();
});

const count = async (table: string) => (await one<{ n: number }>(pool, `SELECT count(*)::int AS n FROM ${table}`))!.n;

test('começar do zero: só admin, com senha e frase; apaga usuários, anúncios e fotos e mantém o app', async () => {
  const admin = (await repo.getUserByEmail(pool, 'admin@spacehour.demo'))!;
  const guest = (await repo.getUserByEmail(pool, 'locatario@spacehour.demo'))!;
  await pool.query("INSERT INTO uploads (id, owner_id, mime, size, data, url, created_at) VALUES ('img_x', $1, 'image/png', 3, 'abc', '/api/uploads/img_x', now())", [admin.id]);
  const call = (tok: string, body: unknown) => fetch(`${base}/admin/reset-all-data`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(body) });
  const adminTok = signToken(admin);

  assert.equal((await call(signToken(guest), { password: 'demo12345', confirm: 'APAGAR TUDO' })).status, 403, 'só admin');
  assert.equal((await call(adminTok, { password: 'demo12345', confirm: 'apagar' })).status, 422, 'frase errada');
  assert.equal((await call(adminTok, { password: 'errada', confirm: 'APAGAR TUDO' })).status, 401, 'senha errada');
  assert.ok((await count('users')) > 0 && (await count('listings')) > 0 && (await count('bookings')) > 0);

  const r = await call(adminTok, { password: 'demo12345', confirm: 'apagar tudo' });
  assert.equal(r.status, 200, await r.clone().text());
  const out = await r.json() as { users: number; listings: number; photos: number };
  assert.ok(out.users > 0 && out.listings > 0 && out.photos >= 1);
  for (const t of ['users', 'listings', 'bookings', 'uploads', 'notifications', 'mp_accounts', 'reviews', 'messages']) assert.equal(await count(t), 0, t);
  assert.ok((await count('schema_migrations')) > 0, 'migrações preservadas');

  // sessão antiga não vale mais; o app continua: novo cadastro funciona e a busca responde vazia
  assert.equal((await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${adminTok}` } })).status, 401);
  const reg = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Novo Começo', email: 'novo@example.com', password: 'senha-forte-1', countryCode: 'BR', locale: 'pt-BR', acceptTerms: true, confirmAge: true }) });
  assert.equal(reg.status, 201);
  assert.deepEqual(await (await fetch(`${base}/listings?country=BR`)).json(), []);
});

test('começar do zero é recusado quando já há muitos cadastros', async () => {
  const R = await import('../src/reset.js');
  for (let i = 0; i <= R.RESET_MAX_USERS; i++) {
    await pool.query("INSERT INTO users (id, email, password_hash, name, country_code, locale) VALUES ($1, $2, 'x', 'Usuário', 'BR', 'pt-BR')", [`usr_many${i}`, `many${i}@example.com`]);
  }
  const reg = await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'novo@example.com', password: 'senha-forte-1' }) })).json() as { user: { id: string } };
  await pool.query("UPDATE users SET roles = '{admin,guest}', email_verified_at = now() WHERE id = $1", [reg.user.id]);
  const u = (await repo.getUser(pool, reg.user.id))!;
  const r = await fetch(`${base}/admin/reset-all-data`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(u)}` }, body: JSON.stringify({ password: 'senha-forte-1', confirm: 'APAGAR TUDO' }) });
  assert.equal(r.status, 409);
  assert.ok((await count('users')) > R.RESET_MAX_USERS);
});
